'use client'

import { useEffect, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The Transitions.dev "Like button" motion (heart fills, spring-pops, and flings an 8-dot
// particle burst whose vectors/velocity/delay/size are re-randomised each time so the spray
// never repeats), adapted to this site: it wears the secondary Button, uses the site's accent
// red, and re-fires the pop + burst on EVERY click as a repeatable +1 counter — not a
// like/unlike toggle. Self-injected + id-guarded so it needs no globals.css edit (which this
// dev session's Turbopack won't hot-recompile anyway).
const LIKE_STYLES = `
.t-like-heart path {
  fill: transparent; stroke: currentColor;
  transition: fill 150ms cubic-bezier(0.22, 1, 0.36, 1), stroke 150ms cubic-bezier(0.22, 1, 0.36, 1);
}
.t-like[data-liked="true"] .t-like-heart { color: var(--color-accent); }
.t-like[data-liked="true"] .t-like-heart path { fill: currentColor; }
/* Pop lives on the wrapper span, never the <svg>: transforming an inline SVG makes Chromium
   rasterise it at 1x (pixelated on hi-DPI). Wrapping keeps the vector crisp. */
.t-like.is-bursting .t-like-icon { animation: t-like-pop 350ms cubic-bezier(0.34, 1.96, 0.64, 1); }
@keyframes t-like-pop { 0% { transform: scale(1); } 30% { transform: scale(0.82); } 100% { transform: scale(1); } }
.t-like-icon { position: relative; display: inline-flex; }
.t-like-particles { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; color: var(--color-accent); }
.t-like-particles i {
  position: absolute;
  left: calc(2.5px * var(--psize, 1) / -2); top: calc(2.5px * var(--psize, 1) / -2);
  width: calc(2.5px * var(--psize, 1)); height: calc(2.5px * var(--psize, 1));
  border-radius: 50%; background: currentColor; opacity: 0;
}
@keyframes t-like-burst {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.4); }
  20%  { opacity: 1; transform: translate(calc(var(--px) * 0.25), calc(var(--py) * 0.25)) scale(1); }
  100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(var(--p-end-scale, 0.6)); }
}
.t-like.is-bursting .t-like-particles i { animation: t-like-burst var(--pdur, 600ms) ease-out var(--pdelay, 0ms) forwards; }
@media (prefers-reduced-motion: reduce) { .t-like-icon, .t-like-particles i { animation: none !important; } }
`

if (typeof document !== 'undefined' && !document.getElementById('like-button-styles')) {
  const el = document.createElement('style')
  el.id = 'like-button-styles'
  el.textContent = LIKE_STYLES
  document.head.appendChild(el)
}

const DIST = 20 // px each dot travels from the heart centre

// Versioned key: the value is a bare integer today, and without a version segment
// there'd be no way to migrate or invalidate if the cached shape ever changes
// (e.g. storing {count, liked}). Stale unversioned `likes:*` entries just age out.
const cacheKeyOf = (slug: string) => `likes:v1:${slug}`
const countIdOf = (slug: string) => `like-count-${slug.replace(/[^a-z0-9]+/gi, '-')}`

export function LikeButton({ slug }: { slug: string }) {
  const cacheKey = cacheKeyOf(slug)
  const countId = countIdOf(slug)

  // Seed from the localStorage cache on the client so the count is present from the very first
  // render (no network wait); 0 on the server, where there's no localStorage.
  const [count, setCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    try {
      const v = window.localStorage.getItem(cacheKey)
      return v != null ? Number(v) : 0
    } catch {
      return 0
    }
  })
  const ref = useRef<HTMLButtonElement>(null)

  // Reconcile with the authoritative server count and refresh the cache. Failures (store not
  // provisioned yet, offline) leave the cached value in place and the button still animates.
  useEffect(() => {
    let alive = true
    fetch(`/api/likes?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.count === 'number') {
          setCount(d.count)
          try {
            window.localStorage.setItem(cacheKey, String(d.count))
          } catch {}
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [slug, cacheKey])

  // Re-seed each dot's vector/velocity/delay/size per click so the spray is organic, never a
  // repeating starburst.
  function seedParticles() {
    const dots = ref.current?.querySelectorAll<HTMLElement>('.t-like-particles i')
    dots?.forEach((dot, i) => {
      const angle = (360 / dots.length) * i + (Math.random() * 2 - 1) * 16
      const mag = DIST * (0.68 + Math.random() * 0.5)
      const rad = (angle * Math.PI) / 180
      const s = dot.style
      s.setProperty('--px', `${(Math.cos(rad) * mag).toFixed(2)}px`)
      s.setProperty('--py', `${(Math.sin(rad) * mag).toFixed(2)}px`)
      s.setProperty('--pdur', `${Math.round(600 * (0.78 + Math.random() * 0.44))}ms`)
      s.setProperty('--pdelay', `${Math.round(Math.random() * 70)}ms`)
      s.setProperty('--p-end-scale', (0.35 + Math.random() * 0.4).toFixed(2))
      s.setProperty('--psize', (0.6 + Math.random() * 0.8).toFixed(2))
    })
  }

  function like() {
    const el = ref.current
    if (!el) return
    setCount((c) => c + 1) // optimistic — the animation should never wait on the network
    el.classList.remove('is-bursting')
    seedParticles()
    void el.offsetWidth // reflow so the pop + burst replay on every click
    el.classList.add('is-bursting')
    // Persist the +1 and reconcile with the authoritative server total (covers concurrent likes
    // from other visitors). A failed write just leaves the optimistic count in place.
    fetch('/api/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.count === 'number') {
          setCount(d.count)
          try {
            window.localStorage.setItem(cacheKey, String(d.count))
          } catch {}
        }
      })
      .catch(() => {})
  }

  return (
    <>
      <Button
        ref={ref}
        variant="secondary"
        size="default"
        onClick={like}
        // after:-inset-x-1: the heart-only state is 38px wide — Button's shared extender
        // handles the vertical axis, this covers the last 6px of width to the 44px floor.
        className="t-like after:-inset-x-1"
        data-liked={count > 0 ? 'true' : 'false'}
        // The name carries the count (a static "Like" hid the visible number from AT
        // entirely); the live span below still announces each increment as it lands.
        aria-label={count > 0 ? `Like. ${count} ${count === 1 ? 'like' : 'likes'} so far` : 'Like'}
        suppressHydrationWarning
      >
        <span className="t-like-icon">
          {/* strokeWidth 2.4: lucide strokes render at strokeWidth x size/24, so the
              default 2 at size 16 painted a 1.33px heart beside the header's ~1.6px
              icons (Search 2.1@18, theme 2.3@18). 2.4 x 16/24 = 1.6px — same weight. */}
          <Heart size={16} strokeWidth={2.4} className="t-like-heart" aria-hidden="true" />
          <span className="t-like-particles" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        </span>
        {/* Always in the DOM (so the pre-paint script below can fill it), but empty:hidden keeps
            the bare heart — no number, no gap — until there's a count. */}
        <span id={countId} className="tabular-nums empty:hidden" aria-live="polite" suppressHydrationWarning>
          {count > 0 ? count : ''}
        </span>
      </Button>
      {/* Runs during HTML parse, before the first paint: fills the count (and the filled-heart
          state) from the localStorage cache, so a full-page refresh shows the number immediately
          instead of flashing an empty button. React's state initializer above reads the same
          cache, so hydration matches what this wrote. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var v=localStorage.getItem('${cacheKey}');if(v&&v!=='0'){var e=document.getElementById('${countId}');if(e){e.textContent=v;var b=e.closest('.t-like');if(b)b.setAttribute('data-liked','true');}}}catch(_){}})()`,
        }}
      />
    </>
  )
}
