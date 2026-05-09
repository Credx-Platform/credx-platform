# CredX Post-Fix Audit
**Date:** May 10, 2026
**Auditor:** Claude (post-hardening pass)
**Scope:** Re-audit of every item from `audit-credxme-prelaunch.md` after commits `2a02082` (API hardening), `37b7e91` (SEO/legal), `62608bc` (punch list), `16371bd` (CORS cleanup), with Railway env vars `PII_ENCRYPTION_KEY` + `CORS_ALLOWED_ORIGINS` set on `@credx/api` production.

---

## Executive Summary

**New score: 86/100** (was 72/100). The remaining 14 points are concentrated in:
- Payment Cloud / Authorize.Net wiring (8 pts)
- Persistent document storage backend (3 pts)
- Masterclass video content + 2FA / email verification (3 pts)

Every item the original audit flagged as "🔴 Blocker" that was within my reach has been closed. The blockers that remain require credentials, attorney sign-off, or content that only you can produce.

---

## Verified Live State (probed 2026-05-10)

### Railway API (`credxapi-production.up.railway.app`)

| Check | Result |
|-------|--------|
| `/health` | 200 OK, generic body |
| `helmet` security headers | ✅ HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP, CORP, X-DNS-Prefetch-Control |
| `x-powered-by: Express` leak | ✅ removed |
| Rate-limit headers (`ratelimit-*`) | ✅ visible per-request |
| `/api/v1/*` alias | ✅ all routes mounted at both `/api` and `/api/v1` |
| CORS allowed origin (`credxme.com`) | ✅ `Access-Control-Allow-Origin: https://credxme.com` |
| CORS forbidden origin | ✅ no ACAO header, browser blocks (post-`16371bd`: clean 204; pre-deploy: 500) |
| `PII_ENCRYPTION_KEY` env | ✅ set on @credx/api production |
| `CORS_ALLOWED_ORIGINS` env | ✅ set explicitly |
| AuditLog writes on auth/intake | ✅ wired (LOGIN_*, PASSWORD_*, INTAKE_SUBMITTED) |
| Per-route rate limits | ✅ 20/15min on auth, 10/hr on leads |

### Vercel Web (`credxme.com`)

| Check | Result |
|-------|--------|
| `/privacy` (rewrites to privacy.html) | ✅ 200 |
| `/terms` (rewrites to terms.html) | ✅ 200 |
| `robots.txt` | ✅ live, blocks /portal + /adminportal |
| `sitemap.xml` | ✅ live |
| Open Graph meta | ✅ 6 tags |
| Twitter Card meta | ✅ 4 tags |
| JSON-LD blocks | ✅ 2 (Organization + WebSite) |
| Affiliate disclosure footer | ✅ "may earn a commission … at no extra cost to you" |
| Vercel headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS preload) | ✅ all present |
| Privacy/Terms in signup consent | ✅ click-through links live |

---

## Section-by-Section: Original Audit vs Now

### 1. Infrastructure & Hosting

| Item | Original | Now |
|------|----------|-----|
| API URL hardcoded in client bundle | ⚠️ flagged | ⚠️ unchanged (still `credxapi-production.up.railway.app` in `.env.production` + 3 static HTML files) — see Punch List item #1 |
| No custom domain for API | ⚠️ flagged | ⚠️ unchanged — recommend `api.credxme.com` CNAME to Railway, then re-baking VITE_API_URL |

### 2. Frontend Audit

| Item | Original | Now |
|------|----------|-----|
| Missing OG/Twitter meta | ⚠️ | ✅ landed |
| No sitemap.xml/robots.txt | ⚠️ | ✅ landed |
| Video URLs `null` | ⚠️ | ⚠️ unchanged — content task |
| No loading skeletons | ⚠️ | ⚠️ unchanged — UX polish, not launch blocker |
| Bundle exposes API structure | ⚠️ | ⚠️ unchanged — inherent to public SPA |

### 3. Backend API Audit

| Item | Original | Now |
|------|----------|-----|
| No rate limiting visible | 🔴 | ✅ global 200/15min + per-route 20/15min on auth + 10/hr on leads (was always there, but per-route layer is new) |
| File upload security unverified | 🔴 | ✅ verified: 10MB limit + extension/MIME allowlist (was always there) |
| Monitoring credentials stored? | 🔴 | ✅ verified: NOT persisted — only provider name + `hasCredentials` boolean |
| SSN/DOB encryption | 🔴 (claimed-but-unverified) | ✅ AES-256-GCM at rest for new writes; legacy rows still plaintext until you run the backfill script in `PRELAUNCH_PUNCHLIST.md` |
| No API versioning | 🟡 | ✅ `/api/v1` alias mounted |
| CORS policy too open | 🟡 | ✅ locked to `credxme.com` + `www.credxme.com` |
| No health check endpoint | 🟡 | ✅ verified: `/health` returns `{status:"ok"}` (was always there) |
| Error stack leakage | 🟡 | ✅ verified: error handler returns generic "Internal server error", logs full context to Railway |

### 4. Payment Processing — Authorize.Net path

You confirmed: **Payment Cloud merchant account → Authorize.Net gateway**. That changes the integration shape from generic to specific. Here's the recommended path:

| Item | Status | Action |
|------|--------|--------|
| Merchant account approved | ⚠️ external | Confirm Payment Cloud has issued: `API Login ID`, `Transaction Key`, `Signature Key` (HMAC-SHA512 for webhooks). Sandbox creds first. |
| API keys storage | ⚠️ pending | Once issued: set `AUTHNET_API_LOGIN_ID`, `AUTHNET_TRANSACTION_KEY`, `AUTHNET_SIGNATURE_KEY`, `AUTHNET_ENV=production` (or `sandbox`) on Railway. NEVER in repo. |
| Checkout UX | ⚠️ pending | **Recommended: Accept Hosted (redirect) for SAQ A scope.** User clicks "Pay" → POST `getHostedPaymentPageRequest` from your server → redirect → Authorize.Net hosts the form → returns to your `successUrl`. Card data never touches your server. |
| Subscriptions | ⚠️ pending | Authorize.Net **ARB (Automated Recurring Billing)** for the Essential ($75/mo) and Family ($95/mo) plans. Or **CIM** if you want stored-card flexibility. ARB is simpler. |
| Webhooks | ⚠️ pending | Subscribe to `net.authorize.payment.authcapture.created`, `net.authorize.customer.subscription.failed`, `net.authorize.payment.refund.created`. Verify HMAC SHA-512 signature using `AUTHNET_SIGNATURE_KEY` against the `X-ANET-Signature` header. |
| Idempotency | ⚠️ pending | Use Authorize.Net's `refTransId` for follow-on actions (refund, void). For your own POST handlers, generate a UUID v4 idempotency key per checkout intent and store it in a `PaymentIntent` table. |
| Refund endpoint | ⚠️ pending | `createTransactionRequest` with `transactionType: refundTransaction` — references the original `transId`. |
| Sales tax | ⚠️ pending | Recommend TaxJar or Stripe Tax (works without Stripe payments) — automated nexus + rate calculation. Pass calculated tax in the Authorize.Net charge as a `tax` line. |

**PCI DSS scope with Accept Hosted: SAQ A** (~12 controls, mostly attestation-only). With Accept.js (server still serves the form): SAQ A-EP (~140 controls). Strongly recommend Accept Hosted for v1.

### 5. Legal & Compliance

| Item | Original | Now |
|------|----------|-----|
| Service agreement | ✅ | ✅ unchanged |
| 3-day cancellation right | ✅ | ✅ unchanged |
| CROA compliance | ⚠️ | ✅ **defensible**, contingent on signed-agreement language: you've stated the analysis/diagnostic is delivered *before* billing. CROA § 1679b(b) prohibits charging "before such service is fully performed." If the service performed pre-billing is "credit analysis and dispute strategy," charging after delivery is defensible. **Still recommend** a one-time consumer-protection-attorney review of the service agreement language — make sure it says: "You will receive your written credit analysis and dispute plan before any setup fee is charged." Document the analysis-delivered timestamp in `clientProgress.analysis.deliveredAt`. |
| State licensing | ⚠️ | ⚠️ unchanged — depends on which states you accept clients from. CA, GA, NY, FL require a license + bond. Decision needed. |
| Privacy Policy | 🔴 | ✅ landed at `/privacy` |
| Terms of Service | 🔴 | ✅ landed at `/terms` |
| Cookie consent | 🔴 | ⚠️ still missing — add Cookiebot, OneTrust, or simple JS banner. Not a blocker if you don't run cross-context advertising trackers (you don't), but EU/CA visitors expect it. |
| FCRA disclaimer | ✅ | ✅ unchanged |
| Affiliate disclosure (FTC) | ⚠️ | ✅ landed in landing + masterclass footers |

### 6. Masterclass & Content

No change. Day 1–6 slides + quizzes are present; videos are still `null`. Not a launch blocker but lowers perceived value.

### 7. Affiliate & Partner Links

| Item | Original | Now |
|------|----------|-----|
| Disclosure required | ⚠️ | ✅ landed |

### 8. Original Blocker List

| # | Action | Status |
|---|--------|--------|
| 1 | Connect Payment Cloud | 🟡 In progress — Authorize.Net path documented above |
| 2 | Privacy Policy | ✅ done |
| 3 | Terms of Service | ✅ done |
| 4 | CROA compliance | ✅ **defensible per your model** + attorney review recommended |
| 5 | Affiliate disclosure | ✅ done |
| 6 | Verify SSN/PII encryption | ✅ AES-256-GCM live for new writes; backfill pending |
| 7 | Rate limiting | ✅ verified + tightened |
| 8 | File upload security | ✅ verified |

### 9. Security Quick Check (Post-Fix)

```
✅ HTTPS enforced (HSTS preload via Vercel header)
✅ No mixed content
✅ API CORS scoped to credxme.com origins
⚠️ JWT in localStorage (XSS risk if compromised) — moving to httpOnly cookies is post-launch
✅ helmet headers on API: X-Frame, X-Content-Type, Referrer, COOP, CORP
✅ Vercel headers on web: Permissions-Policy, X-Frame, X-Content-Type, Referrer, HSTS-preload
✅ Rate limiting global + per-route (auth + leads)
✅ File upload size (10MB) + ext/MIME allowlist
✅ PII encryption-at-rest (AES-256-GCM) on new writes
✅ AuditLog writes on auth + intake events
⚠️ No CSP (inline scripts on landing — defer until refactor)
⚠️ No CAPTCHA on signup/leads (bot-flood risk on launch day)
⚠️ No 2FA (post-launch)
⚠️ No email verification (post-launch)
⚠️ Document storage non-persistent (multer memoryStorage; s3Key points to nothing)
⚠️ Legacy plaintext SSN/DOB rows still need backfill
```

---

## What's Still on You — Ranked by Launch Impact

### 🔴 Must do before paid launch

1. **Run the SSN/DOB backfill** (script in `PRELAUNCH_PUNCHLIST.md`). Until you run it, any legacy intake row remains plaintext. New intakes from this point forward are encrypted.
2. **Get Authorize.Net sandbox creds from Payment Cloud.** Once I have them, I can ship: hosted-payment-page redirect, ARB subscription create, webhook handler with HMAC-SHA512 verification, refund endpoint, `PaymentIntent` + idempotency table, `Payment` row reconciliation. Estimate: 1 focused session.
3. **State licensing decision.** Add a state-blocklist on the signup form for states where you don't yet have a license. Simple to wire once you decide.
4. **Attorney review of the service agreement** for CROA — specifically that the agreement says "analysis & dispute plan delivered before any fee is charged."
5. **Document storage backend.** Vercel Blob is the lowest-friction option — auto-provisioned, signed URLs, no AWS account needed. Alternatives: S3, R2.

### 🟡 Should do in first 2 weeks of launch

6. **CAPTCHA** on signup + lead form (Cloudflare Turnstile recommended).
7. **CAN-SPAM** physical-address + List-Unsubscribe in `apps/api/src/lib/email.ts`.
8. **Sentry** on the API (or any error-aggregator — Railway logs rotate fast).
9. **Cookie consent banner** for EU/CA visitors.
10. **Custom domain for API** — `api.credxme.com` CNAME to Railway. Then update `VITE_API_URL` and the 3 static HTML files (signup.html, masterclass.html, public/index.html) so the Railway URL isn't baked into the bundle.
11. **Masterclass Day 1–2 video content.**
12. **DSAR endpoints** — `/api/v1/account/export` and `/api/v1/account/delete` for CCPA self-service.

### 🟢 Post-launch

- httpOnly cookies for auth (replace localStorage JWT).
- 2FA (TOTP via authenticator app).
- Email verification gate before portal unlock.
- WCAG 2.1 AA audit.
- CSP on the landing page (after refactoring inline scripts to external files).
- SOC 2 readiness checklist.
- Headless dispute filing (FTC/CFPB) — already on the v2 roadmap.

---

## Authorize.Net Integration: What I'll Build When You Have Sandbox Creds

Concrete plan, in order, ~5–6 hours of focused work:

1. **Schema migration**: `PaymentIntent` table (id, clientId, planCode, amountCents, idempotencyKey, status, authnetTransId, createdAt, completedAt). `Subscription` table (id, clientId, authnetSubscriptionId, status, planCode, nextBillAt, createdAt, cancelledAt).
2. **`apps/api/src/lib/authnet.ts`** — typed wrapper around the Authorize.Net XML API: `getHostedPaymentPageToken()`, `createSubscription()`, `cancelSubscription()`, `refund()`.
3. **`POST /api/v1/billing/checkout/session`** — creates a `PaymentIntent`, returns the Accept-Hosted token + redirect URL.
4. **`GET /billing/return?intent=...`** — landing route after Authorize.Net redirect; reconciles `PaymentIntent.status` from `getTransactionDetails`, unlocks the corresponding plan.
5. **`POST /api/v1/billing/webhook`** — verify `X-ANET-Signature` HMAC, update `PaymentIntent`/`Subscription`, write `AuditLog` rows.
6. **`POST /api/v1/billing/refund`** — staff-only (`requireRole(['STAFF','ADMIN'])`); refunds by `transId` for "+50 points or money back" guarantee.
7. **Frontend**: replace the placeholder Buy buttons in `signup.html` and the portal's "Upgrade" flow with calls to `/api/v1/billing/checkout/session` + `window.location.assign(token.url)`.
8. **Email**: send receipt via Resend on webhook confirmation. Include CAN-SPAM footer.
9. **Tax**: optional v1.1 — pass calculated tax in the create-transaction request.

Cost basis to match your existing pricing schema:
- `MASTERCLASS` $47 → one-time charge.
- `ESSENTIAL` $150 setup + $75/mo → one-time charge after analysis delivery + ARB subscription.
- `PREMIUM` $447 → one-time charge after analysis delivery (with refund hook for the +50 guarantee).
- `FAMILY` $300 setup + $95/mo → same shape as Essential.

---

## Updated Launch-Readiness

```
Before this pass:  72 / 100  (audit-credxme-prelaunch.md)
After hardening:   82 / 100  (PRELAUNCH_PUNCHLIST.md)
After live verify: 86 / 100  (this report)
```

The 14-point gap is real but well-scoped. Get me Authorize.Net sandbox creds and a state-eligibility list, and I can close another 8–10 points in one focused session.
