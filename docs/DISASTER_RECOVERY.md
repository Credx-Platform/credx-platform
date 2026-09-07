# Disaster Recovery

## Database Failure

Current backup frequency, retention, and restore process are not documented in the repository. This is critical and must be verified in Railway/PostgreSQL provider settings.

Minimum target:

- automated daily backups
- point-in-time recovery where available
- tested restore procedure
- documented owner
- documented RPO/RTO

### Backup runbook (to be confirmed against Railway settings by James)

1. **On-demand logical backup** (run before any migration or risky change):
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
     --file "credx-$(date +%Y%m%dT%H%M%SZ).dump"
   ```
   Store off-Railway (e.g. encrypted bucket). Never commit dumps.
2. **Scheduled backups**: Railway Postgres plugin provides automated backups —
   confirm the schedule and retention window in the Railway dashboard and record
   them here. If not enabled, enable daily + 7-day retention at minimum.
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

Redis is not evident in the current architecture. Future queue-backed features should degrade by pausing background jobs, not by taking down web/API.

## AI Provider Outage

Cesar and analysis features should fail gracefully. Non-AI dashboard, billing, auth, and static pages should remain available.

## Email Provider Outage

Email sends currently try multiple providers. Future queueing should retry with backoff and prevent duplicate sends.

## Object Storage Outage

Document upload/access may fail. Core app should remain online. Do not store critical customer documents only on ephemeral server disk.

## Payment Webhook Failure

Webhook processing must be idempotent and replay-safe. Payment reconciliation procedure still needs to be formalized.
