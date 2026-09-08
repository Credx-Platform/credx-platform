# CredX verification and fixes — 2026-09-08

Independent re-verification of the `saas-transformation` branch, plus four
defects fixed locally. No production application, database, DNS or provider
change was made. Every claim below is backed by a command run in this session.

## 1. Production state (read-only)

The owner recovered the lost production data at the database level on
2026-09-08 and believed the branch was already deployed. It is not — those are
independent things, and only the first happened.

| Check | Result |
| --- | --- |
| Railway `@credx/api` active deployment | `c5f40407`, **2026-08-23** |
| Railway `@credx/web` active deployment | `bc910cd4`, **2026-08-23** |
| Newest deployment carrying a commit | `04d4d8a` "Update homepage credit copy and favicon links" — the commit **before** the transformation began |
| `saas-transformation` vs `origin/main` | **31 commits ahead**, none released |
| `saas-transformation` vs `origin/saas-transformation` | 0 — the branch is pushed, just never deployed |
| `https://www.credxme.com/` `/product` `/team` `/financial-readiness` `/security` | all HTTP 200, all SHA-256 `db70d9d0…` — one document, four URLs |
| `/pricing`, `/terms` | 200, distinct — existing pages are fine |
| API `/health` | 200 |
| API `/health/db`, `/health/queue` | **404** |

Conclusion: the score in `SAAS_AUDIT.md` describes the repository. Production is
running pre-transformation code.

## 2. Migration chain — replayed and proven additive

The 2026-09-04 data loss came from a `prisma migrate reset` against production,
so "is it safe to migrate the recovered database?" is the gating question.

Method: stock `postgres:18` container (18.6, matching prod), empty database,
full `db:migrate:deploy`, then `prisma migrate diff`, then a statement audit.

| Check | Result |
| --- | --- |
| Migrations applied from empty | **15 / 15, no failures** |
| `prisma migrate diff` vs `schema.prisma` | **No difference detected** (exit 0) |
| Tables created | **42** |
| New models present | all 12 — `AiUsageEvent`, `PlatformReport`, `Notification`, `WeeklyCheckIn`, `Subscription`, `Invoice`, `JobQueue`, `Organization`, `ClientAssignment`, `FundingReadinessProfile`, `BusinessCreditProfile`, `WebhookEvent` |
| Destructive statements | **none** — 0 `DROP` / `TRUNCATE` / `DELETE FROM` of any kind |
| Statement mix, full 15-migration chain | 41 `CREATE TABLE`, 76 `CREATE INDEX`/`CREATE UNIQUE INDEX`, 12 `CREATE TYPE`, 3 `ALTER TYPE … ADD VALUE`, 23 `ALTER TABLE` |
| Every `ALTER TABLE` verb in the chain | **only** `ADD COLUMN` (8) and `ADD CONSTRAINT` (41) — no `DROP COLUMN`, no `DROP CONSTRAINT`, no `ALTER COLUMN`, no `RENAME` |
| Row-modifying statements | exactly 1 — `UPDATE "Client"` in `20260616131600_mark_existing_masterclass_leads_as_students`, an intentional 2026-06 status backfill that is already applied on prod. It edits rows; it deletes nothing. |

**The chain cannot destroy existing rows.** It remains true that applying it to
production still requires a fresh restore-tested dump first — the guarantee here
is about the migrations' content, not about operational process.

Prod's own migration state was **not** read in this session. The claim in an
earlier revision that all migrations were already applied on prod is unverified
and has been marked as such.

## 3. Defects found and fixed

### Web routing returned 200 for every unknown path (fixed)

`apps/web/server.mjs` ended with an unconditional `index.html` fallback, so any
unmatched URL answered **200 with the landing page**. Consequences:

- It is what made `/product`, `/team`, `/financial-readiness` and `/security`
  look "live" during the 2026-09-07 audit. They were the homepage.
- No uptime check, smoke test or health probe could distinguish a deployed page
  from a missing one — the deployment gap stayed invisible for 16 days.
- `/wp-login.php`, `/.env` and every scanner probe returned 200.
- Soft-404s: unlimited duplicate content for crawlers.

Fixed: unknown paths now return a real 404 (`noindex`, `no-store`). Every
genuine page is matched explicitly beforehand.

### Admin SPA deep links served the marketing page (fixed)

`src/App.tsx` (mounted from `adminportal.html`) owns the client-side routes
`/clients`, `/disputes`, `/leads`, `/tasks`, `/print`, `/sub-agents`,
`/employees`. None were mapped server-side, so they only worked via pushState
inside a live session. A hard refresh, bookmark or shared link served a
signed-in admin the **public landing page** instead of their workspace.

Fixed: all seven map to `adminportal.html`, as exact routes and as prefixes so
`/clients/abc123` also resolves.

### No Content-Security-Policy on either surface (fixed)

`helmet` was configured with `contentSecurityPolicy: false`, and the web server
sent no CSP. Now:

- **API** — `default-src 'none'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'`. It only ever returns JSON, so nothing needs to load
  and nothing may frame it.
- **Web** — origin-scoped policy derived from what the pages actually load:
  PayPal SDK, Cloudflare Turnstile, Google Fonts, YouTube embeds, the CredX API.
  Everything else the pages reference is `<a href>` navigation, which CSP does
  not govern.

`'unsafe-inline'` is retained knowingly: 4 public pages carry an inline
`<script>` and all 13 carry an inline `<style>`. The policy's value is blocking
script loads and exfiltration to attacker-chosen origins. Per-request nonces are
the tracked follow-up.

### Analytics covered 2 of 18 declared events (fixed)

Now 10 of 18. Added `funding_readiness_completed`, `business_profile_completed`,
`weekly_checkin_completed`, `organization_created`, `client_invited`, and the
three subscription lifecycle events.

Subscription events are derived from the **observed state transition**, not the
Stripe event name — the same `customer.subscription.updated` carries
cancellations, plan changes and no-op renewals, and Stripe redelivers out of
order. `subscriptionLifecycleEvent()` reads the pre-change row and reports a
start, upgrade, cancellation or nothing. Eight unit tests cover redelivery,
reactivation, casing and unchanged renewals.

Delivery is still unproven: `POSTHOG_API_KEY` / `ANALYTICS_ENABLED` are absent
in production, so every call is a no-op until a provider is provisioned.

## 4. Open defect — not fixed, needs a product decision

**Organization invite links go nowhere.** `TeamDashboard.tsx` tells the inviter
to share `${origin}/org/invite?token=…`, and the API exposes
`POST /api/org/accept-invite`, but **no page handles `/org/invite`**. Until now
it silently rendered the landing page; after the 404 fix it returns 404. Both
are broken — the 404 is merely honest.

Building it needs decisions this session cannot make: what an invitee sees when
signed out, whether the token survives a signup round-trip, and expiry/reuse
messaging. Left unbuilt deliberately rather than guessed at.

## 5. Verification run

| Check | Result |
| --- | --- |
| `npm run build` (API + web) | PASS |
| `npm test` (unit) | **72 pass, 0 fail** (was 62) |
| `npm run test:integration` against real PostgreSQL 18.6 | **63 pass, 0 fail, 0 skipped** |
| `npm run test:web` (new routing contract) | **5 pass, 0 fail** |
| `npm run test:db-safety` | 7 pass, 0 fail |
| **Total** | **147 passing, 0 failing** |

New tests: 8 subscription-lifecycle, 2 API security-header, 5 web-routing.
`test:web` is wired into `.github/workflows/ci.yml` after the build step.

Live route behaviour was verified against a locally served production build: 17
real pages 200 and mutually distinct, 9 admin SPA routes resolving to the admin
bundle, 7 unknown paths returning 404, assets and favicon unaffected.

## 6. What still gates a real 9–10

Unchanged by this session, and none of it is code:

1. **Deploy the branch** — API before web, per `PRODUCTION_SAFETY.md`. Nothing
   above reaches a customer until this happens.
2. **Unblock the release gate** — `production-release.yml` requires
   `MIGRATION_BRIDGE_COMPLETE=true`; the GitHub `production` environment,
   reviewers and protected secrets must be created by the owner.
3. **Fresh restore-tested dump** taken immediately before migrating the
   recovered database.
4. **Provision providers** — Sentry/APM, PostHog, `BLOB_READ_WRITE_TOKEN` for
   private document storage (legal copy already promises it).
5. **Self-service subscription management** — cancellation, plan change,
   proration, dunning. Pricing changes are a business decision.
6. **Attorney review** — 8 substantive items in
   `legal-review-2026-09-07/REVIEW-MEMO.md`.
7. **Authenticated journey + load testing** against staging.
