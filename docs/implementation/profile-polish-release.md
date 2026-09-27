# Profile isolation polish — 2026-09-28

## Scope and provenance

Branch: `fix/landing-profile-polish-20260928`, based on `origin/main` at
`37442e5`. Canonical checkout:
`/home/ubuntu/.openclaw/workspace/credx-platform` (Credx-Platform/credx-platform).
Its 11 modified files and 3 untracked API files were left untouched. No staged
changes or local main commits ahead of origin/main were found.

Live is NOT origin/main. Before editing, the landing HTML, cinematic CSS and JS
were fetched from www.credxme.com and copied byte-for-byte into this isolated
worktree. SHA-256 baseline:

- index.html: `ca66342966f205d19b6351a7b4dad6d3c4d0fed400a237d077c6fcb9fc523488`
- landing-cinematic.css: `38444f490bfae6ed7c398a78213ed7481b6d0b4d11dadbd12a5c9e316c6359f0`
- landing-cinematic.js: `18c3454bfbbb5a4ed71e5b327da82adcba1538af52a6643c489c9c7fe1bc9830`

The existing Instagram background was restored from the remote landing branch
and hash-matched to live:
`d7815b007ee2de60ec586a02a9e1def2839e26e014ea1b7c20219c1f8b09f16e`.
This explains the preservation diff relative to main: dark chat/start screen,
white buffer, owner sizing, agent socials and independent hero motion are live
baseline, not a redesign. Cinematic JS is unchanged from live.

## Actual changes relative to live

- Enforce `[hidden]` on the exact agent/owner/photo selectors, never the runway.
- Select agent mode only for `/agent-landing` with a nonempty `agent` query;
  never on the main homepage and never from stored referral state. Hide owner
  before an agent request completes.
- No owner-image fallback in the agent card. Missing/failed agent headshots stay
  hidden; invalid or unavailable agents do not show an unrelated owner profile.
- Apply inter-profile margin only when the agent card is not hidden.
- Version the cinematic asset references for returning browsers.
- Remove the nonexistent `agent-team-office.jpg` image reference (404 confirmed
  locally and live), retaining the existing dark banner background/layout.
- Add browser regression coverage with mocked agent responses and no live writes.

## Verification

- `npm run test:web`: build passed; 6 routing tests passed.
- `npm test`: 72 passed, 80 skipped for unavailable TEST_DATABASE_URL; no failures.
- Rebuild after removing the broken image passed.
- Cinematic JS and inline JS syntax checks and `git diff --check` passed.
- Live Chromium proved the hidden agent card incorrectly computes to `grid` at
  390px and 1440px; measured owner width is 200px mobile / 280px desktop.
- Browser regression command: set PLAYWRIGHT_MODULE to an installed Playwright
  module and run `node scripts/test-landing-profiles.mjs` against the built local
  server on 4187. Covers owner, agent, missing/broken headshot, 404 and network
  failure, normal scroll, overflow, assets and page errors at both widths.
- All 12 browser cases passed at 390px/1440px, with no unexpected failed assets,
  page errors or horizontal overflow. Inspected screenshots of dark chat/white
  buffer, portal midpoint and owner reveal; runway and animation remain intact.

## Deployment blocker — do not deploy this branch wholesale

User subsequently authorized web-only deployment. It remains unsafe until the
non-landing live frontend source is reconciled:

- Live `/portal` references `client-main-BWT8kxmU.js`; clean branch builds
  `client-main-BsRxniq5.js`.
- Live `/adminportal` references `adminportal-3Vw9Adxw.js`; clean branch builds
  `adminportal-9Foe94Lg.js`.
- A separate diagnostic build with the existing dirty App.tsx and clientPortal.tsx
  produced `adminportal-DwHdS1yB.js` / `client-main-Dw95_EZ8.js`, also not live.
  Those unrelated edits were NOT included in this branch.
- The existing landing calls `/api/sub-agents/public/:code`. Live responds with
  its JSON profile-not-found response for an invalid code, but origin/main has no
  implementation of that endpoint. Valid-agent UI tests use fixtures; no actual
  agent was enrolled or changed.

Railway read-only inspection resolved project `courageous-dedication`
(`b7a1b58e-631d-4f60-9d57-8deda2ef6b0c`), production
`f363b5bf-9eef-4cfa-8fcc-6ce9a14b6a2c`, web service
`2be4e207-da01-467d-a8f8-9966da0e1d00`. Existing successful web deployment:
`20ae6a52-6d4d-4da9-9d41-c38bb123b081`, image
`sha256:89fa0039df29087bcb6b37e83eb5bbfe1fcebbaeae22bdedbf3aa70692caa5c4`.
Manifest uses `npm run build --workspace=@credx/web` and
`npm run start --workspace=@credx/web`, canonical repo confirmed in service source.

Next release must preserve/reproduce those existing portal bundles, deploy only
the web service, then verify the returned manifest, SUCCESS status, exact live
HTML/CSS/JS hashes, fresh-browser profile/scroll behavior and unchanged API
deployment. No merge, deployment, API change or database mutation was performed.
