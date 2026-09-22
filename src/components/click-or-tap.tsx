'use client'

import { useSyncExternalStore } from 'react'

// Device capability never changes mid-session, so the store never notifies; the hook is
// only here for its server snapshot ('click'), which keeps hydration clean before the
// first client render reads the truth.
const emptySubscribe = () => () => {}
const isTouch = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

export function ClickOrTap() {
  const touch = useSyncExternalStore(emptySubscribe, isTouch, () => false)
  return <>{touch ? 'tap' : 'click'}</>
}
