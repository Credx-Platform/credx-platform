# 3D Landing Page — Phase 1 Audit

Written before any production code was modified, per the brief.

## 1. The brief assumes a stack this page does not use

The brief specifies Next.js, React, the CredX component library, Spline and
Framer Motion. The homepage is none of those.

| Brief assumes | Reality |
| --- | --- |
| Next.js | **No Next.js anywhere in the repo.** Web app is Vite + React 18, served by a plain `node:http` server (`apps/web/server.mjs`) |
| React homepage | Homepage is a **single static HTML file**, `apps/web/public/index.html` (650 lines, inline `<style>` + inline `<script>`) |
| CredX component library | React components exist (`clientPortal.tsx`, `TeamDashboard.tsx`, `App.tsx`) but are mounted only on `/portal`, `/adminportal`, `/team`, `/financial-readiness`. **They never load on `/`.** |
| Framer Motion / GSAP | Neither is a dependency. Existing motion is hand-written CSS transitions + `IntersectionObserver` |

Vite copies `public/*.html` verbatim into `dist/`. The homepage is not part of
any React bundle, so React components cannot be reused on it without adding a
new entry point and shipping a React runtime to every visitor — which directly
contradicts the brief's own performance requirements.

**Decision: keep the homepage as one static HTML file.** The brief says "Preserve
the existing CredX stack whenever possible" and "Do NOT introduce a new framework
unless absolutely necessary." Converting `/` to React would be the larger, riskier
change and would slow first paint.

## 2. Spline is not viable here — and this is the important one

The brief asks for Spline "if practical." It is not, for three independent
reasons:

1. **Content-Security-Policy blocks it.** As of the 2026-09-08 release the site
   sends `script-src 'self' 'unsafe-inline' https://www.paypal.com
   https://www.paypalobjects.com https://challenges.cloudflare.com` and
   `connect-src 'self' <api> https://www.paypal.com`. Spline's viewer loads from
   `unpkg.com` and streams `.splinecode` scenes from `prod.spline.design`. Both
   are blocked, silently, with no visible error. Shipping Spline means widening
   CSP to allow a third-party script origin *and* remote scene fetches — undoing
   security hardening that was just scored and shipped.
2. **Weight.** The Spline runtime is ~1 MB of JavaScript plus scene payload, on a
   page whose stated requirement is "CTA usable before 3D fully initializes" and
   "fast first paint."
3. **No scene exists.** There is no Spline account, project or `.splinecode`
   asset in this repo. One would have to be authored in Spline's editor — that is
   a design task outside a code session, and it cannot be committed as source.

**Decision: build the 3D with CSS 3D transforms** (`transform-style: preserve-3d`,
`perspective`, `rotateX/Y/Z`) driven by pointer position and scroll, with no
external dependency. This is genuinely the better engineering choice here, not a
downgrade: it costs ~0 KB of new JavaScript, is GPU-composited, works without
WebGL, degrades cleanly, respects `prefers-reduced-motion`, and needs no CSP
change. If a true WebGL scene is wanted later, the correct path is to self-host
the runtime and scene under `/assets/` so `'self'` covers it.

## 3. Existing backend connections that must not break

These are live and verified working in production. Every one is preserved.

| Integration | Contract |
| --- | --- |
| **Cesar chat** | `POST /api/cesar/chat`, body `{message, history}` → `{html, reply}`. 12s `AbortController` timeout. Falls back to the local `getCesarReply()` regex responder on any failure. |
| Chat DOM ids | `chatMessages`, `chatInput`, `chatSend`, `.chat-quick` buttons |
| Cesar nudge | `cesarNudge`, `cesarNudgeClose` — 15s delayed slide-in, `sessionStorage`-dismissed, suppressed while `#chat` is on screen |
| Toast | `toast` element |
| Internal links | `/signup`, `/portal`, `/product`, `/pricing`, `/masterclass`, `/masterclass-checkout`, `/privacy`, `/terms`, `/refund-policy`, `/cancellation-policy`, `/croa-disclosure` |
| API proxy | `server.mjs` forwards `/api/*` and `/health` to the Railway API. The page calls **relative** paths, so it works on any origin. |

The chat block, its fallback responder, the nudge and the toast are carried over
**unchanged**. The rewrite is presentation only.

## 4. Real readiness model — use it, don't invent one

The brief's example breakdown (`CREDIT / DEBT / INCOME / BUSINESS`) does not match
the shipped engine. `apps/api/src/lib/readinessScore.ts` scores six categories
out of 100:

| Category | Key | Max |
| --- | --- | ---: |
| Profile Foundation | `profile` | 15 |
| Credit Data Depth | `creditData` | 20 |
| Utilization Readiness | `utilization` | 20 |
| Derogatory Risk | `derogatory` | 20 |
| Action Progress | `activity` | 15 |
| Education Progress | `education` | 10 |

Bands (`labelFor`): ≥80 **Strong Readiness**, ≥65 **Preparing**, ≥45 **Building**,
else **Needs Foundation**.

**Decision: the landing page uses the six real categories and the real band
names.** Inventing marketing categories would mean a visitor sees one model on the
homepage and a different one after signing up. The demo score of 78 lands in
"Preparing", which is consistent with the real thresholds.

## 5. Data availability — what is real and what is demo

`GET /api/progress/readiness` is **`requireAuth`**. There is no public readiness
endpoint, so a logged-out visitor's real score cannot be shown. Public endpoints
are limited to `/api/billing/plans`, `/api/billing/paypal/config`,
`/api/cesar/chat`, `/api/auth/*` and `/api/leads`.

**Decision: all hero/dashboard/action-plan numbers are demo data, defined once in
a single `CREDX_DEMO` object at the top of the page script, visibly commented as
illustrative, and never fetched from or written to production data.** Category
maxima and band thresholds in that object mirror the real engine so the illustration
stays truthful. Wiring real data later is a matter of replacing that one object —
see `3D_LANDING_BACKEND_GAPS.md`.

Nothing on the page claims these are a real user's numbers.

## 6. Design system already in place — reuse, don't reinvent

`index.html` declares tokens explicitly "Synced with
`apps/web/src/design-tokens.css` — single source of truth":

- Surfaces `--bg #060a12`, `--bg2 #0b1220`, `--bg3 #101a2b`, `--bg4 #182035`
- Accent `--cyan #00c6fb` / `--cyan2 #00e5ff`, plus dim and glow variants
- Text `--white`, `--text`, `--muted`, `--muted2`
- Status `--green #22c55e`, `--red #f87171`, `--gold #f59e0b`
- Type: IBM Plex Sans + IBM Plex Mono via Google Fonts (already CSP-allowed)

**Decision: the rebuild uses these tokens exclusively.** No new palette, no new
font. This keeps the marketing page and the signed-in product visually continuous
and is why the result reads as fintech rather than crypto.

## 7. Compliance constraints carried into the copy

From `docs/SAAS_AUDIT.md` and the CROA work: no guaranteed outcomes, no approval
odds, positioning is "Credit Intelligence & Financial Readiness," and the
readiness score must carry a non-FICO disclosure. The rebuilt page states plainly
that the CredX Readiness Score is a proprietary educational and planning metric
and not a FICO score or lender credit score, and uses "may / can help / indicators
/ readiness" throughout. Existing legal footer links are preserved.

## 8. Performance and accessibility posture

- No new network requests, no new dependencies, no new fonts.
- 3D is CSS transforms only — GPU-composited, no WebGL requirement.
- All copy is real crawlable HTML; nothing meaningful lives inside a canvas.
- Pointer parallax is attached once, `passive`, and rAF-throttled.
- Every animation is gated behind `prefers-reduced-motion: no-preference`.
- Scroll reveals use `IntersectionObserver` (already the page's existing pattern),
  not scroll handlers, and never take over scrolling.
- Existing `h1` → `h2` hierarchy, skip-safe landmarks and focusable controls kept.

## 9. Recommended implementation path

1. Rebuild `apps/web/public/index.html` in place, one file, tokens preserved.
2. Port the chat, fallback responder, nudge and toast blocks over verbatim.
3. Add sections in the brief's order, all as static HTML.
4. Layer CSS 3D on the hero and the score breakdown.
5. Verify locally: every internal link, the Cesar round trip, reduced motion, no
   WebGL, mobile widths.
6. Keep the previous file recoverable in git history for instant rollback.
