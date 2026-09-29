'use client'

import * as m from 'motion/react-m'

// The site's signature ease (matches the menu overlay + TOC transitions).
const T = { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const }
const STROKE = { stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const }
// Rotate about the icon's centre (12,12) in viewBox space.
const PIVOT = { transformBox: 'view-box' as const, transformOrigin: '12px 12px' }

/**
 * Two horizontal bars that morph between a hamburger and an X: each bar rotates
 * about the icon's centre and slides to the middle. The same two elements animate
 * between both states, so it reads as one continuous morph rather than a crossfade.
 * Closed, it's pixel-identical to the static header hamburger (bars at y=9 / y=15).
 */
export function MenuToggle({ open }: { open: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <m.line
        x1="4" x2="20" y1="12" y2="12" {...STROKE} style={PIVOT}
        initial={false}
        animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -3 }}
        transition={T}
      />
      <m.line
        x1="4" x2="20" y1="12" y2="12" {...STROKE} style={PIVOT}
        initial={false}
        animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 3 }}
        transition={T}
      />
    </svg>
  )
}
