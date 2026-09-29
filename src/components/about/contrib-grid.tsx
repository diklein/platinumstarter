'use client'

import { memo, useState } from 'react'
import { createPortal } from 'react-dom'

/* The contribution grid with an instant tooltip: "x contributions on MM/DD/YYYY".
 * One delegated tooltip element styled like the shadcn tooltip (dark pill, tiny
 * type) instead of 369 Radix instances or the native SVG <title> (whose system
 * tooltip takes seconds to appear). Cells stay attribute-light — two short data
 * attributes each — preserving the flight-payload optimization documented in
 * github-calendar.tsx. */

type Day = { date: string; weekday: number; contributionCount: number }
type Week = { contributionDays: Day[] }

const CELL = 10
const GAP = 2

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count <= 3) return 1
  if (count <= 10) return 2
  if (count <= 20) return 3
  return 4
}

function label(count: string, date: string): string {
  const [y, m, d] = date.split('-')
  return `${count} contribution${count === '1' ? '' : 's'} on ${m}/${d}/${y}`
}

/* memo'd: `tip` lives in the parent, so every hover-move used to re-render (and
 * re-diff) all ~365 cells just to reposition the portalled pill. The cells depend
 * only on `weeks` — the handlers are delegated on the <svg>, so the whole grid
 * skips on tooltip changes. Each day carries its own weekday, so cells map straight
 * off contributionDays instead of a per-slot .find() over every week. */
const Cells = memo(function Cells({ weeks }: { weeks: Week[] }) {
  return (
    <>
      {weeks.map((week, wi) =>
        week.contributionDays.map((day) => (
          <rect
            key={day.date}
            x={wi * (CELL + GAP)}
            y={day.weekday * (CELL + GAP)}
            className={`c${getLevel(day.contributionCount)}`}
            data-c={day.contributionCount}
            data-d={day.date}
            tabIndex={0}
            role="img"
            aria-label={label(String(day.contributionCount), day.date)}
          />
        ))
      )}
    </>
  )
})

export function ContribGrid({ weeks, total }: { weeks: Week[]; total: number }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  const numWeeks = weeks.length
  const svgWidth = numWeeks * (CELL + GAP) - GAP
  const svgHeight = 7 * (CELL + GAP) - GAP

  // Fixed viewport coordinates + a body portal: no ancestor overflow or stacking
  // context can clip the tooltip (the calendar card is overflow-hidden). The x is
  // clamped so the pill never runs off the viewport edge either.
  const show = (target: Element) => {
    const c = target.getAttribute('data-c')
    const d = target.getAttribute('data-d')
    // A dataless target (the svg itself, cell gaps) clears the tooltip instead of
    // leaving the previous cell's pill stuck on screen.
    if (!c || !d) { setTip(null); return }
    const cell = target.getBoundingClientRect()
    const half = 130
    const x = Math.min(Math.max(cell.left + cell.width / 2, half), window.innerWidth - half)
    setTip({ text: label(c, d), x, y: cell.top })
  }

  return (
    <div className="relative">
      {/* role="group", not "img": an img svg flattens its children out of the
          accessibility tree, and each cell now carries its own label. Every cell is a
          tab stop — plain tabIndex over a roving pattern keeps the cells handler-free
          (focus delegates to the svg like hover does), at the cost of a long tab walk
          through the grid. */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="contrib-cal w-full h-auto"
        role="group"
        aria-label={`${total} GitHub contributions in the last year`}
        onMouseOver={(e) => show(e.target as Element)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => show(e.target as Element)}
        onBlur={() => setTip(null)}
      >
        <Cells weeks={weeks} />
      </svg>
      {tip && createPortal(
        // Purely visual: the per-cell aria-labels already carry the same text, so the
        // pill is hidden from the accessibility tree rather than orphaned as a tooltip.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap bg-foreground px-3 py-1.5 font-sans text-xs text-background"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>,
        document.body
      )}
    </div>
  )
}
