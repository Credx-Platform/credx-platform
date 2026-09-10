# CredX connected landing journey — 2026-09-11

## 1. Files modified

This refinement continues the existing `feat/credx-connected-journey-20260910` implementation, preserving the approved artwork, brand, product sections, routes and application behavior.

- `apps/web/public/index.html` — order the existing sections into the product-to-conversion journey; add the short platform introduction; retain the sample score without JavaScript; label illustrative quotes accurately instead of displaying unverified star ratings; label chat controls; respect reduced motion when opening chat.
- `apps/web/public/scripts/landing-motion-core.js` — shared scheduler, consistent easing, cached geometry, device profiles, adaptive degradation, lifecycle and failure cleanup.
- `apps/web/public/scripts/landing-cinematic.js` — restrained camera approach, layered hero, pointer depth only on the full desktop profile.
- `apps/web/public/scripts/landing-portal.js` — move the single aperture from the founder biography to the readiness interface; choreograph the sample card advancing into view.
- `apps/web/public/scripts/landing-sections.js` — readable reversible panels, side/depth gestures and guidance entrance; completely static supporting/conversion scenes.
- `apps/web/public/scripts/landing-light.js` — faster finite blue traces behind content, light-profile suppression and offscreen cleanup.
- `apps/web/public/styles/landing-journey.css` — coordinated easing, connected surfaces, quiet conversion, profile/accessibility styling.
- `scripts/test-landing-motion.mjs` — responsive, narrative order, conversion visibility and fallback regression coverage.
- `scripts/test-landing-interactions.mjs` — new reproducible input, history, reload, idle and adaptive-fallback checks.
- `docs/implementation/connected-journey.md` — this report.

## 2. Components

The existing reusable DOM modules are Motion Core, Hero Scene, Interface Aperture, Section Choreography and Energy Field. They are refined in place, not duplicated as a second animation system. The platform-introduction scene reuses the existing readiness card. The interaction regression script is new in this pass.

Scene sequence:

1. CredX introduction with immediately available signup and product CTAs.
2. Native-scroll camera approach through the approved five-layer artwork.
3. One expanding interface aperture.
4. Readiness overview explaining what CredX does.
5. Software workspace and floating platform capabilities.
6. Readiness factors, action plan, progress and funding intelligence.
7. Cesar AI guidance and the existing chat interaction.
8. Process, education, founder, illustrative benefits and FAQ.
9. Calm pricing links.
10. Clean final CTA.

The order is in the HTML itself, so keyboard navigation and static/no-JavaScript reading follow the same story. No existing section was deleted. Placeholder quotes are explicitly identified as illustrative, not verified customer endorsements.

## 3. Animation system

Native scroll, DOM/CSS perspective/transforms and one requestAnimationFrame scheduler. Scroll progress uses bounded smoothstep easing; timed UI transitions share `cubic-bezier(.4,0,.2,1)`. No springs, scroll hijacking, horizontal track, canvas or WebGL. The aperture is reversible and pointer-transparent. Position calculations are independent of rendered transforms.

Blue energy is finite and scroll-triggered: foreground 280 ms, middle 460 ms and distant 900 ms, shortened from 380/620/1400 ms. Emissions stay behind controls and text, use six local fields, and are not shooting stars or full-screen beams.

## 4. Dependencies

None added or removed. Browser verification uses the environment's existing Playwright installation. No animation library or additional asset download was introduced.

## 5. Desktop

Preserves the approved stacked five-image composition, gentle camera advance, bounded mouse depth, a single dimensional portal and varied interface entrances. Product content leads into related scenes before the page settles into its supporting and conversion sections. Pricing and final CTA containers are always fully opaque and untransformed, even at the viewport edge. No delayed CTA entrance. An intermittent history-restoration jump discovered during testing was fixed by preserving layout on pagehide instead of tearing down the hero spacer.

## 6. Mobile

Reduced travel, perspective and energy density, no mouse parallax, native touch scrolling and a shorter hero runway. Layout remains vertical. Lower-capability devices get the light profile regardless of viewport size: no energy emission, no pointer interaction, simplified aperture, reduced depth and no artwork filters. The platform story and all actions remain available.

## 7. Reduced motion and failure behavior

Reduced motion removes the sticky spacer, aperture, traces and motion transforms. Changing the preference tears down/rebuilds the system without duplicate layers. Keyboard focus immediately exposes interactive content. The sample readiness score is present before JavaScript runs.

Save-Data, reported memory of 4 GB or less, or 4 or fewer logical processors select the light profile. Eight consecutive actively animated frames longer than 42 ms downgrade the current visit to light; idle intervals are excluded. This is a conservative heuristic, not a hardware benchmark. A render/module error tears down registered scenes and restores static content. Each cleanup is isolated so one cleanup failure cannot prevent the others. Navigation suspends listeners and frames without collapsing the hero spacer; this preserves the layout and scroll position captured for browser history/BFCache. Returning restores one motion instance.

No WebGL is used, so a WebGL context cannot destabilize this experience. The lighter DOM/CSS profile and static runtime fallback cover the actual implementation.

## 8. Performance optimizations

- Cached layout coordinates and a shared scheduler; section/portal transforms are not rewritten on energy-only frames.
- No perpetual ambient pulse or offscreen score-counting animation.
- Pooled traces finish, stop offscreen, clear on tab hiding, and do not leave a render loop idle.
- Temporary compositing hints; offscreen cards release theirs even after a large scroll jump.
- No added images, dependencies or network calls; existing optimized WebP artwork retained.
- All five motion JavaScript files total 15,547 bytes raw, approximately 7,077 bytes when individually gzipped (local estimate, not a production transfer measurement).

## Verification

Production build and all five web routing checks passed. Final responsive runs passed all 16 Chromium/WebKit viewport cases, plus no-JavaScript, constrained-device and injected runtime-error fallback checks in both engines. Early concurrent matrix runs ended with browser closure; sequential final runs completed without that failure. Following the history lifecycle correction, targeted 390/1440 px regressions and all fallback checks passed again in both engines, alongside the strengthened interaction suite.

Build the actual served assets first: `npm run build:web`. The existing server serves `apps/web/dist`, not source `public` files.

```sh
npm run build:web
node --test apps/web/tests/*.test.mjs
node scripts/test-landing-motion.mjs
BROWSER_ENGINE=webkit node scripts/test-landing-motion.mjs
node scripts/test-landing-interactions.mjs
```

Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is not available through standard module resolution. `VIEWPORT_WIDTHS` can restrict a diagnostic rerun.

The responsive matrix covers 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px in Chromium and WebKit. Assertions cover loading, composition, CTA access, reversible hero/aperture, section order, visible text, no horizontal overflow, finite traces, FAQ, anchors, keyboard focus, resize, reload/hash entry, reduced-motion lifecycle, no-JavaScript content, low-capability profile and injected runtime-error recovery.

The interaction suite passed, covering small frequent wheel deltas, aggressive wheel input and reversal, idle scheduler, refresh midway without a hash, three navigation-away/back cycles with scroll restoration, a BFCache suspension/layout-invariance assertion, a 1280×720 laptop viewport, deterministic slow-frame degradation and synthesized touch/reverse touch at 390/430 px. These are browser automation tests, not physical-device tests.

## 9. Known limitations

- Physical trackpad feel, real iPhone/Android smoothness, device thermals and actual GPU usage are not established by headless browser tests. No guaranteed 60 FPS claim.
- Performance profiles depend on the device hints exposed by each browser; the sustained-frame fallback provides additional coverage when those hints are absent.
- Existing illustrative sample data is not a live authenticated profile. Customer quotes are labeled illustrative until verified replacements are supplied.
- Build/routing and landing interaction tests do not substitute for live authenticated chat/billing end-to-end tests; backend logic is unchanged.
- This deliverable is code and QA, not a production deployment. Live Railway publication and field performance are not verified by this work; the protected release process is not bypassed.

## 10. Recommended next refinements

Perform a short physical-device review on an iPhone, a midrange Android device and a laptop trackpad. After the approved Railway release, verify served asset versions, signup/pricing/chat behavior and field Web Vitals. Replace illustrative quotes only with approved, verified testimonials. Use that evidence before adding further visual effects.
