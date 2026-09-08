# CredX Platform

Monorepo for CredX, a credit intelligence and financial readiness platform with a consumer portal, staff CRM, education workflows, credit-report analysis, dispute-workflow support, billing, email, and document handling.

## Apps
- `apps/api`: Express + TypeScript backend
- `apps/web`: React + Vite frontend and static public pages
- `packages/db`: Prisma schema/client
- `packages/shared`: shared types and validation
- `packages/email`: email helpers/templates

## Getting started
1. Copy `.env.example` to `.env`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate`
5. Start API: `npm run dev`

## Production Notes

- Current Railway manifests split web and API concerns: `railway.web.json` builds/starts the web app, and `railway.api.json` builds/starts the API.
- The checked-in `railway.json` is web-shaped. Before `railway up --service @credx/api`, use the API-shaped manifest or update `railway.json` to build `npm run build:api`, start `npm run start:api`, and health-check `/health`.
- Never commit `.env` files or hardcoded database URLs. Local smoke tests must read `DATABASE_URL` from the environment.
