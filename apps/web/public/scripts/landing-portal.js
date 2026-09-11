/* CredX About-section portal transition. Scroll-driven, no dependencies.
 * ES5 only: var, function expressions, string concatenation. No template
 * literals, arrow functions, optional chaining or nullish coalescing.
 *
 * Scroll never reads layout: the listener only flags and schedules one rAF.
 * Layout is measured in the frame and re-measured on resize, and an
 * IntersectionObserver gates the whole loop to when the section is on screen.
 * Content renders settled with no JS and under reduced motion.
 */
(function () {
 'use strict';

 var section = document.getElementById('about');
 if (!section) return;
 var portal = section.querySelector('.portal');
 var stage = section.querySelector('.portal-stage');
 var svg = section.querySelector('.portal-rings');
 var halo = section.querySelector('.portal-halo');
 var logo = section.querySelector('.portal-logo');
 if (!portal || !stage || !svg || !halo || !logo) return;

 var rings = [];
 var nodes = svg.querySelectorAll('.portal-ring');
 var i;
 for (i = 0; i < nodes.length; i++) rings.push(nodes[i]);
 if (!rings.length) return;

 var root = document.documentElement;
 var preference = window.matchMedia('(prefers-reduced-motion: reduce)');

 function clamp(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
 // Same smooth acceleration/deceleration curve landing-cinematic.js uses.
 function ease(v) { v = clamp(v); return v * v * (3 - 2 * v); }

 // Outer ring first, inner rings follow on a small stagger.
 var RING_START = [0, 0.06, 0.12];
 var RING_SPAN = 0.5;

 var dispose = function () {};

 function mount() {
  dispose();

  var raf = 0;
  var dirty = true;
  var visible = false;
  var top = 0;
  var height = 1;
  var view = window.innerHeight;
  var observer = null;
  var lengths = [];

  root.classList.add('portal-ready');

  function clear() {
   root.classList.remove('portal-ready');
   stage.style.removeProperty('will-change');
   svg.style.removeProperty('opacity');
   svg.style.removeProperty('transform');
   halo.style.removeProperty('transform');
   halo.style.removeProperty('opacity');
   logo.style.removeProperty('opacity');
   logo.style.removeProperty('transform');
   for (var n = 0; n < rings.length; n++) {
    rings[n].style.removeProperty('stroke-dasharray');
    rings[n].style.removeProperty('stroke-dashoffset');
   }
  }

  dispose = function () {
   if (raf) window.cancelAnimationFrame(raf);
   raf = 0;
   if (observer) observer.disconnect();
   window.removeEventListener('scroll', schedule);
   window.removeEventListener('resize', onResize);
   window.removeEventListener('orientationchange', onResize);
   clear();
  };

  // Reduced motion: the CSS settled state stands, nothing is driven.
  if (preference.matches) return;

  function schedule() {
   if (!raf && visible && !document.hidden) raf = window.requestAnimationFrame(draw);
  }

  function measure() {
   view = window.innerHeight;
   var box = portal.getBoundingClientRect();
   top = box.top + (window.pageYOffset || 0);
   height = Math.max(1, box.height);
   for (var n = 0; n < rings.length; n++) {
    var len = 0;
    if (typeof rings[n].getTotalLength === 'function') {
     try { len = rings[n].getTotalLength(); } catch (e) { len = 0; }
    }
    if (!len) len = 2 * Math.PI * (parseFloat(rings[n].getAttribute('r')) || 300);
    lengths[n] = len;
    rings[n].style.strokeDasharray = String(len);
   }
   dirty = false;
  }

  function draw() {
   raf = 0;
   try {
    if (dirty) measure();
    var y = window.pageYOffset || 0;
    // 0 when the runway's top reaches the bottom of the viewport,
    // 1 when its bottom has cleared the top.
    var p = clamp((view - (top - y)) / (view + height));

    // Rings draw themselves in, outer first.
    for (var n = 0; n < rings.length; n++) {
     var q = ease((p - RING_START[n]) / RING_SPAN);
     rings[n].style.strokeDashoffset = String(lengths[n] * (1 - q));
    }

    // Last 25%: the rings expand past the viewport edge and fade out while
    // the logo settles — moving through the ring, not watching it shrink.
    var exit = clamp((p - 0.75) / 0.25);
    // The logo holds its settled size, then releases over the last stretch so it
    // never ends up parked behind the About copy.
    var release = ease(clamp((p - 0.86) / 0.14));
    svg.style.transform = 'scale(' + (1 + ease(exit) * 2.4).toFixed(4) + ')';
    svg.style.opacity = String((1 - ease(exit)).toFixed(4));

    // Logo: 0.7 -> 1.15 with translateZ and a small rotateX for the 3D read.
    // It reaches its settled size by 75% and holds while the rings leave.
    var e = ease(clamp(p / 0.6));
    var scale = 0.7 + 0.45 * e;
    logo.style.opacity = String((clamp(p / 0.32) * (1 - release)).toFixed(4));
    logo.style.transform = 'translateY(-50%) translateZ(' + (-420 * (1 - e)).toFixed(1) +
     'px) rotateX(' + (6 * (1 - e)).toFixed(2) + 'deg) scale(' + scale.toFixed(4) + ')';

    // Halo grows with the logo.
    halo.style.transform = 'scale(' + (0.8 + 0.5 * e).toFixed(4) + ')';
    halo.style.opacity = String((clamp(p / 0.32) * (1 - release)).toFixed(4));
   } catch (error) {
    dispose();
    if (window.console && console.warn) {
     console.warn('CredX portal disabled; static content remains available.');
    }
   }
  }

  function onResize() { dirty = true; schedule(); }

  observer = new IntersectionObserver(function (entries) {
   for (var n = 0; n < entries.length; n++) {
    visible = entries[n].isIntersecting;
   }
   // will-change only while the moment is actually on screen.
   if (visible) {
    stage.style.willChange = 'transform';
    dirty = true;
    schedule();
   } else {
    stage.style.removeProperty('will-change');
   }
  }, { rootMargin: '50% 0px' });
  observer.observe(section);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  measure();
  draw();
 }

 if (preference.addEventListener) preference.addEventListener('change', mount);
 else if (preference.addListener) preference.addListener(mount);
 window.addEventListener('pagehide', function () { dispose(); });

 mount();
})();
