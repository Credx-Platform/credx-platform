#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const workspaceRoot = resolve(repoRoot, '..');
const statePath = resolve(workspaceRoot, 'memory', 'credx-ops-cron-state.json');

[
  resolve(repoRoot, '.env'),
  resolve(repoRoot, '.env.local'),
  resolve(repoRoot, 'apps/api/.env'),
  resolve(repoRoot, 'apps/api/.env.local')
].forEach((path) => {
  if (existsSync(path)) dotenv.config({ path, override: false });
});

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const mode = process.argv[2] || 'signup-watch';

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Unknown client';
}

function onboardingStep(client) {
  const progress = client.progress || {};
  const onboarding = progress.onboarding && typeof progress.onboarding === 'object' ? progress.onboarding : {};
  const workflow = progress.workflow && typeof progress.workflow === 'object' ? progress.workflow : {};
  const stage = String(workflow.stage || onboarding.status || '').replace(/_/g, ' ').trim();

  if (stage.includes('signup received')) return 'intake pending';
  if (stage === 'pending') return 'intake pending';
  if (stage) return stage;
  return 'intake';
}

function compactStatus(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function contactName(contact) {
  return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || contact?.email || contact?.phone || 'Unknown lead';
}

function shanghaiDayWindow(now = new Date()) {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + shanghaiOffsetMs);
  const startLocalUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocalUtcMs - shanghaiOffsetMs);
  return { start, end: now };
}

function formatJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function latestClientCreatedAt() {
  const latest = await prisma.client.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return latest?.createdAt?.toISOString() || new Date().toISOString();
}

async function signupWatch() {
  const state = readState();

  if (!state.lastSignupSeenAt) {
    const bootstrapAt = await latestClientCreatedAt();
    writeState({ ...state, lastSignupSeenAt: bootstrapAt, bootstrappedAt: new Date().toISOString() });
    formatJson({ status: 'bootstrapped', message: 'Signup watcher initialized; no historical alerts sent.' });
    return;
  }

  const since = new Date(state.lastSignupSeenAt);
  const clients = await prisma.client.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
    include: { user: true, progress: true }
  });

  if (!clients.length) {
    formatJson({ status: 'quiet', message: 'No new CredX signups.' });
    return;
  }

  const lines = clients.map((client) => `New lead - ${fullName(client.user)} ${onboardingStep(client)}`);
  const latestSeenAt = clients.reduce(
    (latest, client) => (client.createdAt > latest ? client.createdAt : latest),
    since
  ).toISOString();

  writeState({
    ...state,
    lastSignupSeenAt: latestSeenAt,
    lastSignupAlertAt: new Date().toISOString(),
    lastSignupAlertClientIds: clients.map((client) => client.id)
  });

  formatJson({
    status: 'notify',
    count: clients.length,
    message: lines.join('\n'),
    signups: clients.map((client) => ({
      id: client.id,
      name: fullName(client.user),
      email: client.user.email,
      step: onboardingStep(client),
      createdAt: client.createdAt.toISOString()
    }))
  });
}

async function dailyReport() {
  const { start, end } = shanghaiDayWindow();
  const [newClients, updatedClients, leads, subAgentContacts, openTasks, completedTasks, activityEvents, auditLogs] = await Promise.all([
    prisma.client.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
      include: { user: true, progress: true }
    }),
    prisma.client.findMany({
      where: { updatedAt: { gte: start, lte: end } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { user: true, progress: true }
    }),
    prisma.lead.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } }),
    prisma.subAgentContact.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { subAgent: true }
    }),
    prisma.task.findMany({
      where: { completed: false },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 20,
      include: { client: { include: { user: true } } }
    }),
    prisma.task.findMany({
      where: { completed: true, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { client: { include: { user: true } } }
    }),
    prisma.activityEvent.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { client: { include: { user: true } } }
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
  ]);

  const newClientIds = new Set(newClients.map((client) => client.id));
  const updatedExistingClients = updatedClients.filter((client) => !newClientIds.has(client.id));
  const clientAuditLogs = auditLogs.filter(
    (log) => ['Client', 'Task', 'ActivityEvent'].includes(log.entityType) && !String(log.action).includes('DELETED')
  );

  const clientActivity = [
    ...activityEvents.map((event) => `${fullName(event.client.user)}: ${event.message}`),
    ...completedTasks.map((task) => `Completed task: ${task.title} for ${fullName(task.client.user)}`),
    ...updatedExistingClients.map(
      (client) => `Updated client: ${fullName(client.user)} (${compactStatus(client.status)}; ${onboardingStep(client)})`
    ),
    ...clientAuditLogs.map((log) => `Admin activity: ${compactStatus(log.action)} on ${compactStatus(log.entityType)}`)
  ];

  const leadActivity = [
    ...newClients.map((client) => `New client signup: ${fullName(client.user)} (${onboardingStep(client)})`),
    ...leads.map((lead) => `New lead form: ${fullName(lead)} (${lead.offerInterest || 'program'})`),
    ...subAgentContacts.map((contact) => {
      const source = contact.subAgent?.name ? ` via ${contact.subAgent.name}` : '';
      return `Sub-agent lead: ${contactName(contact)} (${compactStatus(contact.status) || 'tracked'}${source})`;
    })
  ];

  const followUps = [
    ...openTasks.slice(0, 8).map((task) => `Follow up: ${task.title} for ${fullName(task.client.user)}`),
    ...updatedClients
      .filter((client) => onboardingStep(client).includes('pending'))
      .slice(0, 8)
      .map((client) => `Move ${fullName(client.user)} through ${onboardingStep(client)}`)
  ];

  formatJson({
    status: 'report',
    window: { start: start.toISOString(), end: end.toISOString(), timezone: 'Asia/Shanghai' },
    counts: {
      newClientSignups: newClients.length,
      leadForms: leads.length,
      subAgentContacts: subAgentContacts.length,
      updatedClients: updatedClients.length,
      activityEvents: activityEvents.length,
      openTasks: openTasks.length,
      auditLogs: auditLogs.length
    },
    message: [
      'CredX daily review',
      '',
      'Client activity:',
      ...(clientActivity.length ? clientActivity.map((item) => `- ${item}`) : ['- No client activity recorded today.']),
      '',
      'Leads:',
      ...(leadActivity.length ? leadActivity.map((item) => `- ${item}`) : ['- No new leads recorded today.']),
      '',
      'Next-day follow-ups:',
      ...(followUps.length ? followUps.map((item) => `- ${item}`) : ['- Review new leads, onboarding stalls, and any manual follow-ups in the admin portal.'])
    ].join('\n')
  });
}

/**
 * Enqueue (or, if the queue/runner is unavailable, directly run) the batch that
 * regenerates every active client's CredX Readiness Score snapshot. Intended to
 * run on a schedule, e.g. crontab:
 *   0 6 * * *  cd /path/to/credx-platform && node scripts/credx-ops-cron.mjs readiness-snapshots
 */
async function readinessSnapshots() {
  // Preferred path: drop a job row; the API's in-process queue runner drains it.
  try {
    const { enqueue } = await import('../apps/api/dist/lib/queue.js');
    const job = await enqueue('analysis', 'readiness-snapshot-all', { source: 'cron' });
    formatJson({ status: 'enqueued', jobId: job.id, queue: 'analysis', job: 'readiness-snapshot-all' });
    return;
  } catch (enqueueErr) {
    // Fall through to running it inline.
    formatJson({ status: 'enqueue_failed_running_inline', reason: String(enqueueErr?.message || enqueueErr) });
  }

  const { generateAllReadinessSnapshots } = await import('../apps/api/dist/lib/readinessSnapshots.js');
  const results = await generateAllReadinessSnapshots();
  formatJson({ status: 'generated', count: results.length });
}

try {
  if (mode === 'signup-watch') await signupWatch();
  else if (mode === 'daily-report') await dailyReport();
  else if (mode === 'readiness-snapshots') await readinessSnapshots();
  else throw new Error(`Unknown mode: ${mode}`);
} finally {
  await prisma.$disconnect();
}
