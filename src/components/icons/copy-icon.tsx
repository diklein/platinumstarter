'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as m from 'motion/react-m'
import { useAnimation } from 'motion/react'
import { SPRING } from '@/lib/motion'

/** Lucide's `copy`, drawn with two motion paths so it can play once on a successful copy:
 *  the two sheets slide apart and settle back. Adapted from lucide-animated (MIT), with the
 *  library's hover trigger, wrapper div and eager `motion` import removed: hover is instant
 *  on this site (craft rule), the tree runs LazyMotion strict, and the icon takes the same
 *  `size-4` classes as its Lucide sibling so nothing around it moves. Fire it with
 *  `ref.current?.play()` from the click handler, never from mouseenter. Reduced motion is
 *  handled by the app-level MotionConfig, which makes the transforms land instantly. */
export interface CopyIconHandle {
  play: () => void
}

const APART = { x: -2.5, y: -2.5 }
const HOLD_MS = 260 // Sheets stay apart long enough to read as a gesture, not a flicker.

export const CopyIcon = forwardRef<CopyIconHandle, { className?: string }>(function CopyIcon({ className }, ref) {
  const controls = useAnimation()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useImperativeHandle(ref, () => ({
    play: () => {
      clearTimeout(timer.current)
      controls.start('apart')
      timer.current = setTimeout(() => controls.start('rest'), HOLD_MS)
    },
  }))

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <m.rect
        x="8" y="8" width="14" height="14" rx="2" ry="2"
        initial="rest"
        animate={controls}
        transition={SPRING}
        variants={{ rest: { x: 0, y: 0 }, apart: APART }}
      />
      <m.path
        d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        initial="rest"
        animate={controls}
        transition={SPRING}
        variants={{ rest: { x: 0, y: 0 }, apart: { x: -APART.x, y: -APART.y } }}
      />
    </svg>
  )
})
