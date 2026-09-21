# CREDX — CLAUDE CODE MASTER PROMPT: SaaS Readiness 10/10

You are working in `credx-platform` (Express+TS API, React+Vite web, Prisma/Postgres,
Railway production, monorepo with npm workspaces). Your mission: take CredX from its
current ~7.3/10 to a verified **10/10 SaaS readiness**, in phases, with evidence for
every claim. This repository has a strong culture of "repository scores are not
production ratings" — never blur that line.

## 0. REQUIRED READING (before writing any code)

1. `PLATFORM_AUDIT_2026-09-21.md` — the full audit you are closing out (P1–P3 findings, owner-confirmation list).
2. `docs/SAAS_AUDIT.md` — the 24-category rubric with current scores and targets.
3. `docs/LAUNCH_AUDIT_2026-09-07.md` + `docs/VERIFICATION_2026-09-08.md` — prior findings and what was already fixed.
4. `PRELAUNCH_PUNCHLIST.md` — the May items still open (payments, CROA legal, storage, videos, 2FA, email verification).
5. `docs/SECURITY.md`, `docs/DISASTER_RECOVERY.md`, `docs/INCIDENT_RESPONSE.md`, `docs/PRODUCTION_SAFETY.md`.
6. `.github/workflows/ci.yml` and `.github/workflows/production-release.yml` — understand the gates you must pass and never weaken.
7. `scripts/guarded-prisma.mjs` and `scripts/check-db-safety.mjs` — migration safety rules.

## 1. NON-NEGOTIABLE RULES

- **Never touch production.** No `railway up`, no prod migrations, no provider config changes, no DNS. Deploys happen only via the owner-run `production-release.yml` workflow. Your deliverables are branches + PRs + verification evidence.
- **Never commit secrets.** No `.env` files, keys, DB URLs, tokens. The repo must stay clean (it currently is).
- **Migrations are additive-only**, applied only through `npm run db:migrate:deploy` semantics (guarded). No DROP/TRUNCATE/DELETE/ALTER COLUMN. Never run `prisma migrate reset` anywhere against a non-disposable database.
- **CI is the gate.** Before declaring any phase done: `npm test` green, `npm run test:integration` green (CI has Postgres), `npm run build` green, `npm run test:web` green, `npm audit --audit-level=moderate` clean or explicitly justified.
- **Every claim needs evidence.** For each completed item record: files changed, test names added/changed, command output, and (for prod-relevant items) what the owner must verify live. Write it in the phase report. No "should work" statements.
- **No fabricated production verification.** If a check requires live access you don't have, mark it `OWNER VERIFY` with the exact command to run.
- **Commit discipline:** one branch per phase (`fix/saas-10-phase-N-<slug>`), intentional logical commits (grouped by concern, with evidence references), one PR per phase. Never squash history into single commits — the 2026-09-21 audit flagged single-commit `main` as a P1; restore real history from now on (see Phase 1.3).
- **Security changes need regression tests** (the repo pattern: entitlement/tenant/webhook tests exist — extend that pattern).

## 2. OWNER-ONLY ACTIONS (you must surface these, never fake them)

Maintain a live checklist file `docs/OWNER_ACTIONS_SAAS_10.md` (create it in Phase 1)
with each item, why it's needed, and the exact command/value. Items:

1. Railway prod env verification: `PII_ENCRYPTION_KEY`, `JWT_SECRET` (non-default), `TURNSTILE_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`, PayPal live keys, `RESEND_API_KEY`/`SMTP_*`, `COMPANY_MAILING_ADDRESS` (1392 Madison Avenue, New York, NY 10029 — per CROA page), `UNSUBSCRIBE_URL` (after Phase 2 builds the endpoint), `STATE_GATE_APPROVED`, `STATE_GATE_BLOCKED`, `SENTRY_DSN`, `POSTHOG_API_KEY`+`ANALYTICS_ENABLED`, `AI_BUDGET_*` if overriding.
2. Send one real test email; confirm footer shows real address + one-click unsubscribe.
3. Provision Sentry project + PostHog project; confirm one test event each reaches them.
4. Attorney sign-off (in writing) on Essential $150+$75/mo, Premium $447, Family $300+$95/mo structures under CROA (15 U.S.C. §1679b) — from the May punch list, still open.
5. State licensing & bonding decision (CA/GA/NY/FL at minimum) → then set `STATE_GATE_*` accordingly.
6. Masterclass video content (Day 1 + 2 minimum, Mux/Cloudflare Stream/YouTube-unlisted) — lessons still have `url: null`.
7. Backup verification on the ops host: latest `backup.log` success, WAL archive zero-fail, PITR dashboard evidence; then enable GPG/rclone off-host encrypted copy + backup failure alerts (runbook exists in `docs/DISASTER_RECOVERY.md`).
8. Production migration state: run `db:migrate:status` against prod (read-only shell) and record the result.
9. Live header check from an unrestricted network: `curl -sI https://www.credxme.com/` and `https://credxapi-production.up.railway.app/health` — record HSTS/CSP/nosniff.
10. Stripe + PayPal in live mode with webhooks pointed at `https://credxapi-production.up.railway.app/api/billing/webhook`; confirm `GET /api/billing/webhook` shows `configured: true`.
11. 2FA decision (TOTP vs SMS) and email-verification decision (May punch list items 6–7) — you build what is decided.
12. Cookie consent banner decision (EU/CA/CO/CT/UT/VA).
13. If any AFFILIATE-role users exist: confirm or remove their non-client reach on `GET/POST /api/clients/:id/analysis*`.

## 3. PHASES

### Phase 1 — Close all P1 security items (branch: `fix/saas-10-phase-1-p1`)

1. **PayPal capture endpoint** (`apps/api/src/routes/billing.ts:239`):
   - Require auth (or a cryptographically random order-scoped token stored at `POST /paypal/order` and passed back at capture).
   - Bind each PayPal order to the creating session/client at creation time; capture must verify the payer matches the expected buyer and reject mismatched captures.
   - Reject captures for orders created more than N hours old (configurable, default 24h).
   - Add a strict per-IP limiter on both endpoints (e.g., 5/hour) in `app.ts`.
   - **Tests:** unauthenticated capture → 401/403; mismatched buyer → 402/403; expired order → 400; happy path enrolls the correct client; idempotent replay.
2. **Dependency bump:** `npm audit fix` until `npm audit --audit-level=moderate` is clean (at minimum nodemailer ≥ fixed 9.x, qs via express). Bump devDeps (vite/browserslist/nanoid chain) as needed. Pin nothing by hand; keep the lockfile. **Tests:** full CI green after bump.
3. **Restore real history:** from this phase forward, PRs merge as merge commits (no squash) on `main`. Add `docs/COMMIT_POLICY.md` (branch-per-change, no-squash, evidence-in-message rule) and add the rule to `docs/SECURITY.md` §RULES. Check whether prior branches (`saas-transformation`, `release/saas-identity-20260915`) still exist on `origin`; if so, record their SHAs in the phase report for the owner to graft history if desired.
4. **Unsubscribe endpoint:** `POST /api/account/unsubscribe` (+ `GET` confirm page if trivial) writing a persistent `Unsubscribe` row (new additive migration: `Unsubscribe { email (unique), source, createdAt }`) and a `List-Unsubscribe-Post`-compatible URL for `UNSUBSCRIBE_URL`. Wire `listUnsubscribeHeaders()` in `apps/api/src/lib/email.ts` to use it. **Tests:** header present when URL configured; email recorded; idempotent.
5. **Create `docs/OWNER_ACTIONS_SAAS_10.md`** (section 2) and a `docs/SAAS_10_PROGRESS.md` tracking every item in this prompt with status + evidence links. Update both at the end of every phase.

**Phase 1 done when:** all tests green, `npm audit --audit-level=moderate` clean, P1 items in `PLATFORM_AUDIT_2026-09-21.md` marked closed in `SAAS_10_PROGRESS.md` with evidence.

### Phase 2 — Hardening & correctness (P2 closeout)

1. **`/product` + sitemap truth:** update `apps/web/public/product.html` so live capabilities (Readiness Score, Action Plan, Funding Readiness, Business Credit, org/team, worker architecture) are listed under Current — grounded in actual routes/entitlements; remove stale "Planned" wording. Fix `apps/web/public/sitemap.xml`: add `/agent`, remove dead `/weekly`. Add a CI job that fetches live `/sitemap.xml` (if `CREDX_WEB_URL` is set as a secret) and diffs against the repo file.
2. **Worker heartbeat pruning:** in the queue runner, prune `WorkerHeartbeat` rows with `lastBeat < now() - 24h` (configurable) on a periodic timer; `/health/queue` should then show only live workers. **Tests:** stale row pruned, live row kept.
3. **CSP nonces:** eliminate `'unsafe-inline'` for `script-src` by moving the 4 inline `<script>`s to external files; for the 13 inline `<style>`s, add per-request nonces in `apps/web/server.mjs` (or convert to external CSS). Update `apps/web/server.mjs` policy + `tests/securityHeaders.test.ts` / web routing test to assert nonce presence and absence of `unsafe-inline` where removed.
4. **Session hardening:** shorten `JWT_EXPIRES_IN` default to 24h and add a refresh flow (or a single-use onboarding link in the welcome email that exchanges for a bearer token at `/start`); remove `?secret=` from masterclass dispatch (header only). **Tests:** expired token rejected; refresh works; onboarding link single-use.
5. **Test ergonomics:** lazy-instantiate `PrismaClient` in `apps/api/src/lib/prisma.ts` (get-or-create) so `npm test` passes without a generated engine; move `imapflow` from root `package.json` into `apps/api`. **Tests:** `npm test` green with prisma generate skipped.
6. **Webhook PROCESSING runbook:** add the inspect/reset operator queries to `docs/INCIDENT_RESPONSE.md` (manual reconciliation is by design — no lease TTL).
7. **AI quota atomicity:** add an atomic reservation for paid plans (e.g., conditional increment of a per-client budget row, or advisory-lock + recheck inside a transaction) so concurrent calls can't all pass the same budget check. **Tests:** concurrent-call simulation.
8. **Analytics completeness:** wire the remaining 8 of 18 events in `apps/api/src/lib/analytics.ts` (checklist in `docs/SAAS_AUDIT.md` Analytics row); keep PII stripping tests.
9. **Privacy policy:** add visitor-level tracking disclosure (referral clicks store IP + geo — `apps/api/src/routes/subAgents.ts`).
10. **Cleanup:** decide fate of `apps/web/vercel.json` (keep as legacy doc or delete — document choice); single-source the API URL default (one constant referenced by `server.mjs`, `vercel.json` if kept, docs).

### Phase 3 — Product completeness (the gap to 9.5+ per `docs/SAAS_AUDIT.md`)

1. **Self-serve plan management UI + API:** upgrade/downgrade/cancel for ESSENTIAL/PREMIUM/FAMILY via Stripe (Checkout + portal config) or PayPal where Stripe is absent; proration and dunning (Stripe invoice.payment_failed → grace period → downgrade to FREE with email). Update `resolveClientEntitlements()` consumers; keep the CROA rule: no charge before analysis delivery (the pre-plan review gate must survive self-serve — verify with tests).
2. **Reconcile manual vs automated billing:** `POST /api/clients/:id/mark-paid-and-activate` (staff) and the Stripe/PayPal webhook paths must converge on one settlement function; add a reconciliation endpoint for staff (`/api/billing/admin/reconcile`) listing unsettled payments.
3. **DSAR (CCPA):** `GET /api/v1/account/export` (JSON of all client data, incl. decrypted PII only to the account owner with audit log) and `POST /api/v1/account/delete` (GDPR/CCPA-style soft-delete: hash identifiers, null PII, scrub documents via blob delete, retain only billing-legal records; 30-day grace). **Tests:** export completeness, delete irreversibility of PII, audit rows.
4. **Retention/education loop:** weekly email digest (queue-driven, respects unsubscribe table from Phase 1).
5. **B2B depth:** org-level branding hooks (logo/name in client-facing emails + portal header), org usage limits (max clients, per-plan), invite flow hardening (already token-hash verified).
6. **Public API readiness (target 8):** API-key auth (scoped, hashed, revocable) under `/api/v1/public/...` for the 3–5 safe read endpoints (readiness snapshot meta, action list, progress), per-key rate quotas, OpenAPI spec committed under `docs/api/`.
7. **Email verification flow** (if owner confirms in Phase 1 checklist): token model + portal gate.
8. **2FA** (if owner decides TOTP): TOTP setup/verify on staff/admin + optionally clients; store secrets encrypted with the PII key helpers.
9. **Accessibility:** run axe-core against all public + portal pages; fix contrast/keyboard/ARIA on signature pad, quiz components, notification bell. Document score in the phase report.
10. **Masterclass videos** (owner supplies URLs): wire them; no placeholder URLs ship to prod.

### Phase 4 — Compliance hardening

1. **CROA statutory delivery:** ensure the §1679c Consumer Credit File Rights statement is delivered (not just linked) before covered contracts are executed, with acknowledgment + copies stored (`Agreement`/`Document` models) — code the gate into the onboarding flow.
2. **Document lifecycle:** confirm blob storage (Vercel Blob/S3) lifecycle policy: server-side encryption, signed URLs, TTL, and **scrub on user delete** (wire into Phase 3 DSAR delete). Document in `docs/SECURITY.md`.
3. **Secret rotation policy:** document + script `scripts/rotate-secrets-checklist.mjs` (env inventory, rotation order: PII key last + migration path via dual-key decrypt, JWT rotation with overlap).
4. **Landing/claims review:** grep all public pages for guarantee-adjacent language ("guarantee", "will increase", "delete") and ensure every instance is negated/disclosed (pattern already good in CROA page); add a CI grep-gate so it can't regress.
5. **Affiliate disclosure** check on agent-facing pages (FTC).

### Phase 5 — Ops, reliability, scale

1. **Backups:** implement the GPG-encrypted off-host copy (rclone to owner's bucket) + systemd timer + failure alerting per `docs/PRODUCTION_SAFETY.md`; add a monthly restore-drill runbook entry. (Owner executes on ops host — you write the scripts.)
2. **Dedicated worker service:** document + provide Railway config for splitting `start:worker` into its own service (the runner is already multi-process safe); queue depth alerting in `/health/queue` output.
3. **PgBouncer:** provide config + docs for a pooled connection topology (don't enable without owner).
4. **Load tests with seeded scenarios** (extend `scripts/loadtest.mjs`): signup→onboarding→analysis→report pipeline at 10× current traffic; record results vs the 4k req/s baseline in `docs/LOAD_TESTING.md`.
5. **Observability dashboards:** export a Prometheus endpoint (`/metrics`, admin-only) with queue depth, job failures, webhook dead letters, AI spend/day, error rate; document Grafana dashboard JSON in `docs/`.
6. **A/B deploy + rollback runbook:** document the exact rollback procedure for the API-first/web-second release (Railway previous deployment roll-back + forward-fix migration rule).

### Phase 6 — Verification & the 10/10 score

1. Re-run the entire 2026-09-21 audit checklist against the new tree: all P1/P2 closed with evidence; P3 items closed or explicitly deferred with rationale.
2. Full local verification: `npm test`, `npm run test:integration`, `npm run build`, `npm run test:web`, `npm audit --audit-level=moderate` (clean), `db:safety:check`, `test:db-safety`.
3. Produce `docs/SAAS_10_VERIFICATION.md`: the 24-category rubric from `docs/SAAS_AUDIT.md` re-scored **per the evidence standard** — every category ≥9 requires: (a) code/tests in this repo, (b) a `OWNER VERIFY` line with the exact live check for anything prod-facing, (c) no "should work". Categories that depend on owner provisioning (Sentry, PostHog, backups, attorney) score at the highest value justified by committed code + scripts, and are labeled `PENDING OWNER`.
4. Update `docs/SAAS_AUDIT.md` header with the re-score and link.
5. Final sign-off doc: what is 10/10-able today, what is blocked on the 13 owner actions, and the exact deploy sequence via `production-release.yml` (type `DEPLOY_CREDX_PRODUCTION`, backup SHA from the restore-tested dump, API first, then web, verify health + sitemap + entitlement probes).

## 4. DEFINITION OF DONE (10/10)

- All Phase 1–5 code work merged to `main` with real commit history, CI green on every merge.
- `npm audit --audit-level=moderate`: zero findings.
- `docs/SAAS_10_VERIFICATION.md` shows all 24 categories ≥9 with evidence; any `PENDING OWNER` item has its exact owner command listed in `docs/OWNER_ACTIONS_SAAS_10.md`.
- No guarantee-adjacent public copy without disclosure (CI grep-gate proves it).
- Rollback + restore runbooks exist and were dry-run in CI against a disposable DB.
- Owner runs the 13 owner actions, records evidence, and the final score is re-confirmed as **10/10 production-verified** — not a repository estimate.

## 5. WORKING STYLE

- Phase by phase. Before starting a phase, restate its acceptance criteria and the files you expect to touch.
- After each phase: update `docs/SAAS_10_PROGRESS.md`, open the PR, and in the PR description list evidence (tests, commands, output snippets) and every `OWNER VERIFY` item the phase creates.
- When blocked on an owner decision, implement the decided-path stub with an env gate (fail closed), record the decision point, and move on.
- Never weaken a test to make it pass. Never skip a gate in CI. Never deploy.
- Match the repo's existing code style (ESM TS API, zod at boundaries, `next(error)` handler pattern, queue-backed async work, audit-log writes on sensitive actions).
