# CredX Platform — Full Audit

**Date:** 2026-09-21 · **Auditor:** Arena Agent (read-only review; no production mutations)
**Scope:** `credx-platform` repo (main @ `c965658`, single-commit history) + live `credxme.com` / `credxapi-production.up.railway.app` + prior audit trail (`PRELAUNCH_PUNCHLIST`, `PLATFORM_AUDIT_2026-08-06`, `docs/LAUNCH_AUDIT_2026-09-07`, `docs/VERIFICATION_2026-09-08`, `docs/SAAS_AUDIT`)

---

## 1. Executive summary

CredX is in materially better shape than the last audit cycle. The SaaS transformation (subscriptions/entitlements, funding readiness, business credit, org/team, job queue, CSP, routing 404s) is **live in production** — the 2026-09-08 "production still runs pre-transformation code" blocker is resolved. Security fundamentals (auth, PII encryption, webhooks, rate limits, tenancy scoping) review well, CI is green on `main`, and the credit-repair compliance posture (CROA billing order, state gate, disclosures) is conservative and defensible.

**No P0 (launch-blocking) findings.** There are **5 P1 items**, the most important being an unauthenticated PayPal capture endpoint and the single-squashed-commit repo history.

| Area | Score (0–10) | One-line state |
|---|---:|---|
| Security (code) | 8 | Strong foundations; 1 unauthenticated payment endpoint + 3 high dep vulns |
| Code quality & tests | 7.5 | Green builds, solid unit suite; integration tests only run in CI |
| Build & dependency health | 6.5 | 9 npm advisories (3 high); web bundles healthy |
| Deployment & infrastructure | 7.5 | Current code live; worker-heartbeat table rots; deployment↔main drift on sitemap |
| Product & messaging consistency | 6.5 | Homepage advertises modules `/product` calls "Planned" |
| Compliance (credit-repair) | 8 | CROA-safe billing order, state gate, disclosures; 2 env configs unverified |
| Reliability & operations | 7.5 | Queue/DR/docs good; zombie workers, no lease TTL, Sentry/analytics unprovisioned |

**Overall: 7.3 / 10** — consistent with the 7.2 repository score in `docs/SAAS_AUDIT.md`, now backed by live evidence rather than repo-only evidence.

### What improved since the 2026-09-07/08 audit cycle (verified in code)
- **Webhook ledger is fixed**: `beginProcessing` is now an atomic conditional claim (`updateMany` + `claim.count !== 1`), with identity-mismatch detection, no auto-replay of `PROCESSING`, and `DEAD_LETTER` requiring manual reconciliation (`apps/api/src/lib/webhookLedger.ts`). The 09-07 "High — concurrent single processing not guaranteed" finding is closed.
- **AI quota fails closed** on accounting errors for paid calls (`apps/api/src/lib/ai/quota.ts`), with deterministic fallback. Residual gap: no atomic reservation under concurrency (P2).
- **Entitlement enforcement** is applied router-wide to Funding Readiness and Business Credit (`requireEntitlement(...)` on `use()`).
- **CSP on both surfaces**, strict API policy (`default-src 'none'`), origin-scoped web policy (`apps/api/src/app.ts`, `apps/web/server.mjs`).
- **localStorage state reduced** from ~5 keys (Aug audit) to a single `credx_submitted_tasks` remnant.
- **Routing 404s work**: unknown paths (e.g. `/security`, `/weekly`) return a real 404 page instead of the homepage.
- **Ownership scoping verified** across tasks, notifications, platform reports, disputes-adjacent routes, and `/:id/analysis` (CLIENT role forced to own client; staff/admin bypass is intentional).
- **No secrets ever committed** (checked full git history; `.env*` gitignored; the one tracked `apps/web/.env.production` contains only `VITE_API_URL=`).

---

## 2. Method & evidence

- **Live probes** (read-only): `/`, `/product`, `/pricing`, `/signup`, `/portal`, `/adminportal`, `/team`, `/financial-readiness`, `/agent`, `/masterclass-checkout`, `/croa-disclosure`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`, `/health`, `/security` (404), `/weekly` (404); API `/health`, `/health/db`, `/health/queue`.
  - *Environment note:* this sandbox blocks raw TLS egress to non-allowlisted hosts, so live checks used the page fetcher (content) — header-level verification (HSTS/CSP live) was last evidenced in `docs/VERIFICATION_2026-09-08.md` and should be re-run with `curl -I` from an unrestricted network.
- **Local verification:** `npm install` (OK), `npm run build:web` (PASS, 325 modules, largest chunk 391 kB jspdf, lazy-loaded), `npm test` (48 pass / 78 skipped / 5 file-level failures — **all 5 are sandbox artifacts**: `@prisma/client did not initialize` because `binaries.prisma.sh` is egress-blocked; these files run in CI with a generated client + Postgres), `npm audit`, git history secret scan.
- **Code review:** auth/JWT, config fail-closed behavior, PII encryption, Stripe/PayPal webhooks, webhook ledger, entitlements, tenancy, rate limits, CORS, email/CAN-SPAM, state gate, queue/worker, DR docs, CI + release workflow.
- **Not verifiable from here** (owner must confirm): Railway env values (`COMPANY_MAILING_ADDRESS`, `STATE_GATE_*`, `PII_ENCRYPTION_KEY` set, `TURNSTILE_SECRET_KEY`, Stripe/PayPal keys, Sentry/PostHog), backup cron liveness, production migration state, attorney sign-off status.

---

## 3. Live production state (evidence, 2026-09-21)

| Surface | Result | Interpretation |
|---|---|---|
| API `/health` | 200 `{"status":"ok"}` | API up |
| API `/health/db` | 200 ok | **Post-transformation build live** (404'd on 2026-09-08) |
| API `/health/queue` | 200; 1 live in-process worker, 9 stale rows | Queue live; **worker table never pruned** |
| `/product`, `/team`, `/financial-readiness` | Distinct real pages (sign-in gates) | Web transformation live |
| `/pricing` | Full plan page with CROA-compliant billing terms | Live |
| `/signup`, `/adminportal` | Working forms (Turnstile visible on `/agent`) | Live |
| `/agent` | Agent application + Turnstile + compliant disclaimer | Live |
| `/sitemap.xml` | Includes `/weekly` (dead, 404s) and omits `/agent` (live) | **Drift vs `main` tree** (repo sitemap has `/agent`, no `/weekly`) |
| `/security`, unknown paths | Real 404 page | Routing contract holds |
| Legal pages (privacy, terms, CROA, refund, cancellation, masterclass-terms) | Present; CROA page has real address, CFPB/FTC contacts, no-guarantee language | Live |
| CI on `main` (2026-09-17, PR #13) | **success** (1m19s) | Pipeline green |
| Open work | Draft PRs #11 (SaaS identity release), #10 (copy neutralization); open PR #2 | Queued, unreleased |

**Queue observation (P2):** `/health/queue` lists 10 `WorkerHeartbeat` rows spanning ~10 days (one per API deploy, `workerId = worker-<epoch>`). Only the newest is alive (15 s heartbeat). There is no pruning of stale heartbeats — the table will grow ~1–2 rows/day and `/health/queue` will show a wall of dead workers. Add a periodic prune (delete heartbeats with `lastBeat` older than, say, 24 h) or filter the health output to live workers.

---

## 4. Security findings

### P1 — Unauthenticated PayPal capture with attacker-chosen enrollee
`apps/api/src/routes/billing.ts:239` — `POST /api/billing/paypal/order/:orderId/capture` has **no auth middleware** (only the global 200/15 min limiter). It accepts `orderId` + a fully caller-supplied `buyer` (first/last/email) and:
1. captures the PayPal order server-side,
2. enrolls **whatever name/email the caller sends** into the Masterclass and records the payment against it.

PayPal orders created by `/api/billing/paypal/order` are not bound to any user/session, so an attacker who obtains (or starts approving) an order ID can charge it and route the enrollment to an arbitrary email — enabling paid-access theft, enrollment spam, and "your masterclass access" phishing against victims' emails. **Fix:** require auth (or an order-scoped token issued at `POST /paypal/order`), tie the order to the requesting session, and cross-check the capture's payer against the buyer payload before enrolling.

### P1 — Repo history is a single squashed commit
`git rev-list --count main` = **1** (`c965658`, 2026-09-17, "Merge PR #13"). The entire project — including months of transformation work — has no per-change history on `main`: no blame, no selective revert, no change-level audit trail, and the GitHub "Merge PR" label is cosmetic. Combined with the guarded-release workflow, this means a bad deploy can't be rolled back to a prior commit. **Fix:** restore real history going forward (stop squashing merges into one commit; keep branch-per-change), and consider importing the prior branch history (`saas-transformation` was "31 commits ahead" per 09-08 docs) if it still exists on `origin`.

### P1 — Dependency vulnerabilities (3 high, 6 moderate)
`npm audit` (2026-09-21): **9 vulnerabilities**. Runtime-relevant:
- `nodemailer ≤9.1.0` (high; 4 advisories incl. `disableFileAccess`/`disableUrlAccess` bypass via legacy `resolveContent`, IDN allow-list bypass) — API sends mail with dynamic recipients; **bump to latest 9.x in the next deploy**.
- `qs` via `body-parser`/`express` (moderate) — bump.
Build-time only (low exposure): `browserslist` (high, OOM), `nanoid` (high, custom-generator loop), `fflate`, `baseline-browser-mapping`. All "fix available via `npm audit fix`" — do it in one dependency-bump PR before the next release. (The 2026-08-06 React Router advisory is gone — `react-router-dom` is now pinned to 7.18.2 and unflagged.)

### P2 — CSP still requires `'unsafe-inline'`
Known/tracked: 4 public pages carry inline `<script>` and 13 inline `<style>` (`apps/web/server.mjs` documents this). The policy still blocks script loads and exfiltration to foreign origins; nonces are the tracked follow-up. DOMPurify is bundled and used for user-influenced HTML — good.

### P2 — JWT lifetime + token in emailed URL
`JWT_EXPIRES_IN` defaults to **7 days** (`apps/api/src/config.ts`), and the same bearer token is embedded in the `/start?token=...` onboarding URL sent by email. A forwarded/leaked email grants 7 days of account access. Consider short-lived JWTs + a refresh mechanism, or a single-use onboarding link that exchanges for a session token.

### P2 — Masterclass cron secret in query string
`apps/api/src/routes/masterclass.ts` `POST /dispatch/:day` accepts the secret via `?secret=`. Query strings land in access logs/proxies. Keep the header path; drop the query path (or make it env-gated dev-only). Fails closed when unset — good.

### P2 — Email CAN-SPAM footer placeholder (config-dependent)
`apps/api/src/lib/email.ts`: if `COMPANY_MAILING_ADDRESS` is unset in prod, every email footer renders the literal placeholder `[MAILING ADDRESS NOT SET — set COMPANY_MAILING_ADDRESS]`. The physical address is known (1392 Madison Avenue, NY — used on the CROA page), so **set the env var and verify in a test email**. Unsubscribe is `mailto:` only unless `UNSUBSCRIBE_URL` is set (no one-click RFC 8058) — add a real unsubscribe endpoint/URL.

### Verified-good (no action)
- **Config fail-closed**: `JWT_SECRET`, `PII_ENCRYPTION_KEY` throw in production when missing/unsafe; localhost URLs rejected in prod (`apps/api/src/config.ts`, `apps/api/src/lib/encryption.ts`).
- **Auth**: bcrypt (cost 10), provisional random passwords with emailed set-password flow, generic login errors, auth rate limit (50/15 min, prefix-mounted so it covers all password-setup subroutes), Turnstile on signup (fails closed in prod), audit log on login/password events.
- **PII at rest**: AES-256-GCM with versioned envelope, `gcm.v1:` prefix detection for backfill, SSN masking helper.
- **Webhooks**: Stripe `constructEvent` over `rawBody`, 503 in prod when unconfigured, 400 on missing signature; ledger = record → identity check → atomic claim → process → mark, provider-safe 500 on failure.
- **IDOR/authorization**: role gates on staff routes; ownership scoping on client-facing `/:id` routes (tasks, notifications, reports, disputes letters, analysis). AFFILIATE role inherits staff-like bypass on a couple of `/:id` analysis routes only when it is *not* a CLIENT — confirm no AFFILIATE users exist that shouldn't have that reach (see §9 confirmation list).
- **CORS** locked to credxme.com origins; `trust proxy=1`; JSON limit 2 MB; response sanitizer strips `passwordHash` and similar.
- **Secrets**: none in git history; `.env*` ignored.

---

## 5. Code quality, build & tests

- **Web build:** PASS (6.8 s). Chunk sizes healthy (largest 391 kB, jspdf, lazy). Multi-page: index, portal, adminportal, team, readiness, start, signup, + legal pages.
- **API type-check:** not fully executable in this sandbox (Prisma engine download egress-blocked → client stubs are `any`; all observed tsc errors trace to the stub, not the code). CI (`npm run build`) is the authoritative gate and was green on 2026-09-17.
- **Unit tests:** 48 pass / 0 real failures / 78 DB-gated skips. The 5 failing files (ai, creditReportImport, jobs, securityHeaders, subscriptionLifecycle) crash only on `new PrismaClient` from the ungenerated stub — they instantiate the app at import. In CI with Postgres + generated client they run. *Suggestion:* make `lib/prisma.ts` lazy-instantiate so app-creating unit tests can run engineless; that would also let a "unit green without DB" claim hold locally.
- **Test coverage focus is right:** tenant isolation (17 tests), webhook ledger replay/idempotency, entitlement plan gates (free clients denied paid modules), security headers, routing contract, subscription lifecycle.
- **Maintainability:** `apps/web/src/App.tsx` is a ~3,400-line file (admin portal + task state + more) and `clientPortal.tsx` is similarly large; each web entry point re-declares its own `API_BASE` fetch wrapper. Not a launch blocker, but the admin surface should be split before the B2B white-label work lands. Root `package.json` carries `imapflow` (used by `responseIngest`) — fine, but it belongs with the API workspace.

---

## 6. Deployment & infrastructure

- **Release workflow (`production-release.yml`) is above average:** typed confirmation string, required restore-tested backup SHA + timestamp, `environment: production` protection, guarded *additive-only* migrations (`scripts/guarded-prisma.mjs` + `db:safety:check`), API-deploy-first with `/health` verification, then web deploy + verify. Concurrency-serialized. Keep using it exclusively for prod.
- **Deployment drift (P2):** live `/sitemap.xml` ≠ `main` tree (`/weekly` present-but-dead live; `/agent` missing live though the page exists; repo sitemap has `/agent`). Either the web service deployed from a different commit than `main`, or the sitemap file wasn't updated. Pin every Railway deploy to a `main` SHA and add a CI job that diffs deployed sitemap vs repo (cheap: fetch both, compare).
- **Worker heartbeats (P2):** see §3 — add pruning.
- **Known infra gaps (owner-side):** PgBouncer/pooling unconfigured; no external APM; Sentry + PostHog code is present but **provisioning unverified** (`SENTRY_DSN`, `POSTHOG_API_KEY`, `ANALYTICS_ENABLED`); Redis optional/absent (DB queue is the design — fine at current scale).
- **vercel.json** (legacy Vercel rewrite config) is still in the repo while production runs Railway `server.mjs` — keep or delete deliberately; the file hardcodes the Railway API URL twice (also in `server.mjs` defaults), so an API domain change touches 3+ places. Consider a single source of truth.

---

## 7. Product & messaging consistency

- **Homepage vs `/product` contradiction (P2, public-facing):** the homepage markets the Readiness Score, Funding Readiness, Business Credit, org/team and worker architecture as core platform modules ("One workspace for the whole picture"), while `/product` still lists the same items under **"SaaS foundation in progress … Planned."** Both pages ship from `main`, so this is a content decision, not a deploy gap — but customers who self-serve into `/product` will see features the homepage just promised as "planned." Pick one truth (features are live per code + entitlements) and update `/product`.
- **`/product` "Current" list omits modules that exist in code** (Readiness Score snapshots, actions, reports) — same fix.
- **Draft PRs #10/#11** ("neutralize credit-service language", "durable SaaS identity") are exactly this class of work — merging them closes most of the gap.
- **Plan self-service gap (roadmap, not defect):** no self-serve upgrade/downgrade/cancel UI, no proration/dunning; `billing/admin/aging` returns a scaffold message. Fine pre-scale, but Essential/Premium are "billed after work" with a manual activation path (`mark-paid-and-activate`) — reconcile with the Stripe/PayPal automation already in the webhook handler so manual and automated paths don't diverge.

---

## 8. Compliance (credit-repair / financial services)

**Strong posture, two config items to confirm:**
- **CROA billing order is honored end-to-end:** pricing page states *nothing charged at signup*, first work fee after delivered analysis, arrears monthly, 3-business-day cancellation; `/croa-disclosure` carries the statutory structure (no advance payment §1679b, agreement/waiting §1679d, cancellation §1679e, self-help rights, no guarantees, real business address + CFPB/FTC contacts). Masterclass is correctly separated as a one-time educational product with its own terms + 7-day refund window.
- **State gate** (`apps/api/src/lib/stateEligibility.ts`): approved / blocked / review_required buckets, default-deny for unknown states, admin override is explicit and logged. *Confirm `STATE_GATE_APPROVED`/`STATE_GATE_BLOCKED` env values are actually set on the API* — empty lists mean every state is `review_required` (safe, but every activation needs a manual override).
- **Non-FICO disclosure** appears on homepage, `/product`, and the score UI. Good.
- **CAN-SPAM** (P2): see §4 (mailing-address env + one-click unsubscribe URL).
- **Privacy:** policy is GLBA/CCPA-aligned; note the agent/lead forms store **IP + geolocation** per click (`subAgents.ts`) — ensure the privacy policy discloses tracking/geo of *visitors* (not just accounts).
- **SMS consent** is captured at signup with captured language + timestamp — good; ensure the consent language also covers the actual carrier/SMS vendor you use.
- **Outstanding (from prior audits, owner-side):** attorney sign-off on the Essential/Premium/Family fee structures under CROA (the 05-10 punch list's #2); CA/GA/NY/FL licensing & bonding decision; DSAR self-service export/delete (CCPA) not yet present in routes — add `/api/v1/account/export|delete` when CCPA exposure materializes.

---

## 9. Reliability, data & operations

- **DR:** nightly `pg_dump` 03:30, 14-day retention, off-Railway host, **restore-tested 2026-09-08**, PITR (WAL archiving) enabled per docs, RPO ≤24 h / RTO 30–60 min documented. Residual: GPG/rclone off-host encryption + backup failure alerts + monthly restore drill are still "to complete." **Re-verify from the ops host** (latest `backup.log` success, WAL zero-fail) — docs can't substitute for current evidence.
- **The 2026-09-04 `migrate reset` data-loss incident** is the reason for the guarded, additive-only migration pipeline — it's working as designed; keep the rule that prod migrations are additive and rollback is "forward-fix + restore from backup."
- **Job queue:** DB-backed, multi-runner safe, dead-letter + retry (5), in-process runner confirmed live. Crash-recovery for stuck `PROCESSING` webhook rows is **manual by design** (no lease TTL) — document the operator runbook (reset query) where on-call can find it.
- **Backups of non-DB state:** document storage (Vercel Blob/S3) and its lifecycle/scrub-on-delete should be re-confirmed (05-10 punch list item #4: decide storage + signed URLs + scrub on user delete).

---

## 10. Prioritized recommendations

**P1 — do this week**
1. **Fix PayPal capture endpoint**: auth + order-to-session binding + payer/buyer cross-check (`billing.ts:239`). (Half-day.)
2. **Dependency bump PR**: `npm audit fix` (nodemailer, qs at minimum; browserslist/nanoid via devDeps refresh); verify build + tests in CI. (Hour.)
3. **Stop the single-commit history**: branch-per-change + no-squash merges going forward; evaluate restoring prior history from `origin` branches. (Process, immediate.)
4. **Confirm prod env set** (owner): `COMPANY_MAILING_ADDRESS` (else footers show a placeholder), `STATE_GATE_APPROVED/BLOCKED`, `PII_ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `STRIPE_*`/PayPal keys, `SENTRY_DSN`/`POSTHOG_API_KEY`/`ANALYTICS_ENABLED`. Send one real test email to verify the footer. (Hour.)
5. **Add a real unsubscribe endpoint + `UNSUBSCRIBE_URL`** (one-click `List-Unsubscribe-Post`) — closes the CAN-SPAM partial gap. (Half-day.)

**P2 — next sprint**
6. Align `/product` with live capabilities (merge draft PR #10/#11 or update copy); fix live sitemap (`/weekly` dead, `/agent` missing) and pin deploys to `main` SHAs.
7. Prune stale `WorkerHeartbeat` rows (cron in the queue runner; delete `lastBeat < now()-24h`).
8. CSP nonce rollout (replace `'unsafe-inline'` for the 4 inline scripts / 13 inline styles).
9. Shorten JWT lifetime or move onboarding to single-use link exchange; drop `?secret=` path on masterclass dispatch.
10. Lazy `PrismaClient` instantiation so unit tests run without a generated engine; move `imapflow` into the API workspace.
11. Webhook `PROCESSING` reconciliation runbook (query to inspect/reset) in `docs/INCIDENT_RESPONSE.md`.
12. AI quota: add atomic reservation or per-minute concurrency cap for paid plans (cost-protection hardening).
13. Verify Sentry + PostHog actually delivering (one test event each) or provision before paid traffic.
14. Privacy policy: disclose visitor-level tracking (referral clicks store IP + geo).

**P3 — backlog**
15. Split `App.tsx` / `clientPortal.tsx` monoliths before white-label B2B work.
16. Add DSAR endpoints (`/api/v1/account/export`, `/delete`).
17. Single source of truth for the API URL (currently `server.mjs` default, `vercel.json`, and docs).
18. User-enumeration nicety: `/register` 409 reveals existing emails — acceptable, but could be unified with the generic password-request pattern.
19. Decide the fate of `vercel.json` (production runs Railway `server.mjs`).

### Owner-confirmation list (cannot be verified from this environment)
- [ ] Railway prod env values in P1-4 above
- [ ] Latest `backup.log` success + WAL archive zero-fail (ops host)
- [ ] Production DB migration state matches `main` (run `db:migrate:status` against prod read-only)
- [ ] Live response headers (HSTS/CSP) — `curl -I https://www.credxme.com/` from unrestricted network
- [ ] Attorney sign-off status on CROA fee structures (punch-list item, 2026-05-10)
- [ ] Stripe + PayPal are in live (not sandbox) mode and webhooks point at `/api/billing/webhook`
- [ ] No AFFILIATE-role users exist with the non-client `/:id/analysis` reach (or document why that's intended)

---

*Generated by automated audit. All file/line references point at `main` @ `c965658` on 2026-09-21. No production systems were modified.*
