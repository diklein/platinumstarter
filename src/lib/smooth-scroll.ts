// Smooth-scrolls to a heading anchor. Driven by Motion's `animate` (off-the-shelf,
// frame-smooth, interruptible) with a strong ease-out curve so the scroll starts
// quickly and glides to a gentle stop — rather than the jitter a hand-rolled rAF loop
// with an aggressive easing function produced. Used by the desktop TOC + mobile sheet.

import { animate } from 'motion'

// Matches `scroll-margin-top: 4rem` on `h2/h3/h4[id]` in globals.css so the heading
// lands clear of the fixed header.
const HEADER_OFFSET = 64

// A strong ease-out: the scroll starts quickly and glides to a gentle stop. NO overshoot —
// a spring bounce here rubber-bands the whole page past the heading and back, which reads as
// aggressive on a long jump, so the target is approached and never crossed.
const SCROLL_EASE = [0.22, 1, 0.36, 1] as const

// A falsy id scrolls to the very top (the "Intro" TOC item).
export function smoothScrollToId(id: string) {
  const el = id ? document.getElementById(id) : null
  if (id && !el) return

  const startY = window.scrollY
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const rawTarget = el ? el.getBoundingClientRect().top + startY - HEADER_OFFSET : 0
  // Clamp to the real scroll range so the ease-out decelerates into the actual bottom
  // instead of running its tail in unreachable space (which reads as an abrupt stop).
  const targetY = Math.min(Math.max(0, rawTarget), maxScroll)
  const distance = targetY - startY

  // Keep the URL in sync: hash for a heading, cleared for the top/intro.
  history.pushState(null, '', id ? `#${id}` : window.location.pathname)

  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReduced || Math.abs(distance) < 2) {
    window.scrollTo(0, targetY)
    return
  }

  // Distance-aware duration: short hops are quick, long jumps get a little more time to read
  // as a glide rather than a teleport.
  const duration = Math.min(0.5, Math.max(0.28, Math.abs(distance) * 0.0005))

  const controls = animate(startY, targetY, {
    type: 'tween',
    duration,
    ease: SCROLL_EASE,
    onUpdate: (v) => window.scrollTo(0, v),
  })

  // Yield to the user the moment they scroll themselves.
  const cancel = () => {
    controls.stop()
    cleanup()
  }
  const cleanup = () => {
    window.removeEventListener('wheel', cancel)
    window.removeEventListener('touchstart', cancel)
  }
  window.addEventListener('wheel', cancel, { passive: true, once: true })
  window.addEventListener('touchstart', cancel, { passive: true, once: true })
  controls.finished.then(cleanup, cleanup)
}
