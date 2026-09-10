# CredX connected landing journey

## Implementation

The public landing is standalone HTML served by the existing web server, alongside React/Vite application routes. It does not need a new React renderer, animation dependency or WebGL runtime. The 8bit.ai reference informed depth and pacing only; no reference assets or code were used.

Modified:
- `apps/web/public/index.html`: load motion modules; move the unchanged About content directly after the hero; remove conflicting legacy pointer transforms.
- `apps/web/public/styles/landing-cinematic.css`: retain approved responsive artwork composition; update bounded hero approach and remove superseded streak/title effects.
- `apps/web/public/scripts/landing-cinematic.js`: five-layer hero approach and restrained desktop pointer interaction.
- `apps/web/public/scripts/landing-light.js`: pooled, scroll-triggered blue digital traces behind content; finite 380/620/1400ms passes, no stars or idle loop.
- `scripts/test-landing-motion.mjs`: responsive and lifecycle regression checks for the new journey.

Created reusable modules:
- `landing-motion-core.js`: shared native-scroll read/write scheduler, media profiles, lifecycle teardown and static error fallback.
- `landing-portal.js`: one reversible rectangular aperture and sequenced About entrance.
- `landing-sections.js`: related side-depth, floating panel, depth-fade and quiet conversion treatments.
- `landing-journey.css`: motion/depth tokens, atmosphere, layered traces and accessibility treatments.

No dependencies added or removed. Existing links, forms, metadata, heading and paragraph content are preserved. Authentication/application routes are untouched. Existing hero artwork remains; existing DOM software panels receive the floating-interface treatment rather than inventing new product screenshots.

## Profiles and performance

Desktop retains the approved vertically stacked composition, gentle hero approach, restrained pointer depth and one short aperture sequence. Mobile reduces perspective, travel, trace count, blur and pinned distance. Pricing and final conversion remain calm.

Reduced motion removes the pin spacer, aperture, energy traces and pointer/parallax effects. JavaScript-disabled and runtime-error paths retain readable static content. Focus exposes content immediately. Native scrolling is never intercepted or locked.

One shared requestAnimationFrame scheduler sleeps at rest. Layout positions are cached independently of rendered transforms. Traces are pooled inside six local backgrounds, below text and controls, and finish without an idle loop. Compositing hints are temporary; no large blurred canvas, new image downloads, WebGL or added library payload.

## Verification and limitations

Production build and five routing checks pass. Responsive browser suite covers 375, 390, 430, 768, 1024, 1280, 1440 and 1920px: image loading, controlled approach, reversible aperture, readable sections, overflow, finite traces, FAQ, CTA anchors, keyboard focus, resize, reload/hash entry, reduced-motion teardown/rebuild and static fallback.

Additional Chromium interaction checks cover real wheel input, rapid direction changes, synthesized touch swipes, history navigation and scheduler inactivity after pulses finish. Reference canvas required a previously captured software-rendered reference screenshot for visual inspection; a fresh software-WebGL capture stalled.

Headless browser checks do not establish physical iPhone smoothness, real trackpad feel or guaranteed 60 FPS. Those remain recommended device checks. No WebGL is used, so no WebGL failure path is necessary.

This is a code-ready change, not a production deployment. The existing protected Railway release still requires its missing credentials and verified database recovery prerequisites. No release gates were bypassed.

Next refinement: real-device scroll review and production performance measurement after the protected release setup is completed. Avoid additional visual effects until that feedback is available.
