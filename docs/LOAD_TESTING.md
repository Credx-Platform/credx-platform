# Load Testing

## Rule

Do not load-test production. `scripts/loadtest.mjs` **hard-refuses** any target
that is not `localhost` / `127.0.0.1` / a private (RFC1918) address — there is no
override flag.

## Harness

`scripts/loadtest.mjs` — zero-dependency (Node built-in `fetch` + a worker pool).
No external binary, no install.

```bash
npm run loadtest -- <scenario> [--users N] [--duration S] [--target URL] [--token JWT]
```

| Scenario   | Endpoints hit (all read-only, no writes) |
| ---------- | ---------------------------------------- |
| `health`   | `GET /health`, `/health/db`, `/health/queue` |
| `readonly` | `health` + `GET /` + `GET /api/billing/plans` |
| `authed`   | `GET /api/progress/me`, `/api/funding-readiness`, `/api/business-credit` (needs `--token`) |
| `mixed`    | weighted blend of all of the above |

Defaults: `--users 50 --duration 15 --target http://localhost:3000`. The script
exits non-zero if the 5xx/connection error rate exceeds 1%.

### Running against a local API

```bash
# 1. throwaway DB
docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=credx_test \
  -p 55432:5432 postgres:16-alpine
export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/credx_test
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# 2. build + boot the API with limits off (LOCAL ONLY)
npm run build:api
DISABLE_RATE_LIMITS=1 NODE_ENV=development QUEUE_INPROCESS=0 PORT=3000 \
  JWT_SECRET=test APP_URL=http://localhost:5173 API_URL=http://localhost:3000 \
  node apps/api/dist/index.js &

# 3. load test
npm run loadtest -- readonly --users 100 --duration 10 --target http://localhost:3000
```

`DISABLE_RATE_LIMITS=1` is honored **only** when `NODE_ENV !== production`; it is
ignored in production so it can never weaken a real deployment.

For `authed`, mint a token for a seeded user with the same `JWT_SECRET`
(`jwt.sign({ sub, email, role: 'CLIENT' }, secret)`) and pass `--token`.

## Baseline (single local process, 2026-09-08)

`readonly`, 100 concurrent workers, 10s, one API process against local PG16:

| metric        | value |
| ------------- | ----: |
| requests      | ~40,000 |
| throughput    | ~4,000 req/s |
| error rate    | 0% |
| latency p50   | ~18 ms |
| latency p95   | ~53 ms |
| latency p99   | ~82 ms |

This is a single Node process with no clustering, no PgBouncer, and an in-repo
Postgres container — it establishes the shape, not a production capacity number.

## Target flows (not yet scripted — need seeded fixtures / a token pool)

- signup, login/logout, dashboard load, profile save, document upload,
  report analysis, Cesar message, billing checkout/webhook simulation,
  admin client list.

## Scenarios to run before scaling decisions

- 100 / 500 / 1,000 simulated users locally.
- 5,000 only after infra review (workers split out, PgBouncer, read replica).

## Metrics to capture

- p50 / p95 / p99 response time, error rate (harness reports these).
- DB connection count, slow queries (`pg_stat_statements`).
- CPU / memory, external provider timeout rate.
- Queue depth (`GET /health/queue`) once the worker is under load.
