'use client'

import { useEffect, useRef } from 'react'

/* ── commented out: vertical ray animation ──────────────────────────────────
const css = `
  @keyframes nf-vert-down {
    0%   { transform: translateY(-280px) scaleY(0.45); opacity: 0.35;
           animation-timing-function: ease-in; }
    42%  { transform: translateY(36vh)   scaleY(2.6);  opacity: 0.12;
           animation-timing-function: ease-out; }
    100% { transform: translateY(calc(100vh + 280px)) scaleY(0.45); opacity: 0.35; }
  }
  @keyframes nf-vert-up {
    0%   { transform: translateY(calc(100vh + 280px)) scaleY(0.45); opacity: 0.35;
           animation-timing-function: ease-in; }
    42%  { transform: translateY(64vh)   scaleY(2.6);  opacity: 0.12;
           animation-timing-function: ease-out; }
    100% { transform: translateY(-280px) scaleY(0.45); opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nf-ray { display: none; }
  }
`
const VERT_RAYS = [
  { col: 1,  side: 'left',  dir: 'down', duration: 3.2, delay: -1.1, height: 200 },
  { col: 2,  side: 'right', dir: 'up',   duration: 5.0, delay: -3.7, height: 215 },
  { col: 4,  side: 'left',  dir: 'down', duration: 2.8, delay: -0.9, height: 185 },
  { col: 6,  side: 'right', dir: 'up',   duration: 6.2, delay: -2.4, height: 235 },
  { col: 7,  side: 'left',  dir: 'down', duration: 3.8, delay: -3.0, height: 195 },
  { col: 9,  side: 'right', dir: 'up',   duration: 2.6, delay: -1.4, height: 205 },
  { col: 10, side: 'left',  dir: 'down', duration: 5.5, delay: -4.1, height: 190 },
  { col: 12, side: 'right', dir: 'up',   duration: 4.2, delay: -2.0, height: 220 },
]
─────────────────────────────────────────────────────────────────────────── */

const CELL = 8   // px per cell
const FPS  = 1

function makeGrid(cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(cols * rows)
  for (let i = 0; i < 2; i++) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    g[r * cols + c] = 1
  }
  return g
}

// Standard Conway rules
function tick(g: Uint8Array<ArrayBuffer>, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(g.length)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          n += g[((r + dr + rows) % rows) * cols + ((c + dc + cols) % cols)]
        }
      }
      const alive = g[r * cols + c]
      next[r * cols + c] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
    }
  }
  return next
}

// Growth-only rules: live cells never die, dead cells with any live neighbour are born.
// Guarantees pure expansion — no cell can disappear during the first 8 seconds.
function tickGrowth(g: Uint8Array<ArrayBuffer>, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(g.length)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (g[r * cols + c]) { next[r * cols + c] = 1; continue } // alive → always stays alive
      let n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          n += g[((r + dr + rows) % rows) * cols + ((c + dc + cols) % cols)]
        }
      }
      next[r * cols + c] = n >= 1 && Math.random() < 0.35 ? 1 : 0 // dead → 35% chance per live neighbour
    }
  }
  return next
}

export function NotFoundBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Read cell color from the design system at runtime
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--color-muted)'
    document.body.appendChild(probe)
    const cellColor = getComputedStyle(probe).color
    document.body.removeChild(probe)

    let cols = 0, rows = 0, grid: Uint8Array<ArrayBuffer> = new Uint8Array(0)

    const init = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      cols = Math.ceil(canvas.width  / CELL)
      rows = Math.ceil(canvas.height / CELL)
      grid = makeGrid(cols, rows)
    }

    const draw = () => {
      if (!cols || !rows) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = cellColor
      ctx.globalAlpha = 0.22
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r * cols + c]) {
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL)
          }
        }
      }
    }

    const reset = () => {
      grid = makeGrid(cols, rows)
      ticks = 0
      prevAlive = -1
      stuckFor = 0
    }

    let ticks = 0, prevAlive = -1, stuckFor = 0
    const interval = setInterval(() => {
      draw()
      ticks++
      if (ticks <= 3) {
        grid = tickGrowth(grid, cols, rows)
      } else {
        grid = tick(grid, cols, rows)
        const alive = grid.reduce((s, v) => s + v, 0)
        if (alive === 0 || alive === prevAlive) {
          stuckFor++
          if (stuckFor >= 2) reset() // dead or oscillator for 2+ ticks → restart
        } else {
          stuckFor = 0
        }
        prevAlive = alive
      }
    }, 1000 / FPS)
    const ro = new ResizeObserver(init)
    ro.observe(canvas)

    return () => {
      clearInterval(interval)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none select-none absolute inset-0 w-full h-full"
      aria-hidden="true"
    />
  )
}
