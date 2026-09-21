# Integrations

## CURRENT

- Railway: hosting/deploy target.
- PostgreSQL: Prisma database.
- Vercel Blob: private document storage/signed URLs.
- Resend: primary email path.
- SendGrid: email fallback and event webhook route.
- SMTP: email fallback.
- Stripe: webhook/payment handling.
- PayPal: order/capture/webhook handling.
- Lob: dispute letter mailing route.
- Cloudflare Turnstile: public-form bot protection.
- Vercel AI Gateway: AI provider abstraction.
- Anthropic: direct response-ingest AI route.
- OpenClaw: signup notification webhook.
- MyFreeScoreNow: credit score API helper if configured.

## GAPS

- No central integration registry.
- No uniform retry/backoff worker for external calls.
- No central provider status surface.
- No product analytics provider is wired in.
- No Sentry or equivalent error monitoring is evident.

## RULE

Optional integration failure must not crash the core CredX application.

## EMAIL OPT-OUT (CAN-SPAM / RFC 8058)

Every email rendered through `renderEmailShell` carries an **Unsubscribe**
button plus the postal address CAN-SPAM requires. The button is per-recipient:
templates embed `{{CREDX_UNSUBSCRIBE_URL}}` and `sendEmail` swaps it for a link
signed with HMAC-SHA256, so a forwarded link cannot opt out a different address.

Flow:

| Surface | Path | Behaviour |
| --- | --- | --- |
| Footer button | `APP_URL/unsubscribe?token=…` | Confirmation page. `GET /api/unsubscribe` only *reports* status — link scanners cannot opt anyone out by prefetching. The page POSTs to act. |
| Mail client | `API_URL/api/unsubscribe/one-click?token=…` | RFC 8058 `List-Unsubscribe-Post`. POST, no confirmation, required by Gmail/Yahoo for bulk senders. Emitted only when `API_URL` is HTTPS. |
| Mailto | `unsubscribe@credxme.com` | Always present as the fallback target. |
| SendGrid webhook | `unsubscribe`, `group_unsubscribe`, `spamreport` | Written to the same suppression list, before the client lookup, so opt-outs from leads without accounts are honoured. |

`EmailSuppression` holds one row per lowercased address. It is keyed by address
rather than user id on purpose: most unsubscribes come from leads who have no
account, and an opt-out must outlive account deletion.

**Category matters.** `sendEmail` takes `category: 'marketing' | 'transactional'`
and **defaults to transactional**, so an unmarked caller is never silently
dropped. Only `marketing` consults the suppression list. Today the masterclass
drip is the sole `marketing` sender; password setup, receipts, portal-ready and
analysis emails stay transactional and must keep reaching people who opted out.
To change a sender's classification, change that one argument.

Environment:

- `UNSUBSCRIBE_TOKEN_SECRET` — HMAC key for links. Falls back to `JWT_SECRET`.
  Rotating it invalidates every unsubscribe link already in inboxes, so prefer a
  dedicated value.
- `APP_URL` — origin of the confirmation page. Without it the footer degrades to
  the mailto rather than rendering a dead link.
- `API_URL` — must be HTTPS for one-click to be advertised.
- `COMPANY_MAILING_ADDRESS` — **required by CAN-SPAM**; unset renders a visible
  `[MAILING ADDRESS NOT SET]` placeholder in every email footer.
