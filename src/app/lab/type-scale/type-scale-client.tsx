'use client'

import { useEffect, useRef, useState } from 'react'

export type Step = { token: string; use: string; heading?: boolean }

/**
 * The fluid scale, one row per token. The specimen's font-size IS the token (`var(--text-prose)`
 * and so on), so the browser does the clamp() math and the row resizes with the viewport on its
 * own. The only client work is the readout: after mount and on every resize, each specimen's
 * computed font-size is read back and printed beside its name, so the number tracks the slide
 * between the token's minimum and maximum.
 */
export function TypeScaleClient({ steps }: { steps: Step[] }) {
  const refs = useRef<(HTMLParagraphElement | null)[]>([])
  const [readout, setReadout] = useState<{ width: number; sizes: string[] } | null>(null)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = requestAnimationFrame(() => {
        setReadout({
          width: window.innerWidth,
          sizes: refs.current.map((el) => (el ? `${Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10}px` : '')),
        })
      })
    }
    measure()
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div>
      <p className="section-label">
        Viewport <span className="font-mono text-foreground">{readout ? `${readout.width}px` : '…'}</span>. The tokens are
        anchored between 375px and 1440px; outside that band they sit at their minimum or maximum.
      </p>
      <ul className="mt-10 divide-y divide-border">
        {steps.map((step, i) => (
          <li key={step.token} className="grid grid-cols-1 gap-y-3 py-8 md:grid-cols-[14rem_1fr] md:gap-x-8">
            <div>
              <p className="font-mono text-label text-foreground">{step.token}</p>
              <p className="mt-1 font-mono text-label text-[var(--color-muted)]">{readout ? readout.sizes[i] : '…'}</p>
              <p className="mt-1 font-sans text-label leading-label text-[var(--color-muted)]">{step.use}</p>
            </div>
            <p
              ref={(el) => {
                refs.current[i] = el
              }}
              className={`font-sans text-foreground ${step.heading ? 'font-medium leading-heading tracking-[-0.02em]' : 'leading-prose'}`}
              style={{ fontSize: `var(${step.token})` }}
            >
              Sketch, pick, harvest
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
