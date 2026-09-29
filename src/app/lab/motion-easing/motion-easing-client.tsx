'use client'

import { useEffect, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SPRING, SPRING_REDUCED } from '@/lib/motion'

// Every CSS row runs the same duration so the curve shapes are what differ, not the clocks.
// The spring row has no duration: its settle time comes from the physics in src/lib/motion.ts.
const CSS_DURATION_MS = 800
const BOX = '1.5rem'

type Curve =
  | { name: 'SPRING'; kind: 'spring'; note: string }
  | { name: `--ease-${string}`; kind: 'css'; note: string }

const CURVES: Curve[] = [
  { name: 'SPRING', kind: 'spring', note: 'The house spring, src/lib/motion.ts. Everything that springs on the site uses it.' },
  { name: '--ease-spring', kind: 'css', note: 'The CSS stand-in for the spring, for enter and exit that a CSS transition owns.' },
  { name: '--ease-out', kind: 'css', note: 'The default for most CSS transitions and reveals.' },
  { name: '--ease-drawer', kind: 'css', note: 'Sheets and drawers.' },
]

/** One track. The box travels from the left edge to the right edge on mount. */
function Track({ curve, reduced }: { curve: Curve; reduced: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [end, setEnd] = useState(0)
  const [go, setGo] = useState(false)

  // The spring animates a pixel distance, so the track is measured (and re-measured on resize).
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const box = parseFloat(getComputedStyle(el).fontSize) * 1.5
    const observer = new ResizeObserver(([entry]) => setEnd(entry.contentRect.width - box))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The CSS rows start on the frame after mount so the transition has a "from" to leave.
  useEffect(() => {
    const id = requestAnimationFrame(() => setGo(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div ref={trackRef} className="relative h-6 w-full" style={{ containerType: 'inline-size' }}>
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-[var(--color-border)]" />
      {curve.kind === 'spring' ? (
        <m.div
          className="absolute left-0 top-0 h-6 w-6 rounded-lg bg-[var(--color-accent)]"
          initial={{ x: 0 }}
          animate={{ x: end }}
          // Reduced motion keeps the move (it says where the thing went) but drops the overshoot.
          // The site's MotionConfig reducedMotion="user" also applies, so transforms may snap.
          transition={reduced ? SPRING_REDUCED : SPRING}
        />
      ) : (
        <div
          className="absolute left-0 top-0 h-6 w-6 rounded-lg bg-[var(--color-accent)]"
          style={{
            transform: go ? `translateX(calc(100cqw - ${BOX}))` : 'translateX(0)',
            transition: reduced ? 'none' : `transform ${CSS_DURATION_MS}ms var(${curve.name})`,
          }}
        />
      )}
    </div>
  )
}

export function MotionEasingClient() {
  // Remounting the tracks is the replay: every box starts over from the left edge.
  const [run, setRun] = useState(0)
  const reduced = useReducedMotion() ?? false

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="section-label">
          {reduced
            ? 'prefers-reduced-motion is on: the springs are critically damped and the CSS rows snap.'
            : 'Same box, same distance. Only the curve differs.'}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>
          <RotateCcw aria-hidden="true" />
          Replay
        </Button>
      </div>
      <ul key={run} className="mt-10 divide-y divide-border">
        {CURVES.map((curve) => (
          <li key={curve.name} className="grid grid-cols-1 gap-y-4 py-8 md:grid-cols-[14rem_1fr] md:gap-x-8">
            <div>
              <p className="font-mono text-label text-foreground">{curve.name}</p>
              <p className="mt-1 font-sans text-label leading-label text-[var(--color-muted)]">{curve.note}</p>
              <p className="mt-1 font-mono text-label text-[var(--color-muted)]">
                {curve.kind === 'spring'
                  ? `stiffness ${SPRING.stiffness}, damping ${SPRING.damping}, mass ${SPRING.mass}`
                  : `${CSS_DURATION_MS}ms`}
              </p>
            </div>
            <div className="self-center">
              <Track curve={curve} reduced={reduced} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
