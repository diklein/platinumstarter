'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { UnsplashExif } from '@/lib/unsplash-photos'

interface Slide {
  src: string
  alt: string
  /** Optional human-facing caption shown beneath the frame for the active slide. */
  caption?: string
  /** Optional camera EXIF, surfaced on the lightbox's mono line exactly like /photos. */
  exif?: UnsplashExif
}

/* A crossfading hero slideshow. Images are stacked; the outgoing slide animates opacity + a
   small blur (a "blur-dissolve"), both GPU-composited (safe for photos; the subpixel-AA caveat
   that bars opacity-animating TEXT does not apply to images). The first slide is priority-loaded as
   the page's LCP; the frame carries a fixed aspect-ratio so it reserves its space and never
   shifts layout. Auto-advance stops for `prefers-reduced-motion` and while the tab is hidden.

   The fade is one-directional to avoid the crossfade "dip": the incoming slide snaps fully
   opaque UNDERNEATH, and only the OUTGOING slide fades out on top of it. If both faded at once,
   the midpoint (both ~50% transparent) would let the page show through and read as a flash. So
   the outgoing frame carries the transition and the higher z-index; the incoming one just sits
   there solid, revealed as the old one dissolves away.

   MDX usage:
     <Slideshow ratio="3 / 2" images={[
       { src: "/images/writing/example-lead.jpg", alt: "A quiet grid, 3:2" },
       { src: "/images/writing/example-loop.jpg", alt: "A quiet grid, 4:5" },
     ]} /> */
export function Slideshow({
  images,
  ratio = '3 / 2',
  interval = 5000,
}: {
  images: Slide[]
  ratio?: string
  interval?: number
}) {
  // active + the slide that should fade OUT, advanced atomically: every jump records the
  // outgoing index in the same state update, so the render that shows the new slide still
  // knows which one is fading — no ref read during render, no post-commit effect.
  const [indices, setIndices] = useState({ active: 0, prev: 0 })
  const { active, prev } = indices
  const setActive = (next: number | ((cur: number) => number)) =>
    setIndices(({ active }) => ({ active: typeof next === 'function' ? next(active) : next, prev: active }))

  // The effect depends on `active`, so it re-arms the timeout every advance — which also means
  // a manual jump (a dot click that sets `active`) resets the dwell, keeping the progress pill
  // in sync with the timer. No autoplay for reduced-motion users; the tab-hidden pause avoids
  // a burst of queued advances landing at once on return.
  useEffect(() => {
    if (images.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => setActive((i) => (i + 1) % images.length), interval)
    }
    const onVisibility = () => {
      clearTimeout(timer)
      if (!document.hidden) schedule()
    }
    if (!document.hidden) schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, images.length, interval])

  if (images.length === 0) return null

  return (
    <div className="col-media mb-10">
      {/* Scoped keyframe rather than a globals.css rule: this dev session's Turbopack refuses
          to recompile appended globals (the site's own documented gremlin), and a component
          <style> sidesteps the CSS pipeline entirely. */}
      <style>{`
        /* Animate transform, not width: a width animation relayouts the pill every frame (main
           thread) and reads as stepping; scaleX runs on the compositor and stays smooth. */
        @keyframes ss-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .ss-fill { width: 100%; transform-origin: left; }
        @media (prefers-reduced-motion: no-preference) {
          .ss-fill { transform: scaleX(0); animation: ss-progress var(--ss-dur, 5000ms) linear forwards; }
        }
      `}</style>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio }}>
        {images.map((img, i) => {
          const isActive = i === active
          // Only the outgoing slide animates (fades to 0) and sits on top; the incoming slide
          // snaps to full opacity beneath it. `prev !== active` guards the first paint, where
          // there is no previous slide.
          const isPrev = i === prev && prev !== active
          return (
            // Each slide is a data-img-modal button so the page-level <AssetLightbox> opens it in
            // the shared photo lightbox — and because EVERY slide carries the attribute, the
            // lightbox gallery is the whole carousel, navigable with the same arrows. Only the
            // active slide is interactive: the stacked inactive slides sit at pointer-events:none
            // (and out of the tab order) so a click can't land on the top-of-stack image instead
            // of the visible one. The crossfade now rides the button's opacity — same effect.
            <button
              key={img.src}
              type="button"
              data-img-modal
              data-src={img.src}
              data-alt={img.alt}
              // Carried into the shared lightbox's caption rail: the short caption and the camera
              // EXIF, formatted there the same way /photos does it.
              data-caption={img.caption || undefined}
              data-exif={img.exif ? JSON.stringify(img.exif) : undefined}
              aria-label={img.alt ? `Enlarge: ${img.alt}` : 'View enlarged'}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              className={`absolute inset-0 block cursor-zoom-in ease-out${
                isPrev ? ' transition-[opacity,filter] duration-700 motion-reduce:transition-none' : ''
              }`}
              style={{
                opacity: isActive ? 1 : 0,
                // Blur-dissolve: the outgoing slide softens as it leaves, so the departure reads as
                // a cinematic dissolve rather than a flat opacity ramp. The incoming slide stays
                // sharp and solid beneath (see the one-way fade note above), so there's no dip.
                filter: isPrev ? 'blur(6px)' : 'none',
                // Outgoing on top (it does the fading); incoming just beneath, solid; rest behind.
                zIndex: isPrev ? 20 : isActive ? 10 : 0,
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                priority={i === 0}
                sizes="(max-width: 899px) 100vw, 66vw"
                className="object-cover"
              />
            </button>
          )
        })}

        {images.length > 1 && (
          // bottom-0: dots centred in a 24px hit area (8px padding) land the dot 8px above the base.
          // z-30 keeps the dots above the slides, which now carry z-index (10/20) for the one-way fade.
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-center gap-1">
            {images.map((img, i) => {
              const isActive = i === active
              return (
                <button
                  key={img.src}
                  type="button"
                  aria-label={`Show ${img.alt}`}
                  aria-current={isActive}
                  onClick={() => setActive(i)}
                  // The dot stays small, but the button is a 24px-minimum hit target so it is
                  // easy to click, with a pointer cursor and a hover brighten so it reads as one.
                  // The ::before extension (not min-w) supplies the extra clickable width, so the
                  // dots' visual spacing is untouched while every target clears 24x24.
                  className="group/dot relative flex h-6 cursor-pointer items-center px-0.5 before:absolute before:inset-y-0 before:-inset-x-1.5"
                >
                  <span
                    className="relative block h-2 overflow-hidden rounded-full drop-shadow-[0_0_2px_rgba(0,0,0,0.6)] transition-[width,filter] duration-300 ease-out group-hover/dot:brightness-150 motion-reduce:transition-none"
                    style={{
                      width: isActive ? 30 : 8,
                      backgroundColor: isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)',
                    }}
                  >
                    {/* The active pill's fill sweeps over the dwell time. Keyed by `active` so
                        React remounts it each advance, restarting the CSS animation from 0. */}
                    {isActive && (
                      <span
                        key={active}
                        className="ss-fill absolute inset-y-0 left-0 rounded-full bg-white"
                        style={{ ['--ss-dur' as string]: `${interval}ms` }}
                      />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {images.some((img) => img.caption) && (
        // The live region stays mounted across advances (an element that appears with its
        // text isn't announced), so auto-advance caption swaps reach screen readers.
        <p aria-live="polite" className="mt-3 text-center font-sans text-[0.95rem] leading-snug text-[var(--color-muted)]">
          {images[active].caption}
        </p>
      )}
    </div>
  )
}
