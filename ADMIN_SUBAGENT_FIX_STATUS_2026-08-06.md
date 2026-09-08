# Admin Sub-Agent Fix Status - 2026-08-06

## Fixed In Source

- Copy button:
  - Uses Clipboard API when available.
  - Falls back to textarea copy.
  - Opens a manual copy dialog if browser clipboard rules block both methods.
  - Shows row-level `Copying...` / `Copied` feedback.

- Email button:
  - Shows row-level `Sending...` / `Sent` feedback.
  - Disables only when no sub-agent email exists or while the request is running.
  - Calls the existing staff/admin onboarding-email endpoint.

- Delete button:
  - Kept working.
  - Uses the same `preventDefault()` and `stopPropagation()` handling as Copy and Email.

- Refresh Scan:
  - Refreshes sub-agent data and the admin client list together.
  - Admin sub-agent API now includes `referredClients`.
  - Signups count uses actual referred clients as the stronger source of truth.
  - Details dropdown shows recent referred signups under each sub-agent link.

## Verified

- Full `npm run build` passed after the changes.

## Deployment Caveat

- Web-only deploy can surface the Copy/Email UI behavior.
- Full signup-rescan backend support needs API deploy.
- API deploy should wait until `TURNSTILE_SECRET_KEY` is set on Railway `@credx/api`, because Step 1 hardening makes public signup/lead CAPTCHA fail closed in production without it.
