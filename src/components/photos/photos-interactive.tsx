'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { UnsplashExif, UnsplashPhoto } from '@/lib/unsplash-photos'
import { restoreFocus } from '@/lib/restore-focus'
// Lazy WITHOUT Suspense (see use-lightbox.ts): the chunk warms on first intent, and the
// modal doesn't mount until the component exists — the first-open fly-in still plays
// (no Suspense gap) while the grid page stops shipping the full Lightbox on first load.
import { useLightbox, isLightboxLoaded } from '@/components/lightbox/use-lightbox'

interface LightboxPhoto {
  id: string
  urls: { regular: string }
  /** The thumbnail's decoded file (its <img>.currentSrc) — the lightbox flies and paints this
   *  straight from cache on open. On /photos it matches urls.regular (the grid is unoptimized),
   *  so this is a guarantee, not a change. */
  flightSrc?: string
  alt_description: string | null
  description: string | null
  color: string
  width: number
  height: number
  exif: UnsplashExif
}

function readPhotosFromDOM(): LightboxPhoto[] {
  const els = document.querySelectorAll<HTMLElement>('[data-photo-index]')
  return Array.from(els)
    .sort((a, b) => Number(a.dataset.photoIndex) - Number(b.dataset.photoIndex))
    .map(el => ({
      id: el.dataset.photoId!,
      urls: { regular: el.dataset.photoUrl! },
      flightSrc: el.querySelector('img')?.currentSrc || undefined,
      alt_description: el.dataset.photoAlt || null,
      description: el.dataset.photoDescription || null,
      color: el.dataset.photoColor!,
      width: Number(el.dataset.photoWidth),
      height: Number(el.dataset.photoHeight),
      exif: JSON.parse(el.dataset.photoExif || 'null') as UnsplashExif,
    }))
}

export function PhotosInteractive({ children }: { children: React.ReactNode }) {
  const [Lightbox, warmLightbox] = useLightbox()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [originRect, setOriginRect] = useState<DOMRect | null>(null)
  const [direction, setDirection] = useState(0)
  const [slowMo, setSlowMo] = useState(false) // shift-click: ~3s slow-motion open for inspection
  // The grid's photo data, lifted out of the SSR'd DOM on first open (state, not a ref:
  // the lightbox renders from this list, and render must never read a mutable ref).
  const [photos, setPhotos] = useState<LightboxPhoto[]>([])
  const prefetchedHiRes = useRef<Set<string>>(new Set())
  // The clicked thumbnail — hidden while open so it doesn't sit under the fly-in clone (the clone IS
  // that asset moving into the modal). visibility keeps its grid slot, so nothing reflows. It comes
  // BACK on the lightbox's onSettled signal (the modal covers it by then), so a swipe-down dismiss
  // reveals the tapped photo rather than a blank hole in the grid.
  const originElRef = useRef<HTMLElement | null>(null)
  // The page's scroll position at open. Close restores it EXACTLY: traversing the modal must not
  // move the reader — restoreFocus's scrollIntoView on the closed-on thumbnail was relocating the
  // page after a few swipes.
  const scrollPosRef = useRef<{ x: number; y: number } | null>(null)
  // The last photo shown, surviving close's setSelectedIndex(null) — close hands focus back to
  // ITS thumbnail (not the entry one; the viewer may have arrowed far from where they came in).
  const latestIndexRef = useRef<number | null>(null)
  useEffect(() => {
    if (selectedIndex !== null) latestIndexRef.current = selectedIndex
  }, [selectedIndex])
  // Did this session show REAL keyboard navigation (keyboard-activated open, or a Tab while
  // open)? Only then does the restored thumbnail show its focus ring. Escape/arrows don't
  // count — mouse users press those too, and the browser's own focus-visible heuristic
  // flashing a ring after a mouse session + Escape is exactly the misfire this replaces.
  const keyboardModeRef = useRef(false)
  useEffect(() => {
    if (selectedIndex === null) return
    const onTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keyboardModeRef.current = true
    }
    window.addEventListener('keydown', onTab)
    return () => window.removeEventListener('keydown', onTab)
  }, [selectedIndex])

  /* The URL carries ?photo=<id> while the lightbox is open, so the open photo is deep-linkable
     and the Back button closes the dialog. Native history API, not useSearchParams — reading
     search params in render would client-side-render the whole prerendered grid out of the
     initial HTML (same trade as writing-search-client). Open pushes ONE entry (Back closes),
     nav replaces the id in place, close strips the param in place. */
  const writePhotoUrl = useCallback((id: string | null, method: 'pushState' | 'replaceState') => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('photo', id)
    else url.searchParams.delete('photo')
    window.history[method](null, '', url.pathname + url.search + url.hash)
  }, [])

  const close = useCallback(() => {
    // Strip ?photo in place. Not history.back(): the entry under us may not be ours (deep link,
    // reload while open), and popping it would leave the page instead of just closing.
    if (new URLSearchParams(window.location.search).has('photo')) writePhotoUrl(null, 'replaceState')
    setSelectedIndex(null)
    setOriginRect(null)
    // opacity too: an Escape during a cold chunk load must not strand a dimmed thumb.
    if (originElRef.current) { originElRef.current.style.visibility = ''; originElRef.current.style.opacity = ''; originElRef.current = null }
    // Hand focus back to the thumbnail of the photo the viewer closed ON (they may have
    // navigated far from the one they entered through) — the APG dialog pattern, so a keyboard
    // user resumes tabbing from where they left the grid instead of from the top of the page.
    // :focus-visible keeps the ring keyboard-only; a mouse close shows nothing.
    // Deferred a frame: at this point the modal is still mounted, so the grid is still `inert` —
    // and focusing an inert element is a silent no-op. One rAF later the dialog has unmounted and
    // its cleanup has lifted inert, so the focus actually takes.
    const idx = latestIndexRef.current
    const withRing = keyboardModeRef.current
    const pos = scrollPosRef.current
    scrollPosRef.current = null
    requestAnimationFrame(() => {
      const thumb = idx !== null ? document.querySelector<HTMLElement>(`[data-photo-index="${idx}"]`) : null
      if (thumb) {
        restoreFocus(thumb, withRing)
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      // AFTER restoreFocus (whose scrollIntoView may have moved the page toward the closed-on
      // thumbnail): put the reader back precisely where they were when they opened the modal.
      // Same task, so only the final position ever paints.
      if (pos) window.scrollTo(pos.x, pos.y)
    })
  }, [writePhotoUrl])
  const prev = useCallback(() => {
    setDirection(-1)
    setSelectedIndex(i => i !== null && i > 0 ? i - 1 : i)
  }, [])
  const next = useCallback(() => {
    setDirection(1)
    setSelectedIndex(i => (i !== null && i < photos.length - 1 ? i + 1 : i))
  }, [photos.length])

  useEffect(() => {
    if (selectedIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex, close])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as Element).closest('[data-photo-index]') as HTMLElement | null
      if (!btn) return
      // A tap that beat the idle warm: start the chunk load NOW — the modal mounts (with
      // its full fly-in) the moment the component lands. Idempotent when already warm.
      warmLightbox()
      // Functional update so the once-only fill doesn't depend on a stale closure; the DOM
      // read inside is idempotent, so StrictMode's double-invoke is harmless.
      setPhotos(p => (p.length ? p : readPhotosFromDOM()))
      setSlowMo(e.shiftKey)
      // A keyboard-activated button fires click with detail 0 — that's a keyboard open.
      keyboardModeRef.current = e.detail === 0
      scrollPosRef.current = { x: window.scrollX, y: window.scrollY }
      setOriginRect(btn.getBoundingClientRect())
      // Hidden on the lightbox's onFlightPainted signal (below), not at click, so the thumb
      // never blinks out before its flying copy has painted — see AssetLightbox for the why.
      originElRef.current = btn
      // Cold tap (chunk not resident, i.e. the tap beat the idle warm): dim the thumb so
      // the tap visibly took while the chunk loads. The Lightbox-arrival effect below
      // restores it as the modal mounts. Warm path never dims — no flash under the fly-in.
      if (!isLightboxLoaded()) btn.style.opacity = '0.6'
      setSelectedIndex(Number(btn.dataset.photoIndex))
      // ONE pushed entry per open, so Back closes the lightbox (see the popstate effect below).
      if (btn.dataset.photoId) writePhotoUrl(btn.dataset.photoId, 'pushState')
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [writePhotoUrl, warmLightbox])

  // Deep-link: /photos?photo=<id> opens that photo's lightbox on load (e.g. from the homepage
  // "Latest photo"). Reads the same SSR'd grid the click handler does and uses the thumbnail's
  // rect as the zoom origin. The param STAYS — it now reflects lightbox state (a refresh
  // reopens the same photo; close strips it).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('photo')
    if (!id) return
    // Deep link: the modal must open on load, so don't wait for the first-intent warm.
    warmLightbox()
    const all = readPhotosFromDOM()
    const idx = all.findIndex((p) => p.id === id)
    if (idx === -1) return
    // Mount-time open from an external input (the URL), not derived state: these sets run
    // once, before any interaction, and the lazy-state alternative can't scrollIntoView.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhotos(all)
    const el = document.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(id)}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      // Captured AFTER the scrollIntoView: for a deep link, "where the reader was" IS the
      // photo's own spot in the grid — close should land them there, not at the page top.
      scrollPosRef.current = { x: window.scrollX, y: window.scrollY }
      setOriginRect(el.getBoundingClientRect())
      originElRef.current = el // hidden on onFlightPainted, same as a click
    }
    setSelectedIndex(idx)
  }, [warmLightbox])

  // Keep ?photo in step while navigating INSIDE the lightbox — replace, never push, so the
  // whole session stays one history entry deep. Opening already wrote the right id (click
  // pushes, deep link arrives with it), so this only fires when the id actually moves on.
  useEffect(() => {
    if (selectedIndex === null) return
    const id = photos[selectedIndex]?.id
    if (!id) return
    if (new URLSearchParams(window.location.search).get('photo') !== id) writePhotoUrl(id, 'replaceState')
  }, [selectedIndex, photos, writePhotoUrl])

  // Back button closes the dialog: while open, a popstate that lands on a URL without ?photo
  // means the viewer navigated away from the open state — close to match. close()'s own strip
  // is a no-op by then (the param is already gone), so nothing fights the history stack.
  useEffect(() => {
    if (selectedIndex === null) return
    const onPop = () => {
      if (!new URLSearchParams(window.location.search).get('photo')) close()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectedIndex, close])

  // While a photo is open, warm the hi-res variant of nearby photos so navigation is
  // instant and always sharp — next first, then +2, +3, then the previous one. Held off
  // ~500ms so these background loads land AFTER the open/nav animation, not during it
  // (five big images decoding at once was jittering the spring). The timeout is cleared on
  // fast re-navigation, so we only warm around where you actually settle.
  useEffect(() => {
    if (selectedIndex === null) return
    const t = window.setTimeout(() => {
      const all = photos
      for (const i of [selectedIndex + 1, selectedIndex + 2, selectedIndex + 3, selectedIndex - 1]) {
        const p = all[i]
        if (!p || prefetchedHiRes.current.has(p.id)) continue
        prefetchedHiRes.current.add(p.id)
        // BYTE-IDENTICAL to the lightbox's hi-res expression (photos-lightbox Slide):
        // direct Unsplash, w=2048, auto=format — the prefetch must warm the exact URL
        // the slide will request, or it warms a cache entry nothing ever reads. (This
        // line previously wrapped the URL in /_next/image and skipped the format swap,
        // which broke that invariant — caught by the 2026-08-28 duplication audit.)
        const img = new window.Image()
        img.src = p.urls.regular.replace(/([&?])w=\d+/, '$1w=2048').replace('fm=jpg', 'auto=format')
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [selectedIndex, photos])

  // Cold-tap cleanup: the chunk landed, the modal mounts this commit — undim the thumb.
  useEffect(() => {
    if (Lightbox && originElRef.current) originElRef.current.style.opacity = ''
  }, [Lightbox])

  const selected = selectedIndex !== null ? photos[selectedIndex] : null

  return (
    <>
      {children}
      {Lightbox && selected !== null && selectedIndex !== null && createPortal(
        // Portaled to <body> (not rendered inline in the grid) so it's a sibling of the page
        // content: the lightbox hides those siblings while open to keep the page from peering
        // through Safari's translucent toolbar (see the visibility effect in photos-lightbox).
        <Lightbox
          photo={selected as unknown as UnsplashPhoto}
          index={selectedIndex}
          total={photos.length}
          onClose={close}
          onPrev={prev}
          onNext={next}
          originRect={originRect}
          direction={direction}
          slowMo={slowMo}
          showPermalink
          onFlightPainted={() => {
            if (originElRef.current) originElRef.current.style.visibility = 'hidden'
          }}
          onSettled={() => {
            // The modal fully covers the page now — put the tapped thumbnail back so a
            // swipe-down dismiss reveals it instead of a blank slot. The ref stays set:
            // close() re-clearing visibility is a harmless no-op.
            if (originElRef.current) originElRef.current.style.visibility = ''
          }}
          prevPhoto={selectedIndex > 0 ? photos[selectedIndex - 1] as unknown as UnsplashPhoto : null}
          nextPhoto={selectedIndex < photos.length - 1 ? photos[selectedIndex + 1] as unknown as UnsplashPhoto : null}
        />,
        document.body,
      )}
    </>
  )
}
