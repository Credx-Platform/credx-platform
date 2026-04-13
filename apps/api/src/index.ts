import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { leadsRouter } from './routes/leads.js';
import { clientsRouter } from './routes/clients.js';
import { disputesRouter } from './routes/disputes.js';
import { billingRouter } from './routes/billing.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.get('/', (_req, res) => {
  res.json({ name: 'CredX API', status: 'running', version: '0.1.0' });
});

app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/billing', billingRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`CredX API listening on port ${config.port}`);
});
