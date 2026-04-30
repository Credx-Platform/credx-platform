# CredX Deployment Rescue Context (Updated)

## Scope
- Main repo: `/home/ubuntu/.openclaw/workspace/credx-platform`
- Public domain: `https://credxme.com`
- Intended API target: `https://credxapi-production.up.railway.app`

## Current Reality
This is still primarily a **deployment/config drift** problem, but the platform itself has moved forward.

The main product code is no longer the blocker.
The remaining work is to make sure the **live deployed frontend** consistently matches the **current repo state** and uses **one clean hosting path**.

## What Has Been Updated In The Platform
The following are now already in place in the repo:

### Frontend / portal
- `apps/web` is still the correct frontend source of truth.
- The client portal has been updated substantially in `apps/web/src/clientPortal.tsx`.
- The onboarding wizard is present and real, not placeholder-only.
- Secure upload flow now supports real file uploads in the portal/onboarding flow.
- Credit report upload support was expanded to include:
  - PDF
  - HTML / HTM
  - image formats already in use
- Login UX was updated with a password visibility toggle.
- Favicon / icon handling was changed to reduce stale/broken browser icon behavior.
- A fallback direct entry page now exists at:
  - `/quick-access.html`
  This is a temporary operational bypass, not the long-term main entry path.

### API / auth
- Backend auth is live and responds successfully in production.
- Portal login API has already been proven to work directly against production.
- Auth response handling was tightened so login/register responses do not expose `passwordHash` back to the client.
- Existing onboarding/auth/client endpoints are already present and functional enough for MVP usage.

### Build / deployment behavior
- Local web build succeeds.
- Local API build succeeds.
- Root `package.json` supports skipping Prisma generation with:
  - `SKIP_PRISMA_GENERATE=1`
- Vercel deploys have succeeded from temporary clean copies, which strongly suggests the remaining problem is **project linkage / stale project drift / domain attachment confusion**, not broken app code.

## What The Problem Is Now
The main unresolved issue is this:
- the public domain and/or active Vercel project linkage may still be serving the wrong project, stale output, or confused deployment lineage.

This is no longer a greenfield setup problem.
It is now a **deployment rescue / finalization / cutover cleanup** task.

## Known Drift / Hosting Confusion
Previously observed project/config drift involved:
- `credx-platform`
- `web`
- `credx`
- unrelated `njtrimlight` project

There was also earlier Netlify confusion with stale publish output.

At this stage, the goal is to stop supporting multiple possible frontend paths and settle on **one**.

## Product Boundaries
Do **not** redesign the product.
Do **not** expand scope into unrelated new systems.
Do **not** touch Stripe/billing except to note that billing remains deferred.

Already exists and should be treated as MVP-complete enough for deployment rescue:
- lead capture
- auth
- onboarding endpoints
- admin/dispute structure
- client portal onboarding wizard
- upload flow
- client dashboard shell

A **visual touch-up pass is in scope** if it stays lightweight and professional.
That includes:
- refining spacing, typography balance, hierarchy, and polish
- improving section-to-section visual flow
- subtle image/section motion or reveal behavior as the page scrolls
- making the site feel more premium and intentional

That does **not** mean a full redesign, animation-heavy rebuild, or large brand reset.
Motion should be tasteful, light, performant, and professional.

## Objective
Get **one clean frontend deployment path** working and make it the only supported path.

At the same time, ensure the live frontend presentation is polished enough to feel production-ready:
- professional visual finish
- cleaner flow between sections
- subtle motion/image movement where it improves perceived quality
- no flashy or gimmicky effects

## Preferred Decision Rule
- Prefer **Vercel** if it can be made clean quickly with a fresh, unambiguous project.
- If the current Vercel setup remains haunted/drifted, stop patching old projects and use **one fresh clean Vercel project** for `apps/web`.
- Only recommend another host if Vercel is clearly not recoverable without more churn.

## Constraints
- Minimal credits
- Minimal rewrites
- Minimal new infrastructure
- Do not explore every possibility
- Pick one deployment path and finish it
- Prefer concrete actions and verification over theory
- Visual polish should be incremental, not a ground-up rebuild
- Prefer CSS/native lightweight motion over heavy animation libraries unless clearly justified

## Task Frame
1. Audit the **current Vercel linkage/config** from repo + local metadata.
2. Determine the cleanest deploy path for `apps/web`.
3. If existing Vercel projects are drifted, create or recommend **one fresh Vercel project** and stop using the old ones.
4. Verify the minimal env vars required for frontend deploy.
5. Get to one working preview deployment.
6. Confirm these frontend routes work from the chosen deploy:
   - `/`
   - `/portal`
   - `/adminportal`
   - `/quick-access.html` (temporary fallback only)
7. Confirm the frontend points to:
   - `https://credxapi-production.up.railway.app`
8. Include a lightweight professional visual polish pass for the chosen frontend path.
9. Give the final production cutover checklist for `credxme.com`.

## Important Execution Guidance
- Be decisive.
- Do not keep multiple hosting paths alive.
- Do not waste time on Netlify dead ends unless required for domain cleanup evidence.
- Treat this as a **deployment finalization** task.
- Use the current codebase state, not old assumptions.
- If visual upgrades are included, keep them elegant and restrained.
- Prioritize professional trust-building aesthetics over flashy motion.

## Required Output Format
1. Current diagnosis
2. Chosen deployment path
3. Exact settings/env vars
4. Actions taken
5. Visual touch-ups included
6. What still blocks production, if anything
7. Final cutover checklist
