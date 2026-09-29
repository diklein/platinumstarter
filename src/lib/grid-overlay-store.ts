'use client'

import { useSyncExternalStore } from 'react'

/**
 * The 12-column grid overlay's on/off state, lifted out of <GridOverlay> so more than one thing can
 * drive it. It was local component state toggled by the `g` key, which meant the ⌘K palette could
 * neither flip it nor know whether to offer "Activate grid" or "Deactivate grid".
 *
 * A module-level store rather than context: there is exactly one grid overlay on the page, it is a
 * developer affordance rather than app state, and this keeps <GridOverlay> mounted in the root
 * layout without wrapping the tree in another provider.
 */
let on = false
const listeners = new Set<() => void>()

export const gridOverlay = {
  subscribe(cb: () => void) {
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  },
  get: () => on,
  set(next: boolean) {
    if (on === next) return
    on = next
    listeners.forEach((l) => l())
  },
  toggle() {
    gridOverlay.set(!on)
  },
}

/** Server snapshot is always false — the overlay never renders in SSR, so there is nothing to hydrate. */
export function useGridOverlay(): boolean {
  return useSyncExternalStore(gridOverlay.subscribe, gridOverlay.get, () => false)
}
