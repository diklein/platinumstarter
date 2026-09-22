'use client'

import { useEffect } from 'react'
import { gridOverlay, useGridOverlay } from '@/lib/grid-overlay-store'
import { subscribeKeydown } from '@/lib/keyboard-shortcuts'

export function GridOverlay() {
  // State lives in a shared store so the ⌘K palette can drive it too (and can tell whether to offer
  // "Activate grid" or "Deactivate grid"). `g` remains the shortcut.
  const visible = useGridOverlay()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement
        // Every editable surface, not just the two obvious tags — a bare single-key shortcut
        // must never fire while someone is typing (WCAG 2.1.4).
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
        gridOverlay.toggle()
      }
    }
    // Shared app-shortcut listener (keyboard-shortcuts.ts) — same window keydown the
    // ⌘K handler rides, instead of a second always-on listener.
    return subscribeKeydown(handleKey)
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] px-6 md:px-12">
      <div className="h-full grid grid-cols-12 gap-x-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-full bg-red-400/10" />
        ))}
      </div>
    </div>
  )
}
