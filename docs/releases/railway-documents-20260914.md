# Railway private document release — 2026-09-14

Scope: document-only changes based on live bdeff37; no billing/session changes or database migration.

New uploads use the dedicated private Railway S3-compatible bucket. Saved references are object keys, never credentials or signed URLs. Download signatures expire after 15 minutes and require authenticated ownership checks. Existing legacy Vercel references remain readable if their old provider is configured; no new upload needs Vercel.

Verification before deployment:
- API TypeScript build and Prisma generation PASS.
- Real provider synthetic upload, exact-byte signed download, unsigned denial, tampered signature denial, delete and missing-object check PASS.
- Real Express multipart upload + disposable local PostgreSQL + real Railway bucket PASS.
- Anonymous download 401; unrelated customer 404; authenticated owner exact-byte retrieval PASS.
- Metadata-only fake upload rejected 422 with no document record.
- Missing object and metadata-only historical reference return 410/re-upload message.
- Signed response uses private/no-store caching.
- Synthetic provider fixtures removed; no customer document rows changed.

Runnable verification scripts: scripts/verify-private-document-storage.mts and scripts/verify-document-routes.mts. Supply credentials only through protected environment. HTTP script rejects nonlocal/non-document-release databases and generates its own ephemeral JWT signing key.

Railway target verified: project b7a1b58e-631d-4f60-9d57-8deda2ef6b0c, production @credx/api (a3395872-c4bf-4c3c-bd0c-3d9ed187796a). Existing build npm install && npm run build:api; start npm run start:api; health /health; no predeploy migration. No root railway.json overrides.

Remaining outside this release: user will identify/re-upload missing historical originals. Payment, inbox delivery, broader onboarding, backup/recovery, monitoring and database-access gates remain separate.
