# CredX Deployment Rescue Prompt for Claude Code CLI

You are working inside the CredX repo and your job is to finish deployment rescue and finalization with minimal drift, minimal rewrites, and clear verification.

## Repo + Targets
- Repo: `/home/ubuntu/.openclaw/workspace/credx-platform`
- Public domain: `https://credxme.com`
- Intended API target: `https://credxapi-production.up.railway.app`
- Intended frontend app: `apps/web`

## Mission
This is **not** a greenfield build.
This is **not** a redesign project.
This is a **deployment rescue + finalization task**.

The platform code is already far enough along.
The main issue is deployment/config drift between old hosting/project setups and the current repo state.

Your goal is to get to **one clean frontend deployment path** and make sure the live site reflects the current app in `apps/web`.

## Current Product State
Assume these already exist and should not be rebuilt from scratch:
- lead capture
- auth
- onboarding endpoints
- admin/dispute structure
- client portal onboarding wizard
- upload flow
- dashboard shell

Assume the codebase already includes:
- updated portal logic in `apps/web/src/clientPortal.tsx`
- onboarding wizard in the portal flow
- secure file upload flow
- credit report upload support for PDF + HTML/HTM + existing image formats
- login password visibility toggle
- favicon/icon adjustments
- temporary fallback page at `/quick-access.html`

Also assume:
- local web build succeeds
- local API build succeeds
- production auth API has already responded successfully before

## Key Diagnosis To Start From
The likely remaining problem is **hosting/project/domain drift**, not missing app features.
Previous drift involved old or confusing project linkage around:
- `credx-platform`
- `web`
- `credx`
- unrelated `njtrimlight`

Netlify was also previously involved in stale/wrong publish behavior.

Do **not** keep multiple hosting paths alive.
Pick the cleanest path and finish it.

## Preferred Decision Rule
1. Prefer **Vercel** if it can be cleaned up quickly.
2. If the current Vercel linkage is haunted/drifted, use **one fresh clean Vercel project** for `apps/web` and stop relying on the old ones.
3. Only recommend another host if Vercel clearly costs more time/churn than a clean cutover.

## Constraints
- Minimal credits
- Minimal rewrites
- Minimal new infra
- Do not explore every possibility
- Do not overbuild beyond MVP
- Do not touch Stripe/billing except to note it remains deferred
- Prefer concrete verification over theory

## Visual Scope
A small professional polish pass is allowed **only if lightweight**:
- better spacing/hierarchy
- cleaner section flow
- subtle image/section motion on scroll
- more premium feel

Do **not** do a full redesign.
Do **not** add heavy animation libraries unless clearly necessary.
Prefer lightweight CSS/native motion.

## Your Tasks
1. Audit the current Vercel linkage/config from repo + local metadata.
2. Determine the cleanest deploy path for `apps/web`.
3. If old Vercel projects are drifted, create or recommend one fresh Vercel project and stop using the old ones.
4. Verify minimal env vars required for frontend deploy.
5. Get one working preview deployment.
6. Confirm routes:
   - `/`
   - `/portal`
   - `/adminportal`
   - `/quick-access.html` (temporary fallback only)
7. Confirm frontend points to `https://credxapi-production.up.railway.app`.
8. Apply only lightweight visual touch-ups if they materially improve professionalism.
9. Produce the final production cutover checklist for `credxme.com`.

## Working Style
- Be decisive.
- Avoid dead ends.
- Don’t maintain parallel hosting setups.
- Prefer the smallest set of changes that gets a clean, verifiable result.
- Verify with actual build/deploy evidence.

## Required Output Format
1. Current diagnosis
2. Chosen deployment path
3. Exact settings/env vars
4. Actions taken
5. Visual touch-ups included
6. What still blocks production, if anything
7. Final cutover checklist
