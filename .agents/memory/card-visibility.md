---
name: Card visibility fix
description: How tool cards went invisible and the reliable fix using CSS animation stagger
---

## The Bug
`reveal-hidden` class set `opacity: 0` on below-fold tool cards. IntersectionObserver sometimes doesn't fire (mobile, race conditions, rootMargin issues), leaving cards permanently invisible. User could see cursor change to pointer (card IS there) but content invisible.

## The Fix
Replace IO-based reveal with CSS animation stagger:
- `.tool-card { animation: cardFadeIn .5s cubic-bezier(.22,1,.36,1) both; }`
- Each card gets `animation-delay:${Math.min(idx,18)*45}ms` via inline style in `buildCardHTML(t, idx)`
- `renderTools` passes index: `.map((t, i) => buildCardHTML(t, i))`
- Removed `setTimeout(initScrollReveal, 60)` from renderTools
- Changed reveal-hidden/reveal-visible CSS to no-ops (`opacity: 1`)

**Why:** CSS animation with fill-mode:both guarantees cards start at opacity:0 during delay then become visible — no JS events required, works on all devices.

**How to apply:** Any time you want staggered card reveal animations, use CSS animation-delay set inline, NOT IntersectionObserver opacity toggling.
