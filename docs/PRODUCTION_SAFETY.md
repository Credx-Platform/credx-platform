# CredX Production Safety

## Non-negotiable controls

- Production credentials are available only to the protected GitHub `production`
  environment and the backup service.
- Application runtime credentials cannot create, alter, truncate, or drop schema
  objects. A separate migration identity is used only during an approved release.
- `migrate reset`, `migrate dev`, `db push`, schema drops, and truncation are
  permanently blocked against the production target.
- Every production migration requires an exact target fingerprint, explicit
  approval, and a restore-tested logical dump less than two hours old.
- API deploys before web. Both must pass health checks before the release is
  considered complete.

## Environment isolation

`CREDX_DATABASE_ENVIRONMENT` must be one of `local`, `staging`, or `production`.
The database guard fails closed when classification is missing. Staging must use
its own Postgres service; copying production's `DATABASE_URL` into staging is
prohibited.

Generate the safe target fingerprint without exposing credentials:

```bash
node -e "import('./scripts/lib/db-safety.mjs').then(({describeDatabaseTarget}) => console.log(describeDatabaseTarget(process.env.DATABASE_URL).fingerprint))"
```

Store the production fingerprint as a protected environment secret. Do not put
database URLs in repository variables, workflow inputs, documentation, or chat.

## Database roles

`ops/database/least-privilege.sql` is the rehearsable role/grant definition. It
creates `credx_schema_owner`, `credx_app`, and `credx_backup` as `NOLOGIN` roles,
transfers public-schema object ownership to the schema owner, and grants only
row-level DML or backup reads to the other roles. Login credential creation and
the Railway runtime switch are intentionally separate production changes.

Before activation, restore the latest production dump into a scratch PostgreSQL
18 instance, apply the SQL, prove `credx_app` can read/write rows, and prove it
cannot alter or drop schema objects. Do not apply this file directly from a
developer shell.

## GitHub setup required once

1. Protect `main`; require the `CredX CI / verify` check and at least one review.
2. Create a GitHub environment named `production` with required reviewers.
3. Add protected environment secrets for the production database fingerprint,
   migration URL, and Railway token using GitHub's secret-entry UI.
4. Add environment variables for the Railway project id, API URL, web URL, and
   keep `MIGRATION_BRIDGE_COMPLETE=false` until the incident bridge is applied
   and verified.
5. Disable direct Railway autodeploys from unprotected branches.

## Backup policy

- Railway PITR remains enabled and is checked for current WAL archival.
- A daily PostgreSQL 18 custom-format dump is restored into an isolated database
  before it is accepted.
- The accepted dump is encrypted to an offline-held GPG public key and uploaded
  to an S3-compatible destination outside Railway and this VPS.
- Keep 30 daily, 12 monthly, and 7 annual recovery points.
- Perform and record a full recovery drill monthly.

The off-site timer must not be enabled until `/etc/credx/backup.conf`, the GPG
recipient, and a root-readable rclone configuration are installed through
protected credential entry. Never paste these credentials into a terminal
command, issue, commit, or chat.

## Release gate

The `production-release.yml` workflow remains deliberately blocked until the
recovered database's migration-history bridge is completed. A release requires:

1. CI passing on a reviewed `main` commit.
2. Current PITR health.
3. A fresh restore-tested dump and its SHA-256.
4. Approval through the protected GitHub environment.
5. Guarded additive migrations.
6. API deployment and health verification.
7. Web deployment and health verification.
8. Post-release customer, affiliate, payment, document, and login checks.
