/**
 * hero-slideshow.js
 * ─────────────────
 * Luxury editorial Ken Burns crossfade.
 * Each image gets a unique zoom/pan direction so the camera feels alive.
 * Seamless loop — no visible reset, no jitter.
 */

window.initHeroSlideshow = function(imageUrls) {
  'use strict';

  // Cleanup old interval if re-initializing on breakpoint change
  if (window.heroSlideshowTimer) {
      clearInterval(window.heroSlideshowTimer);
      window.heroSlideshowTimer = null;
  }

  /* ── Timing ─────────────────────────────────────────────── */
  var HOLD   = 3000;   // ms each image stays fully visible
  var FADE   = 1000;   // ms crossfade duration
  var CYCLE  = HOLD + FADE;

  /* ── Ken Burns motion vectors ───────────────────────────── *
   * Each entry: [startTransform, endTransform]
   * Vary direction so successive slides never feel identical.
   * Scale change is subtle (1.00 → 1.08). Translate is ≤ 2%.   */
  var KB = [
    // Slide 0 — slow zoom-in, drift top-left → center
    ['scale(1.00) translate(-1.2%, -0.6%)',
     'scale(1.08) translate( 0.4%,  0.3%)'],
    // Slide 1 — zoom-in, drift right → left
    ['scale(1.02) translate( 1.5%,  0.3%)',
     'scale(1.07) translate(-0.8%, -0.4%)'],
    // Slide 2 — zoom-in, drift bottom-right → top-left
    ['scale(1.01) translate( 0.8%,  0.8%)',
     'scale(1.06) translate(-0.6%, -0.6%)'],
  ];

  /* ── DOM ────────────────────────────────────────────────── */
  var slider = document.getElementById('hero-slider');
  if (!slider) return;

  var slides = slider.querySelectorAll('.hero__slide');
  var count  = slides.length;
  if (count < 2) return;

  var images = slider.querySelectorAll('.hero__image');

  // Inject dynamic URLs if provided
  if (imageUrls && imageUrls.length === count) {
    for (var i = 0; i < count; i++) {
        images[i].src = imageUrls[i];
    }
  }

  /* ── Preload all images ─────────────────────────────────── */
  for (var p = 0; p < count; p++) {
    var pre = new Image();
    pre.src = images[p].src;
  }

  /* ── Transition strings ─────────────────────────────────── */
  // Ken Burns transform runs the entire visible life of a slide
  var KB_DUR = HOLD + FADE + 500;                          // a little extra so it never snaps
  var TR_KB  = 'transform ' + KB_DUR + 'ms cubic-bezier(0.22, 0.61, 0.36, 1)';
  var TR_IN  = 'opacity '   + FADE   + 'ms cubic-bezier(0.16, 1, 0.3, 1)';    // ease-out-expo
  var TR_OUT = 'opacity '   + FADE   + 'ms cubic-bezier(0.33, 1, 0.68, 1)';    // ease-out-cubic

  /* ── Initialise all slides off ──────────────────────────── */
  for (var i = 0; i < count; i++) {
    slides[i].style.opacity    = '0';
    slides[i].style.zIndex     = '1';
    images[i].style.transition = 'none';
    images[i].style.transform  = KB[i % KB.length][0];
  }

  var cur  = 0;
  var busy = false;
  var tid  = null;

  /* ── Show first slide immediately ───────────────────────── */
  slides[0].style.opacity = '1';
  slides[0].style.zIndex  = '2';
  // Kick off its Ken Burns after paint
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      images[0].style.transition = TR_KB;
      images[0].style.transform  = KB[0][1];
    });
  });

  /* ── Transition logic ───────────────────────────────────── */
  function advance() {
    if (busy) return;
    busy = true;

    var prev = cur;
    cur = (cur + 1) % count;

    var kbIdx = cur % KB.length;

    var slideOut = slides[prev];
    var slideIn  = slides[cur];
    var imgIn    = images[cur];

    /* 1. Reset incoming — instant, no transition */
    slideIn.style.transition  = 'none';
    slideIn.style.opacity     = '0';
    slideIn.style.zIndex      = '3';          // above outgoing
    imgIn.style.transition    = 'none';
    imgIn.style.transform     = KB[kbIdx][0]; // Ken Burns start position

    /* 2. Force layout so the instant reset is committed */
    void slideIn.offsetWidth;

    /* 3. Fade in + start Ken Burns in one rAF (avoids flicker) */
    requestAnimationFrame(function () {
      slideIn.style.transition = TR_IN;
      slideIn.style.opacity    = '1';

      imgIn.style.transition   = TR_KB;
      imgIn.style.transform    = KB[kbIdx][1]; // Ken Burns end position
    });

    /* 4. Fade out the outgoing slide */
    slideOut.style.transition = TR_OUT;
    slideOut.style.opacity    = '0';

    /* 5. Cleanup after the crossfade finishes */
    setTimeout(function () {
      slideIn.style.zIndex  = '2';
      slideOut.style.zIndex = '1';
      busy = false;
    }, FADE + 50);
  }

  /* ── Timer ──────────────────────────────────────────────── */
  function start() {
    stop();
    window.heroSlideshowTimer = setInterval(advance, CYCLE);
  }
  function stop() {
    if (window.heroSlideshowTimer) { 
        clearInterval(window.heroSlideshowTimer); 
        window.heroSlideshowTimer = null; 
    }
  }

  start();
};
