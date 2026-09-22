import { cn } from '@/lib/utils'

/* ─────────────────────────────────────────────────────────────────────────────
   HeroBeacon — a faint grid-locked dot lattice behind the homepage hero, with ONE
   accent node resting on a real lattice cell, gently pulsing and emanating a ring.

   GRID-LOCKED. The resting lattice is a stack of real `grid grid-cols-12 gap-x-6`
   rows — the homepage's own grid (src/app/page.tsx) — on a fixed 4.5rem beat (3× the
   1.5rem gutter). This component fills `inset-0` of the page's 12-column grid container,
   so every dot sits at the LEFT EDGE of a real column and the vertical center of a real
   row. The accent node is placed by the SAME math (colX for the column's left edge,
   rowOffsetRem/rowY for the row center), so it lands exactly on one gray dot.

   IT DOESN'T MOVE. The node stays put on its cell; all the life is in place — the dot
   breathes (pulse) and radiates a soft ring (ping), both on --ease-out. Pure CSS keyframes
   on transform/opacity only (compositor) — no canvas, no rAF, no motion components — so this
   stays a Server Component and never touches the main thread on load. It's absolutely
   positioned (no layout / no CLS) and sits BELOW the hero text (z-0 vs the statement's z-10),
   so the LCP text stays on top at full contrast. Resting dots are var(--color-muted) at a
   whisper 0.18 opacity (faint in light AND dark); accent red is the only color.
   prefers-reduced-motion freezes to a composed still: the node resting on its cell.
   ──────────────────────────────────────────────────────────────────────────── */

const GUTTER_PX = 24 // 1.5rem — the site's gap-x-6 column gutter

// A 12-column × 7-row lattice on a fixed 4.5rem beat (3× the gutter), so the vertical
// rhythm echoes the horizontal one and the field reads as a grid, not column stripes.
const ROWS = 7
const RHYTHM = 4.5 // rem
const PULSE_S = 2.2 // the dot's in-place breathing pulse + ring emanation

// Column-LEFT-EDGE X for column i (0-based) on a 12-col grid with 1.5rem gutters:
// left_i = (i/12)·W + (i/12)·gutter. Applied as translateX on a full-grid-width node, it lands
// the node's left edge exactly where the static dots start (the inline-start of each grid cell)
// — provably the same vertical gridlines.
function colX(i: number): string {
  const pct = (i / 12) * 100
  const px = (i / 12) * GUTTER_PX
  return `calc(${pct.toFixed(4)}% + ${px.toFixed(3)}px)`
}

// Row-center Y: in an N-row lattice laid out with flex `justify-center`, row r's center sits
// exactly (r + 0.5 − N/2)·rhythm from the vertical middle — the same point the lattice renders
// it — so the node is grid-locked on the vertical axis just as colX locks the horizontal.
function rowOffsetRem(row: number): number {
  return (row + 0.5 - ROWS / 2) * RHYTHM
}
function rowY(offsetRem: number): string {
  const mag = Math.abs(offsetRem)
  if (mag < 1e-6) return '50%'
  return `calc(50% ${offsetRem < 0 ? '-' : '+'} ${mag.toFixed(4)}rem)`
}

type Cell = { col: number; row: number } // 0-based column + row index on the lattice
function transformFor(c: Cell): string {
  return `translate(${colX(c.col)}, ${rowY(rowOffsetRem(c.row))})`
}

// The one cell the accent node rests on — a real lattice point (column × row), to the right of
// the hero statement (which fills cols 1–9) so the pulse reads in the open, not behind the text.
const CELL: Cell = { col: 10, row: 2 }

const STYLES = [
  // The dot's gentle in-place breathing.
  `@keyframes hero-beacon-pulse { 0%, 100% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.18); opacity: 1; } }`,
  // The emanating ring — a soft circle radiating outward and fading.
  `@keyframes hero-beacon-ping { 0% { transform: scale(0.9); opacity: 0.45; } 70%, 100% { transform: scale(3); opacity: 0; } }`,
  `.hero-beacon-pulse { will-change: transform, opacity; animation: hero-beacon-pulse ${PULSE_S}s var(--ease-out) infinite; }`,
  `.hero-beacon-ping { opacity: 0; will-change: transform, opacity; animation: hero-beacon-ping ${PULSE_S}s var(--ease-out) infinite; }`,
  `@media (prefers-reduced-motion: reduce) {
  .hero-beacon-pulse, .hero-beacon-ping { animation: none !important; }
  .hero-beacon-ping { opacity: 0 !important; }
  .hero-beacon-pulse { opacity: 1 !important; transform: none !important; }
}`,
].join('\n\n')

/**
 * Faint grid-locked dot lattice + one resting, pulsing accent node, rendered as a decorative
 * backdrop. Mount it as the first child of the homepage's `relative grid grid-cols-12 gap-x-6`
 * container; it fills `inset-0` and locks to that exact 12-column grid. Keep the hero statement
 * above it (higher z-index) so the text stays the LCP and fully legible.
 */
export function HeroBeacon({ className }: { className?: string }) {
  // The accent dot, sized to match the header's active-nav dot (w-1.5 h-1.5 = 6px). left-0 (no
  // -ml) puts its left edge on the column gridline; the inline marginTop:-3px centers the 6px dot
  // on the row — inline (not a Tailwind arbitrary class) so it always applies, dev cache or not.
  // The ping shares these classes so it stays concentric with the dot.
  const mark = 'absolute left-0 top-0 h-1.5 w-1.5 rounded-full'
  const nudge = { marginTop: '-3px' }
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 z-0 overflow-hidden', className)}
    >
      <style>{STYLES}</style>

      {/* Resting lattice — real `grid grid-cols-12 gap-x-6` rows on the fixed 4.5rem beat, so
          every dot sits at the left edge of a real column and the center of a real row of the
          homepage's own grid. */}
      <div className="absolute inset-0 flex flex-col justify-center">
        {Array.from({ length: ROWS }).map((_, r) => (
          <div
            key={r}
            className="grid shrink-0 grid-cols-12 items-center gap-x-6"
            style={{ height: `${RHYTHM}rem` }}
          >
            {Array.from({ length: 12 }).map((__, c) => (
              <span
                key={c}
                className="block h-[5px] w-[5px] justify-self-start rounded-full bg-[var(--color-muted)] opacity-[0.18]"
              />
            ))}
          </div>
        ))}
      </div>

      {/* The one node — a full-grid-width layer (so translateX % maps to grid width) carrying the
          accent dot + its ring, positioned by transformFor(CELL) to rest exactly on one gray dot:
          left-aligned to the column, vertically centered on the row. Nothing animates its
          position — only the dot pulses and the ring emanates. */}
      <div className="absolute inset-0">
        <div className="absolute left-0 top-0 h-full w-full" style={{ transform: transformFor(CELL) }}>
          <span style={nudge} className={cn('hero-beacon-ping', mark, 'border border-[var(--color-accent)]')} />
          <span style={nudge} className={cn('hero-beacon-pulse', mark, 'bg-[var(--color-accent)]')} />
        </div>
      </div>
    </div>
  )
}
