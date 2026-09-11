# CredX final landing polish

## Scope
Existing landing page and existing WebP assets; no new renderer, raster artwork,
platforms, API, schema, checkout or authentication changes. No new reference image
was attached to this request, so composition follows the written direction.

## Interaction design
- Headline, explanation and CTAs above the connected five-asset composition at all widths.
- Scroll-coupled group scale 1 → .52 desktop / .68 mobile; smoothstep easing,
  12px lead-in, no per-object scale or asynchronous interpolation tail.
- Cached sticky geometry, shorter hero/software runways, reversible timelines.
- About aperture starts above the section; luminous 7px desktop / 4px mobile
  core, secondary light rings, masked content reveal. Visible at 25% entry and
  cleared before the reading position. No text-by-text choreography.
- Compact 52px circular social targets, blue underglow and subtle hover lift.
  Instagram, YouTube and Facebook URLs retained. Standard Simple Icons v16
  glyphs embedded locally (https://github.com/simple-icons/simple-icons/tree/16.0.0,
  CC0-1.0); platform names remain available to screen readers.
- Varied grouped rise, lateral, fan, depth and scale entrances. Pricing/final
  conversion controls remain static. Placeholder testimonials and unsupported
  ratings replaced with factual product-benefit cards; section retained.

## Cyber energy / performance
- No fixed rail paths, star dots or comet heads. Symmetric light segments.
- Spawn position, orientation, direction, travel distance, curvature, length,
  opacity, lifetime and next-spawn delay sampled anew. Edge and interior origins.
- Typical lifetime 350–1150ms, occasional 1200–1450ms. Cap 3 desktop / 2 mobile
  or low-capability hardware. Completion removes each element.
- WAAPI transform/opacity animation plus one bounded spawn timer. No idle
  requestAnimationFrame loop. Spawn suppressed during the About aperture.
- Visibility/pagehide suspends timers and removes segments; pageshow resumes
  without collapsing sticky geometry. Reduced motion disables streaks and
  aggressive reveals. Fault cleanup restores static content.
- No dependencies added. Existing responsive compressed images retained;
  About portrait lazy-loaded with reserved dimensions. Consolidated old CSS
  overrides, removed obsolete particle paths and overlay experiments.

## Verification
- `npm run build` and `node --test apps/web/tests/*.test.mjs`.
- `PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/test-landing-motion.mjs`
  for Chromium, then `BROWSER_ENGINE=webkit` for WebKit. Defaults cover
  375,390,430,768,1024,1280,1440,1920px plus low-power/no-JS fallbacks.
- `PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/test-landing-energy.mjs`
  observes 30 seconds of unseeded streaks, checks uniqueness/density/lifetime,
  captures every section and checks lifecycle, reduced-motion and error recovery.
- Reports and screenshots are task artifacts under `/tmp/credx-final-*`.
  Headless timing is evidence, not a claim of certified 60FPS on physical devices.

## Publication
Continue the user's approved web-only Railway deployment scope. Keep PR #6
unmerged while main merges trigger the API service; publish the exact tracked
commit only to @credx/web and verify live assets/browser behavior afterward.
