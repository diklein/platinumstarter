'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/* The site's theme as an external store: the class flip on <html> is the whole
 * signal. Server snapshot says light, so SSR/hydration agree; dark clients
 * correct in the first client render, before the lazy loader ever fetches. */
const subscribeTheme = (onChange: () => void) => {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}
const readTheme = () => document.documentElement.classList.contains('dark')

interface AutoplayVideoProps {
  src?: string
  /** Same clip re-recorded in dark mode. Convention: `<name>-dark.mp4` beside the
   *  light capture. When present, the active theme picks the source; a theme flip
   *  mid-view reloads the clip and resumes if it was playing. */
  darkSrc?: string
  /** Poster for the dark capture; defaults to the darkSrc-derived jpg upstream. */
  darkPoster?: string
  /** Preferred source (e.g. a smaller webm for gif-style clips); mp4 `src` is the fallback. */
  webm?: string
  /** Higher-resolution encode of the SAME clip for dense (≥2.5x) screens, selected via a
   *  media query on its <source> — the thing srcset can do for images and only the media
   *  attribute can do for video. A 2x-dense bake looks soft on a 3x iPhone; this doesn't. */
  hiResSrc?: string
  poster?: string
  loop?: boolean
  className?: string
  width?: string | number
  ariaLabel?: string
  /** Red playback progress bar under the video. Default true; pass false for previews / short decorative loops. */
  progressBar?: boolean
  /** Round the loading shimmer (not the video, which stays square). Portrait/bezel clips
   *  pass a radius so the loading state reads as a phone silhouette, not a rectangle. */
  frameRadius?: string
  /** The clip's intrinsic ratio, e.g. `900 / 1840`. A <video> has NO intrinsic size until its
   *  metadata arrives, so without this the browser falls back to the default 300x150 replaced-
   *  element box (ratio 2) — the shimmer, which is inset-0 in that container, paints scrunched
   *  until the metadata lands, and the box then jumps to full height (CLS). Declaring the ratio
   *  reserves the right box on the first paint. Omit it and the layout is unchanged. */
  aspectRatio?: string
}

/**
 * The single video primitive for the site. Autoplays when scrolled into view
 * (muted, playsinline) and pauses when it leaves. Shows a shimmer over the
 * poster/first frame until the clip can play, and (unless opted out) a thin red
 * progress bar 8px below that tracks playback. Native controls are never rendered.
 */
export function AutoplayVideo({ src, darkSrc, darkPoster, webm, hiResSrc, poster, loop, className, width, ariaLabel, progressBar = true, frameRadius, aspectRatio }: AutoplayVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)

  // Theme-aware source: only clips that ship a dark capture pay attention.
  const isDark = useSyncExternalStore(subscribeTheme, readTheme, () => false)
  const activeSrc = isDark && darkSrc ? darkSrc : src
  const activePoster = isDark && darkSrc ? (darkPoster ?? poster) : poster

  // A theme flip swaps the src attribute; the browser resets the element, so
  // reload explicitly and resume when the clip is on screen (checking paused
  // isn't enough — a flip during the initial load found it paused and left an
  // in-view clip stranded; the intersection observer only fires on changes).
  const prevSrc = useRef(activeSrc)
  useEffect(() => {
    const video = ref.current
    if (!video || prevSrc.current === activeSrc) return
    prevSrc.current = activeSrc
    video.load()
    const r = video.getBoundingClientRect()
    const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)
    const inView = r.height > 0 && visible / r.height >= 0.5
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (inView && !reduceMotion && !userPaused.current) video.play().catch(() => {})
  }, [activeSrc])
  // A tap/click pause is sticky: the in-view observer must not restart the clip the user
  // stopped, so the flag lives in a ref the observer callback reads on every intersection.
  const userPaused = useRef(false)

  // The progress bar is also the SCRUBBER (Marcin's minimal player): point anywhere on it to
  // seek, drag to scrub. The visual stays a 2px hairline — the py-2 wrapper is the real hit
  // target. Keyboard/AT users get the honest version instead: focusing the video with the
  // keyboard restores the NATIVE controls (and blur removes them), so the minimal chrome is
  // strictly a pointer-user affordance and nothing is taken away from anyone else.
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const video = ref.current
    if (!video || !video.duration || !Number.isFinite(video.duration)) return
    const r = e.currentTarget.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    video.currentTime = t * video.duration
    setProgress(t)
  }
  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    scrub(e)
  }
  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
  }
  const onVideoFocus = (e: React.FocusEvent<HTMLVideoElement>) => {
    if (e.currentTarget.matches(':focus-visible')) e.currentTarget.controls = true
  }
  const onVideoBlur = (e: React.FocusEvent<HTMLVideoElement>) => {
    e.currentTarget.controls = false
  }
  const onVideoClick = () => {
    const video = ref.current
    if (!video) return
    // Native controls (restored on keyboard focus) own play/pause while visible —
    // toggling here too would immediately undo the control-bar click.
    if (video.controls) return
    // Ordering constraint: this React handler fires BEFORE AssetLightbox's document-level
    // click listener, so pausing here would make the lightbox's "playing clips" snapshot
    // miss this clip (and set the sticky user-pause) — permanently stopping the inline copy.
    // A clip the lightbox has claimed (data-asset-open) opens on click; it doesn't toggle.
    if (video.dataset.assetOpen !== undefined) return
    if (video.paused) {
      // Handler-time ref write — standard React; the rule misreads it as an effect-value
      // mutation because the observer effect below also reads this ref.
      // eslint-disable-next-line react-hooks/immutability
      userPaused.current = false
      video.play().catch(() => {})
    } else {
      userPaused.current = true
      video.pause()
    }
  }

  useEffect(() => {
    const video = ref.current
    if (!video) return

    // Imperatively set playsinline so iOS Safari sees it before play() is called,
    // regardless of when React hydrates the prop.
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    // Claims this clip for the observers below, so the page-level VideoAutoplayObserver
    // (which drives the raw <video> tags in older posts) leaves it alone.
    video.dataset.managedAutoplay = ''

    const onTime = () => {
      const d = video.duration
      if (d && Number.isFinite(d)) setProgress(video.currentTime / d)
    }
    const onReady = () => setReady(true)

    if (progressBar) video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('playing', onReady)
    // Most precise reveal: hide the shimmer exactly when a real frame is painted. The
    // shimmer sits BEHIND the (opaque, poster-backed) video, so there's no cross-fade over
    // the clip — the frame just covers it. Guarded for browsers without rVFC.
    type RVFCVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    const rvfc = (video as RVFCVideo).requestVideoFrameCallback
    if (rvfc) rvfc.call(video, () => setReady(true))
    if (video.readyState >= 3) setReady(true) // already playable (e.g. bfcache)

    // LAZY LOAD: preload="none" below keeps below-fold clips from costing anything at
    // page load (with preload="metadata", Chrome's webm metadata fetch pulled large
    // ranges — /designs/streetline shipped 772KB of video before any scroll, slow-network
    // audit 2026-08-23). This one-shot observer upgrades to a real load() when the clip
    // is within 400px of the viewport: above-fold clips fire immediately on mount (same
    // behavior as before), everything else waits for approach. Registered BEFORE the
    // play observer so an in-view clip loads, then plays, in that order.
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          nearObserver.disconnect()
          video.preload = 'auto'
          video.load()
        }
      },
      { rootMargin: '400px 0px' }
    )
    nearObserver.observe(video)

    // Reduced-motion users get the first frame, not autoplay — a click (or the native
    // controls restored on keyboard focus) starts playback on their terms.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!reduceMotion && !userPaused.current) video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(video)

    return () => {
      observer.disconnect()
      nearObserver.disconnect()
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('playing', onReady)
    }
  }, [progressBar])

  return (
    <div className={className}>
      {/* Square by design — videos carry no border-radius (the figure/frame owns any
          shape). The shimmer sits BEHIND the video (frameRadius rounds only it, for the
          phone silhouette); the opaque poster/video covers it as it paints, so there's no
          overlay cross-fade — that's what removes the load "flash". */}
      <div className="relative overflow-hidden" style={aspectRatio ? { aspectRatio } : undefined}>
        {!ready && (
          <div
            aria-hidden
            style={frameRadius ? { borderRadius: frameRadius } : undefined}
            className="shimmer pointer-events-none absolute inset-0 z-0"
          />
        )}
        {/* No poster attribute on purpose: the browser's poster→first-frame swap is a subtle
            flash (JPEG poster vs the decoded H.264 frame). Instead the shimmer covers the load
            and the video reveals frame 0 directly. The poster jpg is still derived from the src
            for the lightbox fly-in clone (see AssetLightbox). */}
        <video
          ref={ref}
          {...(webm || hiResSrc ? {} : { src: activeSrc })}
          loop={loop}
          muted
          playsInline
          preload="none"
          width={width}
          tabIndex={0}
          onFocus={onVideoFocus}
          onBlur={onVideoBlur}
          onClick={onVideoClick}
          aria-label={ariaLabel}
          data-poster={activePoster}
          data-progress-bar={progressBar ? '' : undefined}
          // Carried into the lightbox so the modal's loading shimmer rounds to the same phone
          // silhouette this in-article clip uses (see AssetShimmer).
          data-frame-radius={frameRadius}
          // With a declared ratio the video fills the (correctly sized) container from the first
          // paint, so it never resizes under the shimmer when metadata lands.
          style={aspectRatio ? { aspectRatio } : undefined}
          className="relative z-10 block w-full"
        >
          {webm || hiResSrc ? (
            <>
              {/* First supported+matching source wins, so the dense-screen encode leads. */}
              {hiResSrc ? (
                <source
                  media="(-webkit-min-device-pixel-ratio: 2.5), (min-resolution: 2.5dppx)"
                  src={hiResSrc}
                  type="video/mp4"
                />
              ) : null}
              {webm ? <source src={webm} type="video/webm" /> : null}
              {/* darkSrc pairs with plain-mp4 clips; in the webm/hiRes branch it
                  covers only this fallback source. */}
              {activeSrc ? <source src={activeSrc} type="video/mp4" /> : null}
            </>
          ) : null}
        </video>
      </div>
      {progressBar && (
        /* 2px red playback bar, 8px below the video — and the pointer scrubber. The visible
           line stays 2px; the paddings above/below are the invisible hit target. aria-hidden
           on purpose: keyboard users seek with the native controls (restored on focus). */
        <div
          aria-hidden
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          // py-2 is the hit target; -mb-2 gives the extra bottom padding back to the layout so
          // the bar's visual position (8px below the video) is exactly what it was.
          className="-mb-2 w-full cursor-ew-resize py-2"
        >
          <div className="h-0.5 w-full overflow-hidden bg-[var(--color-border)]">
            {/* timeupdate fires only ~4×/s; ease the fill between ticks so it glides, not jumps.
                scaleX (GPU) rather than width, so the tween skips layout/paint each frame. */}
            <div className="h-full w-full origin-left bg-[var(--color-accent)]" style={{ transform: `scaleX(${progress})`, transition: 'transform 0.25s linear' }} />
          </div>
        </div>
      )}
    </div>
  )
}
