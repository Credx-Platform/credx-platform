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

## Deployed result

- Application commit: 5620093.
- Railway API deployment: 743f910e-f04a-4c2a-9e0a-de92b894ee4f, SUCCESS on 2026-09-14.
- Previous deployment for rollback: 5f7359d3-c206-4d0a-b728-7cb0fefb85fb.
- Live https://credxapi-production.up.railway.app/health: HTTP 200, credx-api.
- Live anonymous document print: 401.
- Live authenticated synthetic metadata-only submission: 422 FILE_UPLOAD_REQUIRED, confirming new route guard is deployed without customer/DB writes.
- Provider synthetic roundtrip rerun with exact production service environment via railway run: PASS; object removed.
- Full multipart/ownership DB test was local Express + dedicated disposable DB + real bucket, not production customer data.
- In-container SSH smoke unavailable because no Railway SSH key is registered; no new SSH access was provisioned. This does not block the externally verified deploy/guard and production-config provider test above.
- Saved branch and draft review: https://github.com/Credx-Platform/credx-platform/pull/8 . Main is unchanged; merge before another main deployment to avoid reverting this isolated CLI release.
