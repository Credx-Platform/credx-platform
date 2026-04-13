# CredX Platform

Monorepo scaffold for the CredX credit repair portal and CRM.

## Apps
- `apps/api`: Express + TypeScript backend
- `apps/web`: placeholder for React + Vite frontend
- `packages/db`: Prisma schema/client
- `packages/shared`: shared types and validation
- `packages/email`: email helpers/templates

## Getting started
1. Copy `.env.example` to `.env`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate`
5. Start API: `npm run dev`
