import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { registerAllJobs } from './lib/jobHandlers.js';
import { startInProcessRunner } from './lib/queueRunner.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`CredX API listening on port ${config.port}`);
});

// SaaS Upgrade: background job queue. Register handlers and (unless disabled)
// run the poll loop in-process so queued email/report/readiness work is
// actually drained even when no dedicated worker service is deployed.
registerAllJobs();
const queueRunner = startInProcessRunner();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down gracefully`);
  server.close();
  try {
    await queueRunner?.stop();
  } catch { /* noop */ }
  try {
    await prisma.$disconnect();
  } catch { /* noop */ }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
