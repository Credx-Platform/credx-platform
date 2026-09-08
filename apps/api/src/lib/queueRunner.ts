import { config } from '../config.js';
import {
  claimNextJob,
  completeJob,
  failJob,
  heartbeatWorker,
  type QueueName
} from './queue.js';
import { dispatchJob } from './jobs.js';

/**
 * DB-backed queue worker loop.
 *
 * Polls the JobQueue table for claimable jobs across the configured queues,
 * dispatches them to registered handlers, and records success/failure with
 * exponential backoff (handled in lib/queue.ts::failJob). Emits a worker
 * heartbeat so /health/queue can show liveness.
 *
 * Runs either in-process (started from index.ts unless QUEUE_INPROCESS=0) or as
 * a standalone process (src/worker.ts). Job claiming uses a transactional
 * row update, so multiple runners are safe.
 */

export const DEFAULT_QUEUES: QueueName[] = [
  'emails',
  'reports',
  'analysis',
  'notifications',
  'billing',
  'disputes',
  'webhooks'
];

export interface RunnerOptions {
  queues?: QueueName[];
  workerId?: string;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  hostname?: string;
}

export class QueueRunner {
  private readonly queues: QueueName[];
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly hostname?: string;

  private running = false;
  private stopping = false;
  private loopPromise?: Promise<void>;
  private lastHeartbeatAt = 0;
  private wakeSleep?: () => void;

  constructor(opts: RunnerOptions = {}) {
    this.queues = opts.queues ?? DEFAULT_QUEUES;
    this.workerId = opts.workerId ?? config.workerId;
    this.pollIntervalMs = opts.pollIntervalMs ?? Number(process.env.QUEUE_POLL_MS ?? 3000);
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? Number(process.env.QUEUE_HEARTBEAT_MS ?? 15000);
    this.hostname = opts.hostname ?? process.env.HOSTNAME ?? undefined;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.loopPromise = this.loop();
    console.log(`[queue] runner ${this.workerId} started for [${this.queues.join(', ')}]`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopping = true;
    this.wakeSleep?.();
    // Bounded wait: never let shutdown hang on an in-flight job.
    await Promise.race([
      this.loopPromise?.catch(() => undefined),
      new Promise((resolve) => {
        const t = setTimeout(resolve, Number(process.env.QUEUE_STOP_TIMEOUT_MS ?? 10000));
        if (typeof t.unref === 'function') t.unref();
      })
    ]);
    this.running = false;
    console.log(`[queue] runner ${this.workerId} stopped`);
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      let didWork = false;
      try {
        await this.maybeHeartbeat();
        for (const queue of this.queues) {
          if (this.stopping) break;
          const processed = await this.drainOne(queue);
          didWork = didWork || processed;
        }
      } catch (err) {
        // A loop-level failure (e.g. DB unreachable) must not kill the worker.
        console.error('[queue] loop error', err instanceof Error ? err.message : err);
      }
      if (!didWork) {
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  private async drainOne(queue: QueueName): Promise<boolean> {
    let job;
    try {
      job = await claimNextJob(queue, this.workerId);
    } catch (err) {
      console.error(`[queue] claim failed for ${queue}`, err instanceof Error ? err.message : err);
      return false;
    }
    if (!job) return false;

    const started = Date.now();
    try {
      const result = await dispatchJob(job.queueName, job.jobName, (job.payload ?? {}) as Record<string, unknown>);
      await completeJob(job.id, isRecord(result) ? result : { ok: true });
      console.log(`[queue] ${queue}:${job.jobName} ok in ${Date.now() - started}ms (job ${job.id})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(job.id, message).catch(() => undefined);
      console.error(`[queue] ${queue}:${job.jobName} failed: ${message} (job ${job.id})`);
    }
    return true;
  }

  private async maybeHeartbeat(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeatAt < this.heartbeatIntervalMs) return;
    this.lastHeartbeatAt = now;
    try {
      await heartbeatWorker(this.workerId, this.queues[0], this.hostname);
    } catch {
      // heartbeat is advisory only
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.wakeSleep = undefined;
        resolve();
      }, ms);
      // Don't keep the event loop alive purely for the poll timer.
      if (typeof t.unref === 'function') t.unref();
      // Allow stop() to interrupt the poll delay immediately.
      this.wakeSleep = () => {
        clearTimeout(t);
        this.wakeSleep = undefined;
        resolve();
      };
    });
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

let inProcessRunner: QueueRunner | undefined;

/**
 * Start an in-process runner unless explicitly disabled. Called from index.ts.
 * Keeping it on by default means queued work never silently piles up when no
 * standalone worker is deployed; set QUEUE_INPROCESS=0 once a dedicated worker
 * process exists.
 */
export function startInProcessRunner(): QueueRunner | undefined {
  if (String(process.env.QUEUE_INPROCESS ?? '1') === '0') {
    console.log('[queue] in-process runner disabled (QUEUE_INPROCESS=0)');
    return undefined;
  }
  if (String(process.env.QUEUE_MODE || '').toLowerCase() === 'inline') {
    console.log('[queue] QUEUE_MODE=inline — producers run synchronously, no runner needed');
    return undefined;
  }
  if (inProcessRunner) return inProcessRunner;
  inProcessRunner = new QueueRunner({ workerId: `${config.workerId}-inproc` });
  inProcessRunner.start();
  return inProcessRunner;
}

export function getInProcessRunner(): QueueRunner | undefined {
  return inProcessRunner;
}
