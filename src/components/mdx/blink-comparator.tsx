'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * A blink comparator (Marcin, after the astronomers' instrument): two images in one slot,
 * swapped INSTANTLY on hover or tap — no crossfade, because the hard cut is the tool. The
 * eye holds position while the pixels change, so differences pop that a side-by-side hides.
 * For before/after design revisions and photo edits.
 *
 * Both images render at all times and swap via visibility, so the second frame is decoded
 * before the first flip and the swap can never flash white. Usage in MDX:
 *
 *   <BlinkComparator
 *     a="/images/writing/nav-before.png" b="/images/writing/nav-after.png"
 *     altA="The old navigation" altB="The revised navigation"
 *     width={1600} height={1000} caption="Hover to flip · before and after" />
 */
export function BlinkComparator({
  a,
  b,
  altA,
  altB,
  width,
  height,
  caption,
}: {
  a: string
  b: string
  altA: string
  altB: string
  width: number
  height: number
  caption?: string
}) {
  const [flipped, setFlipped] = useState(false)
  return (
    <figure className="col-media my-10 w-full">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`Comparison: ${altA} versus ${altB}. Activate to flip.`}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') setFlipped(true) }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setFlipped(false) }}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) }
        }}
        className="relative cursor-alias select-none"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <Image
          src={a}
          alt={altA}
          width={width}
          height={height}
          className={`absolute inset-0 h-full w-full ${flipped ? 'invisible' : 'visible'}`}
        />
        <Image
          src={b}
          alt={altB}
          width={width}
          height={height}
          className={`absolute inset-0 h-full w-full ${flipped ? 'visible' : 'invisible'}`}
        />
      </div>
      <figcaption className="mt-3 flex items-baseline justify-between font-sans text-label text-[var(--color-muted)]">
        <span>{caption ?? 'Hover to flip · tap on touch'}</span>
        {/* Which frame is showing, so the state is never ambiguous (also read by AT via aria-pressed). */}
        <span className="font-mono text-[11px] tabular-nums">{flipped ? 'B' : 'A'}</span>
      </figcaption>
    </figure>
  )
}
