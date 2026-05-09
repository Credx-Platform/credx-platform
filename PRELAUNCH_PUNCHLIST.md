# CredX Pre-Launch Punch List

Generated: 2026-05-10. Companion to `audit-credxme-prelaunch.md` after the
2026-05-10 hardening pass (commits `2a02082` + `37b7e91`).

## ✅ Landed in this pass

- **API security headers** via `helmet` (CSP intentionally off — the marketing
  pages run inline scripts; turn on with a strict policy after auditing every
  inline `<script>`).
- **CORS lockdown** to `credxme.com` + `www.credxme.com` via `CORS_ALLOWED_ORIGINS`.
- **`trust proxy=1`** so Railway client IPs reach the rate limiter.
- **Per-route rate limits**: 20/15min on `/api/auth/{login,register,password-setup}`,
  10/hour on `/api/leads`. Global stays at 200/15min.
- **API versioning**: every route is now also mounted under `/api/v1/...`.
- **AES-256-GCM PII encryption** (`apps/api/src/lib/encryption.ts`). New
  applications.ts intake writes encrypted SSN/DOB. Legacy plaintext rows are
  still readable; backfill explicitly when ready.
- **Audit log writes** on LOGIN_SUCCESS / LOGIN_FAILED / PASSWORD_SET /
  PASSWORD_RESET / INTAKE_SUBMITTED.
- **Privacy Policy** at `/privacy` (GLBA + CCPA/CPRA-aligned).
- **Terms of Service** at `/terms` (CROA disclosure, affiliate disclosure,
  liability cap, governing law).
- **Robots.txt** + **sitemap.xml**.
- **Open Graph / Twitter Card / JSON-LD** on the landing page.
- **FTC affiliate disclosure** in landing + masterclass footers.
- **HTTPS hardening headers** at the Vercel edge (X-Frame-Options,
  Referrer-Policy, Permissions-Policy, HSTS preload).
- **Privacy/Terms acknowledgment** added to the signup consent checkbox.

## 🚨 Required from you before the new deploy is healthy

1. **Set `PII_ENCRYPTION_KEY` on Railway (production env).**
   Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Without it, intake POSTs throw on encryption. The key is the *only* thing
   that lets you decrypt SSN/DOB later — store it in a password manager too.
2. **Set `CORS_ALLOWED_ORIGINS` on Railway** (defaults are fine but be
   explicit): `https://credxme.com,https://www.credxme.com`.
3. **Backfill existing plaintext SSN/DOB.** Write a small one-shot script
   that reads each `Client` row, runs `encryptPII()`, writes back. Sample:
   ```ts
   import { prisma } from './apps/api/src/lib/prisma.js';
   import { encryptPII, isEncrypted } from './apps/api/src/lib/encryption.js';
   const rows = await prisma.client.findMany();
   for (const c of rows) {
     const patch: any = {};
     if (c.ssnEncrypted && !isEncrypted(c.ssnEncrypted)) patch.ssnEncrypted = encryptPII(c.ssnEncrypted);
     if (c.dobEncrypted && !isEncrypted(c.dobEncrypted)) patch.dobEncrypted = encryptPII(c.dobEncrypted);
     if (Object.keys(patch).length) await prisma.client.update({ where: { id: c.id }, data: patch });
   }
   ```
   Run once after `PII_ENCRYPTION_KEY` is set.

## 🔴 Blockers I cannot ship for you

| # | Item | Why I can't | What I need from you |
|---|------|-------------|----------------------|
| 1 | **Payment Cloud / Stripe wiring** | No API creds, no merchant account, no webhook secret in this env. | Sandbox creds + webhook secret + the plan SKU map. I can build checkout, subscription create, webhook handler, refund endpoint, idempotency keys, retry logic, invoice email. |
| 2 | **CROA legal review of pricing** | I'm not your attorney. CROA § 1679b prohibits charging for services before performed; the Essential ($150 setup + $75/mo) and Premium ($447) structures need a consumer-protection lawyer to bless. | Attorney sign-off in writing that the setup fee maps to "analysis & document preparation," not "repair." |
| 3 | **State licensing & bonding** | This is per-jurisdiction filing, often with surety bonds ($10k–$100k). | Decide which states you'll accept clients from on day one. CA, GA, NY, FL definitely require licenses. I can scaffold a state-blocklist in the signup form once you decide. |
| 4 | **Document storage** | Multer is in-memory; the `s3Key` written to `Document` rows points to nothing. Files are parsed by AI Gateway then GC'd. | Decide: S3, R2, Vercel Blob, or Railway volumes. Then I can wire `@aws-sdk/client-s3` (or equivalent), encrypt in transit, sign URLs for retrieval, scrub on user delete. |
| 5 | **Masterclass video content** | All `url: null`. | Hand me at least Day 1 + Day 2 video URLs (Mux, Cloudflare Stream, or YouTube unlisted) and I'll wire them in. |
| 6 | **Email verification flow** | Nice-to-have for spam control, but needs UI + token model decisions. | Confirm you want it, and I'll add a `verifyEmail` token + a "verify your email" gate before portal unlock. |
| 7 | **2FA** | TOTP or SMS — different cost/risk profile. | Pick one. SMS via Twilio is simplest for credit-repair clients (low tech literacy); TOTP is more secure. |
| 8 | **CAPTCHA on signup/leads** | The lead form fires emails on every POST — bot-flood risk. | Pick one: Cloudflare Turnstile (free, no Google), hCaptcha, or reCAPTCHA v3. I'll wire it in. |

## 🟡 Recommended next, in priority order

1. **CAN-SPAM compliance in `apps/api/src/lib/email.ts`.** Add physical mailing
   address + List-Unsubscribe header to every transactional email footer.
   Required by 15 U.S.C. § 7704.
2. **Sentry (or similar) on the API.** Right now `console.error` is the only
   forensic trail; Railway log retention is short.
3. **Stripe + Vercel Marketplace integration.** If Payment Cloud falls
   through, Stripe via Vercel Marketplace auto-provisions env keys and gives
   you Sigma reports. (Marketplace skill: `vercel:marketplace`.)
4. **Cookie consent banner** for EU/CA/CO/CT/UT/VA visitors.
5. **WCAG 2.1 AA audit** — tools like axe-core or Lighthouse. Touch contrast,
   keyboard nav, ARIA on the canvas signature pad and quiz components.
6. **Backup & DR runbook.** Confirm Railway PG nightly backups are on; document
   restore procedure in `DEPLOYMENT.md`.
7. **Data Subject Access Request (DSAR) endpoint.** Required by CCPA — a
   `/api/v1/account/export` and `/api/v1/account/delete` for self-service.
8. **SOC 2 readiness checklist.** Even pre-audit, start logging access to
   PII reads (not just writes), session invalidation on password change,
   formal change-management around prod merges.
9. **CSP rollout.** Re-audit every inline script on the marketing pages, move
   them to external files, then turn on `helmet.contentSecurityPolicy()`.
10. **Headless dispute filing (FTC/CFPB)** — already planned as v2 in
    `project_credx_filing_automation_plan.md`. Keep it on the roadmap, not
    pre-launch.

## Updated launch-readiness score

The original audit landed at **72/100**. After this pass I'd estimate **82/100**.
The remaining 18 points are payment processing (single biggest item),
attorney-validated CROA structure, document storage, and content completeness
(videos). None of those are technical blockers I can clear without your inputs.
