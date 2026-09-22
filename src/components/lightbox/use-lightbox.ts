'use client'

import { useCallback, useEffect, useState } from 'react'

/* Lazy entry for the ~1,650-line Lightbox, shared by AssetLightbox (articles) and
 * PhotosInteractive (/photos). The old static import was a deliberate trade:
 * next/dynamic's Suspense gap swallowed the fly-in on the FIRST open of a cold page.
 * This keeps the fly-in and drops the chunk from first load by doing what the ⌘K
 * palette does (command-menu.tsx): load the chunk during idle time on the first sign
 * of a human at the controls (touch, mouse move, key down), and never render through
 * Suspense — the modal simply doesn't mount until the component exists, so when it
 * does mount it plays its full open animation. By click time the chunk is virtually
 * always resident; the worst case (a tap that beats the idle warm) delays the open by
 * the chunk fetch, it does not skip the animation. */

export type LightboxComponent = typeof import('./photos-lightbox').Lightbox

let loadedComponent: LightboxComponent | null = null
let loadPromise: Promise<LightboxComponent> | null = null

/** True once the chunk is resident. Click handlers use this to decide whether a tap
 *  needs cold-load feedback (dimming the tapped element) or the modal mounts now. */
export const isLightboxLoaded = () => loadedComponent !== null

function loadLightbox(): Promise<LightboxComponent> {
  return (loadPromise ??= import('./photos-lightbox')
    .then((m) => (loadedComponent = m.Lightbox))
    .catch((err) => {
      loadPromise = null // allow a retry on the next intent
      throw err
    }))
}

/** [Lightbox | null, warm]. `warm` is idempotent and safe to call from a click handler —
 *  callers that need the modal NOW (deep links, a very fast first tap) call it directly. */
export function useLightbox(): readonly [LightboxComponent | null, () => void] {
  // Already resident (client-side nav from a page that loaded it): mount synchronously.
  const [comp, setComp] = useState<LightboxComponent | null>(() => loadedComponent)

  const warm = useCallback(() => {
    if (loadedComponent) {
      setComp(() => loadedComponent)
      return
    }
    loadLightbox()
      .then((C) => setComp(() => C))
      .catch(() => {})
  }, [])

  // First-intent warm, one-shot, during idle — same signals and budget as the ⌘K chunk:
  // idle so it cannot hitch the scroll that is often the very gesture that triggers it;
  // a tight timeout so a quick reach for an image never lands inside a still-pending warm.
  useEffect(() => {
    if (loadedComponent) return
    const events = ['touchstart', 'mousemove', 'keydown'] as const
    const onFirstSignal = () => {
      events.forEach((ev) => window.removeEventListener(ev, onFirstSignal))
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 300 })
      else window.setTimeout(warm, 200)
    }
    events.forEach((ev) => window.addEventListener(ev, onFirstSignal, { passive: true }))
    return () => events.forEach((ev) => window.removeEventListener(ev, onFirstSignal))
  }, [warm])

  return [comp, warm] as const
}
