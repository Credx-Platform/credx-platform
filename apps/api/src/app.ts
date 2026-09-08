import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { sanitizeJsonResponses } from './middleware/sanitize.js';
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
import { compatibilityRouter } from './routes/compatibility.js';
import { cesarRouter } from './routes/cesar.js';
import { subAgentsRouter } from './routes/subAgents.js';
import { emailEventsRouter } from './routes/emailEvents.js';
import { creditScoreRouter } from './routes/creditScore.js';
import { orgRouter } from './routes/org.js';
import { fundingReadinessRouter } from './routes/fundingReadiness.js';
import { businessCreditRouter } from './routes/businessCredit.js';
import { notificationsRouter } from './routes/notifications.js';
import { checkinRouter } from './routes/checkin.js';
import { platformReportsRouter } from './routes/platformReports.js';
import { aiRouter } from './routes/ai.js';

export interface CreateAppOptions {
  /** Disable rate limiters (tests / load harness). */
  disableRateLimits?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Railway terminates TLS at its edge proxy; without trust proxy=1 the rate
  // limiter sees the proxy IP for every request and the limit becomes global.
  app.set('trust proxy', 1);

  // The API returns JSON and never renders a document, so it can carry the
  // strictest possible policy: nothing is allowed to load, and no page may
  // frame an API response. This costs nothing and removes the "CSP absent"
  // finding on the API surface.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"]
      }
    },
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

  app.use(express.json({
    limit: '2mb',
    // Webhook signature verification (Stripe, PayPal) needs the raw bytes the
    // processor signed — keep them alongside the parsed body.
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    }
  }));

  app.use(sanitizeJsonResponses);

  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/v1/health', healthRouter);

  const noop: express.RequestHandler = (_req, _res, next) => next();
  const mk = (opts: Parameters<typeof rateLimit>[0]) => (options.disableRateLimits ? noop : rateLimit(opts));

  const globalLimiter = mk({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
  const authLimiter = mk({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many auth attempts. Try again in a few minutes.' }
  });
  const cesarLimiter = mk({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { source: 'rate_limited', reply: "You're sending messages a little fast — give me a moment and try again.", html: "You're sending messages a little fast — give me a moment and try again." }
  });
  const leadLimiter = mk({
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

  // Stricter limits on unauthenticated, abuse-prone endpoints.
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/password-setup', authLimiter);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/password-setup', authLimiter);
  app.use('/api/leads', leadLimiter);
  app.use('/api/v1/leads', leadLimiter);
  app.use('/api/cesar', cesarLimiter);
  app.use('/api/v1/cesar', cesarLimiter);

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
    app.use(`${prefix}/compatibility`, compatibilityRouter);
    app.use(`${prefix}/cesar`, cesarRouter);
    app.use(`${prefix}/sub-agents`, subAgentsRouter);
    app.use(`${prefix}/email-events`, emailEventsRouter);
    app.use(`${prefix}/credit-score`, creditScoreRouter);
    app.use(`${prefix}/org`, orgRouter);
    app.use(`${prefix}/funding-readiness`, fundingReadinessRouter);
    app.use(`${prefix}/business-credit`, businessCreditRouter);
    app.use(`${prefix}/notifications`, notificationsRouter);
    app.use(`${prefix}/checkin`, checkinRouter);
    app.use(`${prefix}/reports`, platformReportsRouter);
    app.use(`${prefix}/ai`, aiRouter);
  }

  mountAll('/api');
  mountAll('/api/v1');

  app.use(errorHandler);

  return app;
}
