import { config } from '../config.js';
import { enqueue, type QueueName, type EnqueueOptions } from './queue.js';

/**
 * Job handler registry + safe producer wrapper.
 *
 * The queue itself (lib/queue.ts) is DB-backed — no Redis required. This module
 * adds:
 *   - a name -> handler registry the runner (lib/queueRunner.ts) dispatches to
 *   - enqueueJob(), a producer wrapper that NEVER throws into a request path and
 *     degrades to inline execution when the DB enqueue fails or when
 *     QUEUE_MODE=inline is set.
 *
 * Design rule: enqueuing background work must never make a user-facing request
 * fail. The worst case is the job runs synchronously (slower) or is logged and
 * dropped (email/report retries are non-critical).
 */

export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown>;

export interface JobDefinition {
  queue: QueueName;
  name: string;
  handler: JobHandler;
}

const registry = new Map<string, JobDefinition>();

function key(queue: QueueName, name: string) {
  return `${queue}:${name}`;
}

export function registerJob(def: JobDefinition): void {
  registry.set(key(def.queue, def.name), def);
}

export function getJob(queue: string, name: string): JobDefinition | undefined {
  return registry.get(`${queue}:${name}`);
}

export function registeredJobNames(): string[] {
  return [...registry.keys()].sort();
}

/**
 * Run a job by (queue, name). Throws if no handler is registered so the runner
 * can mark the job FAILED and surface it.
 */
export async function dispatchJob(
  queue: string,
  name: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const def = getJob(queue, name);
  if (!def) {
    throw new Error(`No handler registered for job ${queue}:${name}`);
  }
  return def.handler(payload);
}

function inlineMode(): boolean {
  return String(process.env.QUEUE_MODE || '').toLowerCase() === 'inline';
}

export interface EnqueueJobOptions extends EnqueueOptions {
  /**
   * When the DB enqueue fails, run the handler inline instead of losing the
   * work. Defaults to true. Set false for jobs that are safe to drop-and-retry
   * later (and where inline latency would hurt the request).
   */
  fallbackInline?: boolean;
}

export interface EnqueueJobResult {
  status: 'queued' | 'inline' | 'dropped';
  jobId?: string;
  error?: string;
}

/**
 * Producer entrypoint. Safe to call from any request handler.
 */
export async function enqueueJob(
  queue: QueueName,
  name: string,
  payload: Record<string, unknown>,
  options: EnqueueJobOptions = {}
): Promise<EnqueueJobResult> {
  const fallbackInline = options.fallbackInline ?? true;

  if (inlineMode()) {
    return runInline(queue, name, payload, 'inline');
  }

  try {
    const job = await enqueue(queue, name, payload, options);
    return { status: 'queued', jobId: job.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('ENQUEUE_FAILED', { queue, name, error });
    if (fallbackInline) {
      return runInline(queue, name, payload, 'inline');
    }
    return { status: 'dropped', error };
  }
}

async function runInline(
  queue: QueueName,
  name: string,
  payload: Record<string, unknown>,
  status: 'inline'
): Promise<EnqueueJobResult> {
  try {
    await dispatchJob(queue, name, payload);
    return { status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('INLINE_JOB_FAILED', { queue, name, error });
    return { status: 'dropped', error };
  }
}

export { config as jobsConfig };
