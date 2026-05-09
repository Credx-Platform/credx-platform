import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { contractsRouter } from './routes/contracts.js';
import { applicationsRouter } from './routes/applications.js';
import { monitoringRouter } from './routes/monitoring.js';
import { usersRouter } from './routes/users.js';
import { leadsRouter } from './routes/leads.js';
import { clientsRouter } from './routes/clients.js';
import { disputesRouter } from './routes/disputes.js';
import { lobRouter } from './routes/lob.js';
import { responseIngestRouter } from './routes/responseIngest.js';
import { billingRouter } from './routes/billing.js';
import { progressRouter } from './routes/progress.js';
import { masterclassRouter } from './routes/masterclass.js';

const app = express();

// Railway terminates TLS at its edge proxy; without trust proxy=1 the rate
// limiter sees the proxy IP for every request and the limit becomes global.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'https://credxme.com,https://www.credxme.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server, curl, mobile
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (config.nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true);
    }
    // Disallow without throwing — browser still blocks (no ACAO header) but
    // the response stays a clean 204/200 instead of a noisy 500.
    return cb(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in a few minutes.' }
});
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this IP. Please slow down.' }
});

app.use(globalLimiter);

app.get('/', (_req, res) => {
  res.json({ name: 'CredX API', status: 'running', version: '0.1.0' });
});

app.use('/health', healthRouter);

// Stricter limits on unauthenticated, abuse-prone endpoints. These are mounted
// before the routers so they apply on top of the global limiter.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/password-setup', authLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/password-setup', authLimiter);
app.use('/api/leads', leadLimiter);
app.use('/api/v1/leads', leadLimiter);

function mountAll(prefix: string) {
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/contracts`, contractsRouter);
  app.use(`${prefix}/applications`, applicationsRouter);
  app.use(`${prefix}/monitoring`, monitoringRouter);
  app.use(`${prefix}/users`, usersRouter);
  app.use(`${prefix}/leads`, leadsRouter);
  app.use(`${prefix}/clients`, clientsRouter);
  app.use(`${prefix}/disputes`, disputesRouter);
  app.use(`${prefix}/disputes/lob`, lobRouter);
  app.use(`${prefix}/disputes/response`, responseIngestRouter);
  app.use(`${prefix}/billing`, billingRouter);
  app.use(`${prefix}/progress`, progressRouter);
  app.use(`${prefix}/masterclass`, masterclassRouter);
}

mountAll('/api');
mountAll('/api/v1');

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`CredX API listening on port ${config.port}`);
});
