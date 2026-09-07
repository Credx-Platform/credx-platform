# Step 1 Hardening Status - 2026-08-06

## Completed In Code

- Added API JSON response sanitizing so `passwordHash` is removed from outbound JSON responses.
- Made Cloudflare Turnstile fail closed in production when `TURNSTILE_SECRET_KEY` is missing.
- Made Stripe webhooks fail closed in production when Stripe secrets or webhook signatures are missing.
- Locked Lob physical-mail sending to `STAFF` and `ADMIN` roles.
- Ran dependency patching:
  - `tsx` now resolves to `4.23.8`.
  - `esbuild` used by `tsx` now resolves to `0.28.1`.
  - `react-router-dom` was moved forward to `7.18.2`.

## Verified

- `npm run build` passed after the hardening changes.
- Railway production env check found these key API values set:
  - `PII_ENCRYPTION_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_SECRET_KEY`
  - `RESEND_API_KEY`
  - `SENDGRID_API_KEY`
  - `COMPANY_MAILING_ADDRESS`
  - `BILLING_CONFIRM_SECRET`
  - `CORS_ALLOWED_ORIGINS`

## Deployment Blockers

- `TURNSTILE_SECRET_KEY` is missing on Railway `@credx/api`.
  - Do not deploy this pass until it is set, or public signup/lead forms will fail closed.
- `LOB_API_KEY` is missing on Railway `@credx/api`.
  - Lob mailing remains safely unavailable until configured.

## Safe Operator Commands

Use these only after copying the real secret values from the provider dashboards:

```bash
printf '%s' 'PASTE_TURNSTILE_SECRET_HERE' | railway variable set TURNSTILE_SECRET_KEY --stdin --service '@credx/api' --environment production --skip-deploys
printf '%s' 'PASTE_LOB_API_KEY_HERE' | railway variable set LOB_API_KEY --stdin --service '@credx/api' --environment production --skip-deploys
```

After both values are set, rerun:

```bash
railway variable list --service '@credx/api' --json | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const vars=JSON.parse(s); for (const n of ['TURNSTILE_SECRET_KEY','LOB_API_KEY']) console.log(n+': '+(Object.prototype.hasOwnProperty.call(vars,n) && String(vars[n]||'').trim()? 'set':'missing/blank'));})"
npm run build
```

## Remaining Security Watch

- `npm audit` still reports 2 high vulnerabilities from `react-router` / `react-router-dom`.
- The current npm audit guidance is contradictory: suggested fixed versions bounce between ranges that are also flagged.
- Keep this on the dependency watch list and retest when the advisory/package metadata settles.
