# CredX Platform Audit - 2026-08-06 09:16 CST

## Verification Run

- `npm run build`: passed for API and web.
- `npm audit --audit-level=moderate`: fails with 2 high findings from `react-router` / `react-router-dom`.
- `npx prisma migrate status --schema packages/db/prisma/schema.prisma`: database schema is up to date.
- Railway status: `@credx/api`, `@credx/web`, and Postgres are online.
- Live API health: `https://credxapi-production.up.railway.app/health` returns ok.
- Live admin portal still serves older web assets:
  - Live: `assets/adminportal-hcW12vUR.js`
  - Current local build: `assets/adminportal-15TQDZmd.js`

## What Is Fixed In Source But Not Fully Live Yet

- Sub-agent Copy and Email button handling is fixed in `apps/web/src/App.tsx`.
- Sub-agent Refresh Scan now refreshes sub-agent activity and clients together in source.
- Admin sub-agent API now includes `referredClients` in source.
- API response sanitizer strips `passwordHash` from outbound JSON responses in source.
- Production Turnstile verification now fails closed in source when `TURNSTILE_SECRET_KEY` is missing.
- Stripe webhook now fails closed in production when secrets/signature are missing in source.
- Lob physical mail send is staff/admin only in source.

## Immediate Blockers

1. `TURNSTILE_SECRET_KEY` is missing on Railway `@credx/api`.
   - Do not deploy the API hardening bundle until this is set, or public signup/lead forms will fail closed.

2. `LOB_API_KEY` is missing on Railway `@credx/api`.
   - This blocks live Lob mailing, but the safer behavior is to keep Lob disabled until a real key is configured.

3. Source changes are not deployed to live Railway web/API.
   - The current live admin bundle does not include the latest sub-agent button fixes.
   - A web deploy would surface the Copy/Email UI fixes.
   - The full Refresh Scan referred-signup behavior needs the API deploy too.

4. `npm audit` still reports 2 high vulnerabilities in React Router.
   - Trying the audit-recommended downgrade moved the advisory to older React Router CVEs.
   - Running `npm audit fix` moved it back to the newer advisory range.
   - Current registry guidance is contradictory; this needs dependency watch or replacing React Router if a clean patched version is not published.

## SaaS Readiness Risks Still Open

1. Admin and client task/dispute state still uses browser `localStorage` in important places.
   - Admin tasks: `credx_admin_tasks`.
   - Client submitted/review/dispute tracking: `credx_submitted_tasks`, dispute letters, filings, mailed, and response keys.
   - This is not reliable SaaS state because it does not survive device/browser changes and cannot be audited centrally.

2. There is still demo/fallback client state in the admin portal.
   - This should not appear in a production admin view.

3. No automated test suite is wired at the repo root.
   - There is a build script, but no test script and no visible test/spec files in the repo.
   - High-risk flows need coverage before paid traffic: signup, password setup, Turnstile, billing confirmation, Stripe webhook, document upload, sub-agent refresh, and admin actions.

4. Production deploy sequencing is fragile.
   - Web-only deploy is safe for UI button behavior.
   - API deploy currently requires the missing Turnstile secret first.

5. The working tree is very dirty.
   - There are many modified files and untracked migrations/routes/docs.
   - Before deployment, changes should be grouped into intentional commits or deploy bundles so unrelated work is not accidentally shipped.

## Recommended Next Order

1. Set `TURNSTILE_SECRET_KEY` on Railway `@credx/api`.
2. Deploy `@credx/web` so the admin Copy/Email button fixes become live.
3. Deploy `@credx/api` after Turnstile is set so Refresh Scan can pull referred signups.
4. Verify live admin portal asset hash changes and test Copy, Email, Delete, and Refresh Scan in production.
5. Move admin/client task state from `localStorage` into database-backed task/activity tables.
6. Remove demo fallback data from production admin views.
7. Add focused tests for the money/compliance/client-state flows.
8. Keep React Router advisory on watch, or replace it if no clean patched version becomes available quickly.
