# CredX Deployment Notes

## Current status
- API builds and runs
- Admin portal builds and uses live API data
- Stripe is intentionally deferred for now
- Railway is the selected deployment path

## Environment layout
You can place environment variables in either:
- `credx-platform/.env`
- `credx-platform/apps/api/.env`
- `credx-platform/apps/web/.env`

The API loads env files from both the monorepo root and `apps/api`, so root-level deployment env files work correctly.

## Minimum API env required now
Use `apps/api/.env.example` or root `.env.example` as the source.

Required to run the current API:
- `PORT`
- `APP_URL`
- `API_URL`
- `JWT_SECRET`
- `DATABASE_URL`

Production safety rules:
- set `NODE_ENV=production`
- do not use `JWT_SECRET=change-me`
- do not leave `APP_URL` or `API_URL` pointing at `localhost`

Useful now:
- `LEAD_NOTIFICATION_EMAIL`
- `FROM_EMAIL`

Optional signup event trigger:
- `OPENCLAW_SIGNUP_WEBHOOK_URL`
- `OPENCLAW_SIGNUP_WEBHOOK_TOKEN`
- `OPENCLAW_SIGNUP_CHANNEL`
- `OPENCLAW_SIGNUP_TO`
- `OPENCLAW_SIGNUP_AGENT_ID`
- `OPENCLAW_SIGNUP_TIMEOUT_MS`

Point `OPENCLAW_SIGNUP_WEBHOOK_URL` at your Gateway `/hooks/agent` endpoint when you expose hooks. This lets a successful signup trigger an immediate OpenClaw-to-Telegram owner alert without relying on cron.

Optional and safe to leave blank for now:
- Stripe vars
- SendGrid vars
- AWS/S3 vars
- DocuSign vars
- credit score API vars

## Minimum web env required now
Create `apps/web/.env` with:

```env
VITE_API_URL=https://api.credxme.com
```

In production, `VITE_API_URL` must be set. The admin portal now fails fast instead of silently calling `localhost`.

For local dev:

```env
VITE_API_URL=http://localhost:3000
```

## Railway-ready scripts
From `credx-platform/`:

```bash
npm install
npm run prisma:generate
npm run build
npm run start:api
npm run start:web
npm run railway:dbpush
```

## Railway deployment plan
Use **two Railway services** from the same repo:

### Service 1: API
Recommended root directory: `credx-platform`

Set these Railway variables before first boot:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://credxme.com
API_URL=https://api.credxme.com
JWT_SECRET=<strong-random-secret>
DATABASE_URL=<Railway Postgres URL>
FROM_EMAIL=contact@credxme.com
LEAD_NOTIFICATION_EMAIL=jmalloy@credxme.com
```

Build command:

```bash
npm install && npm run prisma:generate && npm run build:api
```

Start command:

```bash
npm run start:api
```

After setting `DATABASE_URL`, run once in Railway shell or as a one-time command:

```bash
npm run railway:dbpush
```

Health check path:

```text
/health
```

### Service 2: Admin web
Recommended root directory: `credx-platform`

Set this Railway variable:

```env
VITE_API_URL=https://api.credxme.com
```

Build command:

```bash
npm install && npm run build:web
```

Start command:

```bash
npm run start:web
```

The web app now uses a Node static server in `apps/web/server.mjs`, which works with Railway's `PORT` environment variable.

## Domain recommendation
Best practical setup on Railway:
- API service → `api.credxme.com`
- Admin web service → either `admin.credxme.com` or reverse-proxied to `credxme.com/adminportal/`

Important note:
- the web build currently uses base path `/adminportal/`
- that is perfect if you are serving it at `credxme.com/adminportal/`
- if you want a dedicated subdomain like `admin.credxme.com`, I should switch the Vite base to `/`

## Database
Current API routes require Postgres via `DATABASE_URL`.

Before first real deploy:

```bash
npm run railway:dbpush
```

You can move to migrations later when you want stricter release flow.

## Railway checklist
1. Create Railway Postgres
2. Create Railway API service from this repo
3. Set API env vars
4. Run `npm run railway:dbpush`
5. Confirm `/health` passes
6. Create Railway web service from this repo
7. Set `VITE_API_URL`
8. Attach domains
9. Verify admin login and live data loading

## Still deferred
- Stripe live billing
- real email provider delivery
- file upload storage
- DocuSign integration
- credit report API integration
