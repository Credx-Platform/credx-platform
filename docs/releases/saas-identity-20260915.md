# SaaS persistence + product identity release — 2026-09-15

## Prepared release

- Branch: `release/saas-identity-20260915`.
- Application commit: `7d93531`.
- Durable portal baseline: `8c5275e`; identity commits reconciled as `93a934c` and `7d93531`.
- Preserves live document storage repair `5620093`, portrait/portal fade `3f2670d`, and neutral copy `1743b73`.
- External social profiles and payment processor settings are proposed copy only; not changed.

## Verification

- Combined API and web builds: PASS.
- Web route/security tests: 5/5 PASS.
- Database safety tests: 7/7 PASS.
- `git diff --check`: PASS.
- Prior durable baseline verification: 71/71 integration cases, 17/17 fresh-database migrations (no repeat claimed here).
- New production-snapshot rehearsal: restored the 2026-09-15 03:30 Asia/Shanghai logical dump successfully into isolated local PostgreSQL database `credx_release_restore_20260915`.
- Dump SHA-256: `607ec99d0a6f4cf5b3ab83003cb46dd7b20dcc5d288fbc1c7c6c14c1add07de5`.
- Additive `20260915090000_add_durable_saas_progress` SQL applied cleanly to that restored schema. No production schema or rows were changed.
- Snapshot migration ledger contains all existing repository migrations before the new durable migration, plus five historical August migrations absent from the repository. No failed ledger rows observed.

## Deployment gate (not deployed)

Checked live GitHub configuration: `MIGRATION_BRIDGE_COMPLETE=false` in the protected `production` environment; no repository or production-environment secrets are configured. The protected environment requires reviewer approval. `main` is not currently branch-protected.

The checked-in `production-release.yml` fails closed until the migration bridge is verified and its flag updated, and requires protected `PRODUCTION_DATABASE_URL`, `PRODUCTION_DATABASE_FINGERPRINT`, and `RAILWAY_TOKEN`. No flags, reviewers, or secret settings were bypassed or weakened. Existing application runtime credentials were not repurposed as a migration identity.

The snapshot suggests the old migration bridge flag may be stale, but local restore evidence alone is not a substitute for validating the exact live migration target and provisioning the protected release credentials. Finish that setup through protected credential entry, never chat. Refresh restore evidence if more than two hours old before production migration.

## Live release retained

- API deployment: `743f910e-f04a-4c2a-9e0a-de92b894ee4f` — SUCCESS, document repair.
- Web deployment: `115807e2-6745-4d27-82c9-1a33cec211f9` — SUCCESS, About fade.
- Live API health: HTTP 200 at 2026-09-14 19:32 UTC.
- `credxme.com` redirects to canonical website (308).
- No root `railway.json` exists in this release worktree; service settings retain API build/start and `/health`, and separate web build/start. Deploy API before web after guarded migration.

## Remaining launch evidence

Payment-provider sandbox lifecycle, actual inbox delivery, operational monitoring/recovery, and external descriptor/profile changes remain separate. Existing onboarding behavior is preserved. No charges, emails, dispute submissions, customer deletion, or production-file changes occurred during this preparation.
