# Disaster Recovery

> **Fresh evidence, September 7, 2026:** an existing 10:52 UTC dump restored
> successfully into isolated PostgreSQL 18 (31 public tables; one completed
> migration in that snapshot). PG16 restore tooling rejected format 1.16.
> Current production has later migrations; take a fresh pre-migration backup.
> This test does not independently verify scheduled execution, retention, or RTO.
> See `LAUNCH_HARDENING_2026-09-07.md`; later-dated historical claims below
> are not a substitute for current evidence.

## Database Failure

**Status (verified 2026-09-08):**

| Item | Value |
| --- | --- |
| Automated backups | Nightly logical `pg_dump` (custom format) at **03:30 daily** via cron |
| Script | `/home/ubuntu/backups/credx-db/backup.sh` (host cron, not in this repo) |
| Retention | **14 days** (older dumps pruned automatically) |
| Backup location | `/home/ubuntu/backups/credx-db/` on the ops host (off-Railway) |
| Credentials | Pulled fresh from Railway at run time via `railway variables`; never stored |
| Restore test | **Passed** — full `pg_restore` into a scratch DB verified 2026-09-08 |
| Owner | James (OpenClaw owner) |
| RPO | ≤ 24h (nightly logical dump) |
| RTO | ~30–60 min (restore into a fresh DB + repoint `DATABASE_URL` + redeploy) |

Point-in-time recovery: **enabled and verified 2026-09-08**. Live Postgres logs
showed a completed full backup, successful WAL uploads, zero archive failures,
and zero WAL lag. Dashboard warnings must be checked against live archival
evidence before credentials are regenerated.

Remaining target improvements:

- Complete the protected GPG/rclone setup described in
  `docs/PRODUCTION_SAFETY.md`, then enable the supplied systemd timer.
- Add failure notification delivery for the backup service and monthly recovery
  drill.

### Backup runbook (to be confirmed against Railway settings by James)

1. **On-demand logical backup** (run before any migration or risky change):
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
     --file "credx-$(date +%Y%m%dT%H%M%SZ).dump"
   ```
   Store off-Railway (e.g. encrypted bucket). Never commit dumps.
2. **Scheduled backups**: a host cron runs `/home/ubuntu/backups/credx-db/backup.sh`
   at 03:30 daily — logical `pg_dump` (custom format) with 14-day retention,
   connection string pulled fresh from Railway. Dumps land in
   `/home/ubuntu/backups/credx-db/`. Verify `backup.log` for recent success.
3. **Restore to a scratch database** (verification / recovery):
   ```bash
   createdb credx_restore_test
   pg_restore --no-owner --no-privileges --dbname credx_restore_test credx-<ts>.dump
   ```
4. **Restore to production** (owner-approved, last resort): put the API into
   maintenance, restore into a fresh database, repoint `DATABASE_URL`, redeploy,
   run `/health/db`.
5. **Test cadence**: perform step 3 at least monthly and record the result.

### Migration rollback

Migrations added in the SaaS transformation are additive and idempotent
(`20260907120000_saas_transformation_additive`). If a deploy that ran it must be
reverted:

- Application rollback (redeploy previous image) is sufficient — the new tables
  and nullable columns are inert to old code.
- Only if the new objects must be physically removed, hand-write a down-migration
  that `DROP`s exactly the objects listed in that migration's header. Do not drop
  pre-existing tables/columns.

## Deployment Failure

Use Railway's previous successful deployment rollback/redeploy capability. Run `/health` for API and `/` for web after rollback.

## Redis Failure

Redis is not used. The job queue (`lib/queue.ts` / `lib/queueRunner.ts`) is
Postgres-backed. If the DB is degraded the runner logs and retries with backoff;
producers (`enqueueJob`) fall back to inline execution or drop-and-log and never
fail the originating request. A future Redis addition must keep this degrade
path — pause background jobs, never take down web/API.

## AI Provider Outage

Cesar and analysis features should fail gracefully. Non-AI dashboard, billing, auth, and static pages should remain available.

## Email Provider Outage

Email sends currently try multiple providers. Future queueing should retry with backoff and prevent duplicate sends.

## Object Storage Outage

Document upload/access may fail. Core app should remain online. Do not store critical customer documents only on ephemeral server disk.

## Payment Webhook Failure

Stripe + PayPal webhooks flow through `processWebhookWithLedger` — every event is
recorded in `WebhookEvent`, deduped on the provider event id, replays
short-circuit, and processing failures are marked `RETRYING` / `DEAD_LETTER` so
the provider can safely re-deliver. To recover a missed event: re-send it from
the provider dashboard (idempotent), or inspect `WebhookEvent` rows with status
`FAILED` / `DEAD_LETTER` and reprocess. Full payment reconciliation (comparing
provider records to `Payment` / `Invoice`) still needs a formal procedure.
