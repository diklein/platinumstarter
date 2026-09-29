'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { UnsplashPhoto } from '@/lib/unsplash-photos'
import { formatExif } from '@/lib/unsplash-photos'
import { restoreFocus } from '@/lib/restore-focus'
// Lazy WITHOUT Suspense (see use-lightbox.ts): the chunk warms on first intent, and the
// modal doesn't mount until the component exists — so the first-open fly-in still plays
// (the Suspense gap that swallowed it under next/dynamic never happens) while every
// article stops shipping the full Lightbox on first load.
import { useLightbox, isLightboxLoaded } from '@/components/lightbox/use-lightbox'

const NULL_EXIF = { make: null, model: null, exposure_time: null, aperture: null, focal_length: null, iso: null }

function imagePhoto(el: HTMLElement): UnsplashPhoto {
  const src = el.dataset.src || ''
  // The button's displayed rect shares the image's aspect ratio (w-full + auto height), which
  // is all the lightbox needs to size the loading shimmer to the asset rather than the whole
  // modal. Intrinsic pixels aren't available here and aren't needed.
  const r = el.getBoundingClientRect()
  // The exact optimizer URL the article already decoded — the lightbox reuses it verbatim so
  // the fly-in and the slide's base layer paint instantly from cache, instead of re-fetching
  // the original at a fresh 100vw size (the cold-start "modal first, image later" gap).
  const img = el.querySelector('img')
  // A slideshow slide carries its short caption and camera EXIF as data attributes (see
  // Slideshow); ordinary article/store images carry neither, so both default cleanly to empty.
  let exif = NULL_EXIF
  if (el.dataset.exif) {
    try { exif = { ...NULL_EXIF, ...JSON.parse(el.dataset.exif) } } catch { /* malformed — no exif */ }
  }
  return {
    id: src,
    urls: { regular: src, small: src },
    flightSrc: img?.currentSrc || undefined,
    alt_description: el.dataset.alt || null,
    description: el.dataset.caption || null,
    color: '#888888',
    width: Math.round(r.width),
    height: Math.round(r.height),
    frameRadius: el.dataset.frameRadius, // rounds the modal shimmer to match a bezel screenshot
    exif,
  } as unknown as UnsplashPhoto
}

function videoPhoto(v: HTMLVideoElement, withFlightPoster = false): UnsplashPhoto {
  // Resolve a playable URL even for clips that haven't autoplayed/loaded yet (currentSrc is
  // empty until then) — otherwise a clip far down the page opens to a black frame. The
  // <source>/src PROPERTIES give an absolute URL regardless of load state.
  const src = v.currentSrc || v.querySelector('source')?.src || v.src || ''
  // Posters no longer live on the element (that swap flashes); read the data-poster the
  // primitive stashes, else derive the sibling .jpg, else fall back to the clip itself.
  const poster =
    v.dataset.poster || v.getAttribute('poster') || src.replace(/\.(mp4|webm)$/i, '.jpg') || src
  const alt = v.getAttribute('aria-label') || ''
  // Freeze the exact on-screen frame as a data-URL poster for the fly-in clone. A brand-new
  // <video> needs metadata + a seek before it paints ANYTHING, and during that ~100-500ms gap
  // the page fade was already dimming the origin — the clip visibly blinked out, then
  // reappeared. The canvas snapshot paints with the clone's first commit instead. Same-origin
  // clips only; a tainted canvas just skips the poster and falls back to the paint signal.
  // ONLY for the clicked clip. This is a synchronous canvas drawImage + toDataURL JPEG encode
  // (~15ms per clip in Safari), and it runs INSIDE the click handler. Doing it for every clip on
  // the page cost ~120ms of blocked main thread before the open spring could take its first step
  // — so motion's first frame arrived with a huge dt and the clone snapped ~80% of the way to its
  // target in a single frame instead of springing. That was the "jitter right after I click".
  // Only the flying clone reads flightPoster; the other slides never touch it.
  let flightPoster: string | undefined
  try {
    if (withFlightPoster && v.readyState >= 2 && v.videoWidth) {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d')?.drawImage(v, 0, 0)
      flightPoster = c.toDataURL('image/jpeg', 0.85)
    }
  } catch { /* cross-origin frame — no poster */ }
  return {
    id: src || poster,
    urls: { regular: poster, small: poster },
    videoSrc: src,
    videoTime: v.currentTime || 0, // the fly-in clone resumes playing from this exact frame
    flightPoster,
    videoProgress: v.dataset.progressBar !== undefined, // only mirror the bar if it has one
    frameRadius: v.dataset.frameRadius, // rounds the modal shimmer to match a bezel clip
    alt_description: alt && alt !== 'Enlarge video' ? alt : null,
    description: null,
    color: '#000000',
    width: v.videoWidth || 0,
    height: v.videoHeight || 0,
    exif: NULL_EXIF,
  } as unknown as UnsplashPhoto
}

// Every openable asset on the page, in document order: article/store images (data-img-modal
// buttons), bezel screenshots, and visible video clips (the hidden theme-swapped bezel
// variant is skipped via offsetParent). data-no-lightbox opts a video out entirely —
// VideoEmbed's native-controls player drives its own playback and never opens here.
function gatherAssetEls(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button[data-img-modal], figure video')
  ).filter((el) => el.offsetParent !== null && el.dataset.noLightbox === undefined)
}

function toPhoto(el: HTMLElement, isClicked = false): UnsplashPhoto {
  if (el instanceof HTMLVideoElement) return videoPhoto(el, isClicked)
  return imagePhoto(el)
}

export function AssetLightbox() {
  const [Lightbox, warmLightbox] = useLightbox()
  const [photos, setPhotos] = useState<UnsplashPhoto[] | null>(null)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [originRect, setOriginRect] = useState<DOMRect | null>(null)
  const [slowMo, setSlowMo] = useState(false) // shift-click: ~3s slow-motion open for inspection
  // Article clips paused while the overlay is open — otherwise they keep playing behind the
  // (fading-in) backdrop and flash as "remnants" during the open animation. Resumed on close.
  const pausedRef = useRef<HTMLVideoElement[]>([])
  // The clicked asset — hidden while open so it doesn't sit under the fly-in clone (which IS that
  // asset moving into the modal). visibility keeps its layout slot, so nothing reflows. It comes
  // BACK on the lightbox's onSettled signal (the modal covers it by then), so a swipe-down
  // dismiss reveals the tapped asset rather than a blank hole in the article.
  const originElRef = useRef<HTMLElement | null>(null)
  // The page's scroll position at open. Close restores it EXACTLY: traversing the modal must not
  // move the reader — restoreFocus's scrollIntoView on the closed-on asset was relocating the
  // page after a few swipes.
  const scrollPosRef = useRef<{ x: number; y: number } | null>(null)
  // The last asset shown, surviving close's setPhotos(null) — close hands focus back to it.
  const latestIndexRef = useRef(0)
  useEffect(() => { latestIndexRef.current = index }, [index])
  // Real keyboard navigation this session (keyboard open, or a Tab while the modal is up)?
  // Only then does the restored asset show a focus ring — see photos-interactive for the why.
  const keyboardModeRef = useRef(false)
  useEffect(() => {
    if (!photos) return
    const onTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keyboardModeRef.current = true
    }
    window.addEventListener('keydown', onTab)
    return () => window.removeEventListener('keydown', onTab)
  }, [photos])

  const close = useCallback(() => {
    setPhotos(null)
    setOriginRect(null)
    // opacity too: an Escape during a cold chunk load must not strand a dimmed asset.
    if (originElRef.current) { originElRef.current.style.visibility = ''; originElRef.current.style.opacity = ''; originElRef.current = null }
    pausedRef.current.forEach((v) => v.play().catch(() => {}))
    pausedRef.current = []
    // Hand focus back to the asset the viewer closed on (arrowing may have moved them past the
    // one they entered through) — same APG dialog pattern as the /photos opener. The gallery is
    // regathered because the page's DOM is unchanged while the modal is up, so indexes align.
    // :focus-visible keeps any ring keyboard-only.
    // Deferred a frame: the page is still `inert` until the modal's unmount cleanup runs, and
    // focusing an inert element is a silent no-op.
    const idx = latestIndexRef.current
    const withRing = keyboardModeRef.current
    const pos = scrollPosRef.current
    scrollPosRef.current = null
    requestAnimationFrame(() => {
      const el = gatherAssetEls()[idx]
      if (el) {
        restoreFocus(el, withRing)
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      // AFTER restoreFocus (whose scrollIntoView may have moved the page toward the closed-on
      // asset): put the reader back precisely where they were when they opened the modal.
      // Same task, so only the final position ever paints.
      if (pos) window.scrollTo(pos.x, pos.y)
    })
  }, [])
  const prev = useCallback(() => {
    setDirection(-1)
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])
  const next = useCallback(() => {
    setDirection(1)
    setIndex((i) => (photos && i < photos.length - 1 ? i + 1 : i))
  }, [photos])

  useEffect(() => {
    if (!photos) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos, close])

  useEffect(() => {
    // Tag video clips for affordance + keyboard (images are already <button>s, which fire
    // click natively on Enter/Space). Both theme-swapped variants exist at mount.
    document.querySelectorAll<HTMLVideoElement>('figure video').forEach((el) => {
      if (el.dataset.noLightbox !== undefined) return // opted out (e.g. VideoEmbed)
      el.dataset.assetOpen = ''
      el.tabIndex = 0
      el.setAttribute('role', 'button')
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Enlarge video')
    })

    const open = (el: HTMLElement, slow = false) => {
      // A tap that beat the idle warm: start the chunk load NOW — the modal mounts (with
      // its full fly-in) the moment the component lands. Idempotent when already warm.
      warmLightbox()
      const els = gatherAssetEls()
      const idx = els.indexOf(el)
      if (idx < 0) return
      setSlowMo(slow)
      scrollPosRef.current = { x: window.scrollX, y: window.scrollY }
      setOriginRect(el.getBoundingClientRect())
      // NOT hidden here: the lightbox fires onFlightPainted once its flying clone has painted
      // a real frame, and the origin hides then. Hiding at click left a gap where the asset
      // blinked out before its copy appeared — worst for videos, which need metadata + a seek
      // before they paint anything.
      originElRef.current = el
      // Cold tap (chunk not resident): dim the asset so the tap visibly took while the
      // chunk loads; the Lightbox-arrival effect below restores it as the modal mounts.
      if (!isLightboxLoaded()) el.style.opacity = '0.6'
      setDirection(0)
      setIndex(idx)
      setPhotos(els.map((e, i) => toPhoto(e, i === idx)))
      // Freeze the article's clips during the open so nothing plays behind the backdrop.
      const playing = Array.from(document.querySelectorAll<HTMLVideoElement>('figure video')).filter((v) => !v.paused)
      playing.forEach((v) => v.pause())
      pausedRef.current = playing
    }

    // Resolve the asset element for any click within a media figure or image button.
    const assetFor = (t: HTMLElement | null): HTMLElement | null => {
      if (!t) return null
      const btn = t.closest<HTMLElement>('button[data-img-modal]')
      if (btn) return btn
      const fig = t.closest('figure')
      if (!fig || t.closest('figcaption')) return null
      // The first VISIBLE clip, not the first clip. A BezelVideo figure holds BOTH theme masters
      // (light then dark) with one display:none — so `querySelector('video')` returned the light
      // master even in dark mode, its offsetParent was null, and every bezel clip was silently
      // unopenable in dark mode.
      const video = Array.from(fig.querySelectorAll<HTMLVideoElement>('video')).find(
        (v) => v.offsetParent !== null && v.dataset.noLightbox === undefined,
      )
      return video ?? null
    }

    const onClick = (e: MouseEvent) => {
      const el = assetFor(e.target as HTMLElement)
      // A keyboard-activated button fires click with detail 0 — that's a keyboard open.
      if (el) { e.preventDefault(); keyboardModeRef.current = e.detail === 0; open(el, e.shiftKey) }
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const a = document.activeElement as HTMLElement | null
      if (!a || a.dataset.assetOpen === undefined) return // buttons handle their own keys
      e.preventDefault()
      keyboardModeRef.current = true
      open(a, e.shiftKey)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeydown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeydown)
    }
  }, [warmLightbox])

  // Cold-tap cleanup: the chunk landed, the modal mounts this commit — undim the asset.
  useEffect(() => {
    if (Lightbox && originElRef.current) originElRef.current.style.opacity = ''
  }, [Lightbox])

  const current = photos ? photos[index] : null
  // Article screenshots and clips carry no caption or EXIF, so the rail stays off for them (the
  // freed height goes to the image). A slideshow's photos do, so it turns on for those.
  const hasCaptions = !!photos?.some((p) => p.description || formatExif(p.exif))

  return (
    <>
      {Lightbox && photos && current && createPortal(
        <Lightbox
          photo={current}
          index={index}
          total={photos.length}
          direction={direction}
          originRect={originRect}
          slowMo={slowMo}
          onFlightPainted={() => {
            // The clone is visibly on screen — the origin can vanish without a blink.
            if (originElRef.current) originElRef.current.style.visibility = 'hidden'
          }}
          onSettled={() => {
            // The modal fully covers the page now — put the tapped asset back (still paused if
            // it's a clip; playback resumes on close as ever) so a swipe-down dismiss reveals
            // it instead of a blank hole. close() re-clearing visibility is a harmless no-op.
            if (originElRef.current) originElRef.current.style.visibility = ''
          }}
          prevPhoto={index > 0 ? photos[index - 1] : null}
          nextPhoto={index < photos.length - 1 ? photos[index + 1] : null}
          onClose={close}
          onPrev={prev}
          onNext={next}
          hasCaptions={hasCaptions}
          // Article assets are screenshots and diagrams, not photographs — the /photos edge
          // outline is not theirs, and it read as a stray border blinking in and out on open.
          showOutline={false}
        />,
        document.body
      )}
    </>
  )
}
