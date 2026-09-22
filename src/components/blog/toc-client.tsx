'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TocItem } from '@/lib/posts'
import { smoothScrollToId } from '@/lib/smooth-scroll'
import { useActiveHeading } from '@/lib/use-active-heading'

export function TocClient({ toc }: { toc: TocItem[] }) {
  const spySlug = useActiveHeading(toc)

  // On click we optimistically "pin" the target so the marker heads to it at once, rather
  // than trailing the smooth scroll. The pin releases once the scroll settles (scroll-spy
  // catches up) or the reader scrolls themselves.
  const [pinnedSlug, setPinnedSlug] = useState<string | null>(null)
  const activeSlug = pinnedSlug ?? spySlug

  // The spy caught up: release the pin during render (the adjust-state-on-change pattern)
  // — activeSlug reads the same either way, so nothing repaints.
  if (pinnedSlug !== null && spySlug === pinnedSlug) setPinnedSlug(null)

  useEffect(() => {
    if (pinnedSlug === null) return
    const release = () => setPinnedSlug(null)
    window.addEventListener('wheel', release, { passive: true, once: true })
    window.addEventListener('touchstart', release, { passive: true, once: true })
    return () => {
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
    }
  }, [pinnedSlug])

  // One accent dot travels to the active row with a quick, linear vertical slide. It's
  // positioned imperatively from the committed layout (useLayoutEffect) so it never trails
  // a render, and placed instantly on first paint so it doesn't slide in from the origin.
  const wrapRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const placedRef = useRef(false)

  const moveDot = (instant: boolean) => {
    const wrap = wrapRef.current
    const dot = dotRef.current
    if (!wrap || !dot) return
    const activeLi = wrap.querySelector<HTMLElement>('[data-active="true"]')
    if (!activeLi) { dot.style.opacity = '0'; return }
    const wRect = wrap.getBoundingClientRect()
    const lRect = activeLi.getBoundingClientRect()
    // Sit on the FIRST LINE of the entry, not in the middle of it. Centering on the row put the dot
    // halfway down any heading that wrapped to two or three lines, floating beside the gap between
    // them instead of marking where the entry begins. A Range over the text node yields one client
    // rect PER LINE BOX, so rect[0] is the first line — centre the dot on that. Falls back to the
    // row's centre for a single-line entry, which is the same answer anyway.
    const textEl = activeLi.querySelector<HTMLElement>('[data-toc-text]')
    let y = lRect.top - wRect.top + lRect.height / 2 - 3
    if (textEl) {
      const range = document.createRange()
      range.selectNodeContents(textEl)
      const first = range.getClientRects()[0]
      if (first) y = first.top - wRect.top + first.height / 2 - 3
    }
    // Same reduced-motion guard as smooth-scroll.ts: the dot jumps instead of sliding.
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (instant) {
      dot.style.transition = 'none'
      dot.style.transform = `translateY(${y}px)`
      void dot.offsetHeight // reflow so the next move animates
      dot.style.transition = prefersReduced ? 'none' : 'transform 120ms linear'
    } else {
      dot.style.transition = prefersReduced ? 'none' : 'transform 120ms linear'
      dot.style.transform = `translateY(${y}px)`
    }
    dot.style.opacity = '1'
  }

  useLayoutEffect(() => {
    moveDot(!placedRef.current)
    placedRef.current = true
  }, [activeSlug, toc])

  useEffect(() => {
    const onResize = () => moveDot(true) // reposition without a slide on layout shifts
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      {/* Single traveling marker — same 6px accent circle as the header's selected-nav dot. */}
      <span
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
        style={{ opacity: 0 }}
      />
      <ul className="space-y-2">
        {toc.map(({ depth, text, slug }) => {
          const isActive = activeSlug === slug
          return (
            <li key={slug || 'intro'} data-active={isActive}>
              <Link
                href={slug ? `#${slug}` : '#'}
                onClick={(e) => { e.preventDefault(); setPinnedSlug(slug); smoothScrollToId(slug) }}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  'flex items-center gap-2.5 font-sans text-label leading-label transition-colors no-underline',
                  isActive ? 'text-foreground' : 'text-[var(--color-muted)] hover:text-foreground active:text-foreground'
                )}
              >
                {/* Reserves the gutter the traveling dot occupies, keeping text aligned. */}
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0" />
                <span data-toc-text className={cn(depth === 3 && 'pl-2')}>{text}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
