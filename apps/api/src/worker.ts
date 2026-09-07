/**
 * CredX standalone queue worker.
 *
 * Usage:  node dist/worker.js   (prod)   |   npm run dev:worker   (local)
 *
 * Optional — the API also runs an in-process runner unless QUEUE_INPROCESS=0.
 * Deploy this as a separate Railway service once queue volume justifies it,
 * then set QUEUE_INPROCESS=0 on the API.
 */
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { registerAllJobs } from './lib/jobHandlers.js';
import { QueueRunner } from './lib/queueRunner.js';

registerAllJobs();

const runner = new QueueRunner({ workerId: config.workerId });
runner.start();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, draining...`);
  await runner.stop();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandledRejection', reason);
});
