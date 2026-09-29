'use client'

import * as m from 'motion/react-m'
import { BookOpen, X } from 'lucide-react'
import { useMotionValue, useTransform, animate } from 'motion/react'
import { useState, useEffect, useRef } from 'react'
import type { TocItem } from '@/lib/posts'
import { smoothScrollToId } from '@/lib/smooth-scroll'
import { useActiveHeading } from '@/lib/use-active-heading'
import { SPRING } from '@/lib/motion'
import { registerMobileToc, MOBILE_TOC_TRIGGER_ID } from '@/lib/mobile-toc-state'

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1]
const DISMISS_RATIO = 0.28 // drag past this fraction of the sheet height → dismiss

function IconClose() {
  return <X aria-hidden="true" size={18} />
}

// Phone counterpart to the sticky desktop Contents sidebar (`hidden md:block`).
// The trigger is the book icon in the site header's mobile bar (see TocButton in
// site-header.tsx, wired through mobile-toc-state.ts) — it opens this bottom sheet of
// the same headings, with the active section highlighted like the desktop sidebar,
// and a swipe-down-to-dismiss that tracks the finger.
export function MobileToc({ toc }: { toc: TocItem[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [render, setRender] = useState(false)
  const activeSlug = useActiveHeading(toc)

  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startY: 0 })
  // Whether the dismissal that's about to run was pointer-driven (tap/click/swipe) vs
  // keyboard (Escape, Enter on the close button). Focus restoration reads this to decide
  // whether the pill may show a focus ring — script focus() can match :focus-visible
  // (Safari especially), which painted a ring after a plain tap-to-close.
  const closedByPointer = useRef(false)

  const y = useMotionValue(9999) // rest off-screen so the first mount never flashes open
  // Backdrop fades in lockstep with the sheet position (including while dragging).
  // Runs during SSR too (the hook always executes), so guard the window access.
  const backdropOpacity = useTransform(y, (v) => {
    if (typeof window === 'undefined') return 0
    const h = sheetRef.current?.offsetHeight || window.innerHeight
    return Math.max(0, Math.min(1, 1 - v / h))
  })

  // Announce presence to the header (shows the book icon) and open on its event.
  useEffect(() => registerMobileToc(), [])
  useEffect(() => {
    const onOpen = () => setIsOpen(true)
    window.addEventListener('open-mobile-toc', onOpen)
    return () => window.removeEventListener('open-mobile-toc', onOpen)
  }, [])

  // Mount the sheet before animating open (render adjustment, not an effect: the sheet
  // must exist in the same commit the open state lands so the slide starts from it);
  // unmount after animating closed.
  if (isOpen && !render) setRender(true)

  useEffect(() => {
    if (!render) return
    const h = sheetRef.current?.offsetHeight || window.innerHeight
    // MotionConfig's reducedMotion covers m.* components, NOT these imperative animate()
    // calls — honor the preference with zero-duration runs to the same end states, so the
    // unmount still flows through onComplete like the animated close does.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced && isOpen) {
      y.jump(0)
      return
    }
    if (isOpen) {
      // jump(), NOT set(). The motion value rests at a 9999px off-screen sentinel, and set() RECORDS
      // VELOCITY — so dropping it to the sheet's height handed the animation an enormous negative
      // velocity (~9,400px in one frame). A tween ignores velocity, which is why the old eased
      // version looked fine; a SPRING respects it, and launched the sheet to -19,903px before
      // hauling it back. That was the "really aggressive" bounce: not the spring's tuning, a bug.
      // jump() sets the value without writing velocity, so the spring starts from rest.
      y.jump(h) // start just below the viewport, then slide up
      // THE house spring (src/lib/motion.ts) — the same one the lightbox opens and slides with, so
      // the sheet feels like the same object. Its own tuning had ωₙ = 17.3 against the lightbox's
      // 29.8, which is exactly why it dragged. The CLOSE stays a plain eased curve: a bounce on the
      // way out reads as the sheet failing to leave.
      const controls = animate(y, 0, SPRING)
      return () => controls.stop()
    }
    // Slide fully clear of the viewport (+ its upward shadow) before unmounting, so the
    // sheet never pops out at the very end of the close. Reduced motion takes the same
    // path at zero duration.
    const controls = animate(y, h + 48, {
      duration: reduced ? 0 : 0.3,
      ease: EASE,
      onComplete: () => setRender(false),
    })
    return () => controls.stop()
  }, [render, isOpen, y])

  // Body scroll lock + Escape while open.
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closedByPointer.current = false; setIsOpen(false); return }
      // Minimal focus trap. The sheet renders deep inside <main>, so the lightbox's
      // body-children inert sweep can't isolate it — cycling Tab within the dialog is the
      // containment aria-modal promises.
      if (e.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusables = sheet.querySelectorAll<HTMLElement>('a[href], button')
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (!sheet.contains(active)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (active === first || active === sheet)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Focus follows the dialog: into the sheet on open, back to the header's book icon on close.
  useEffect(() => {
    if (isOpen && render) sheetRef.current?.focus({ preventScroll: true })
  }, [isOpen, render])
  useEffect(() => {
    if (!isOpen) return
    return () => {
      const trigger = document.getElementById(MOBILE_TOC_TRIGGER_ID)
      if (!trigger) return
      if (closedByPointer.current) {
        // Suppress the ring for this programmatic focus only; the next blur re-arms it so
        // keyboard focus (Tab back to the trigger) still shows one.
        trigger.style.outline = 'none'
        trigger.addEventListener('blur', () => { trigger.style.outline = '' }, { once: true })
      }
      trigger.focus({ preventScroll: true })
    }
  }, [isOpen])

  // e.detail is 0 when a "click" was really keyboard activation (Enter/Space).
  const go = (slug: string, e: React.MouseEvent) => {
    closedByPointer.current = e.detail > 0
    // The scroll lock must lift BEFORE smoothScrollToId starts — the [isOpen] effect only
    // clears it after paint. A handler-time DOM write the rule can't tell from a render-time one.
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.overflow = ''
    setIsOpen(false)
    smoothScrollToId(slug)
  }

  // Swipe-to-dismiss: engage only when the list is scrolled to the top, then track
  // the finger 1:1. Release past the threshold dismisses; otherwise it springs back.
  const onTouchStart = (e: React.TouchEvent) => {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return
    drag.current = { active: true, startY: e.touches[0].clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return
    const delta = e.touches[0].clientY - drag.current.startY
    y.set(delta > 0 ? delta : 0)
  }
  const onTouchEnd = () => {
    if (!drag.current.active) return
    drag.current.active = false
    const h = sheetRef.current?.offsetHeight || window.innerHeight
    if (y.get() > h * DISMISS_RATIO) { closedByPointer.current = true; setIsOpen(false) }
    else animate(y, 0, { duration: 0.25, ease: EASE })
  }

  return (
    <div className="md:hidden">
      {render && (
        <>
          {/* Pointer-only dismissal surface; Escape and the labeled close button are the
              accessible paths. */}
          <m.div
            aria-hidden="true"
            style={{ opacity: backdropOpacity }}
            onClick={() => { closedByPointer.current = true; setIsOpen(false) }}
            className="fixed inset-0 z-50 bg-black/40"
          />
          <m.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
            tabIndex={-1}
            style={{ y }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            // after:* extends the sheet's own background BELOW its bottom edge. The sheet sits at
            // bottom:0, so the instant the open spring overshoots (y < 0) it lifts off the bottom of
            // the screen and the article shows through the gap underneath it — which is what made
            // the bounce look violent, and why the strip under the sheet was page content instead of
            // the sheet's surface. The skirt means there is nothing to see down there but the sheet.
            className="shadow-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col bg-[var(--color-bg)] after:absolute after:inset-x-0 after:top-full after:h-32 after:bg-[var(--color-bg)] after:content-['']"
          >
            <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
              {/* The small book echoes the header trigger that opened this sheet.
                  strokeWidth 2.4 at 16px ≈ the same drawn line as the header's 2.1 at 18px.
                  Same alignment system as the desktop rail: the 16px book centers on the
                  entries' dot column (x=3 → -5px), "Contents" lands at x=16 with the text. */}
              <span className="flex items-center font-sans text-[1.125rem] font-semibold text-foreground">
                <BookOpen aria-hidden="true" size={16} strokeWidth={2.4} className="ml-[-5px] mr-[5px] shrink-0" />
                Contents
              </span>
              <button
                type="button"
                onClick={(e) => { closedByPointer.current = e.detail > 0; setIsOpen(false) }}
                aria-label="Close"
                className="-mr-1 flex h-9 w-9 cursor-pointer items-center justify-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)]"
              >
                <IconClose />
              </button>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* <nav> so the global `main …a:not(nav a)` accent-link rule skips these. */}
              <nav aria-label="Table of contents">
                <ul>
                  {toc.map(({ depth, text, slug }) => {
                    const isActive = activeSlug === slug
                    return (
                      <li key={slug || 'intro'}>
                        <a
                          href={slug ? `#${slug}` : '#'}
                          onClick={(e) => { e.preventDefault(); go(slug, e) }}
                          aria-current={isActive ? 'location' : undefined}
                          // items-START, not items-center: a heading that wraps to two or three lines
                          // was dragging the dot down to the middle of the block, marking the gap
                          // between lines rather than where the entry begins.
                          className={`flex items-start gap-2.5 py-1.5 font-sans text-prose leading-snug no-underline transition-colors active:text-[var(--color-muted)] ${
                            isActive ? 'text-foreground' : 'text-[var(--color-muted)]'
                          }`}
                        >
                          {/* Same 6px accent circle the desktop Contents sidebar uses to mark the active
                              section. `1lh` is the entry's own line box, so the dot lands optically
                              centred on the FIRST line whatever the fluid type scale resolves to. */}
                          <span
                            aria-hidden="true"
                            style={{ marginTop: 'calc((1lh - 0.375rem) / 2)' }}
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-[var(--color-accent)]' : 'bg-transparent'}`}
                          />
                          <span className={depth === 3 ? 'pl-4' : ''}>{text}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </div>
          </m.div>
        </>
      )}
    </div>
  )
}
