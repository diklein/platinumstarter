'use client'

import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_LINKS } from '@/lib/nav'

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
  /** The hamburger button — focus returns here on close so keyboard users don't restart from the top. */
  toggleRef?: React.RefObject<HTMLButtonElement | null>
}

/* Sits to the LEFT of the active label, like the desktop traveling dot — absolutely
   positioned into the label's left margin so the labels themselves stay aligned.
   Offsets are inline: -left-4 / top-1/2 / -translate-y-1/2 fail to land in the
   generated CSS in this dev session (the `.bottom-6` family). */
function Dot() {
  return <span aria-hidden="true" className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" style={{ left: -16, top: '50%', transform: 'translateY(-50%)' }} />
}

/* Focus without the :focus-visible ring — same trick as DKMediaViewer's restoreFocus. An
   Escape press makes the browser count the subsequent programmatic focus as keyboard-ish,
   so the global ring recipe (outline + halo shadow) would flash at a purely-tapping user.
   Inline styles suppress both halves for this one landing; lifted the moment focus moves
   on or a key goes down, so real keyboard navigation keeps its ring. */
function focusWithoutRing(el: HTMLElement) {
  el.focus({ preventScroll: true })
  const prevOutline = el.style.outline
  const prevShadow = el.style.boxShadow
  const lift = () => {
    el.style.outline = prevOutline
    el.style.boxShadow = prevShadow
    el.removeEventListener('blur', lift)
    window.removeEventListener('keydown', lift)
  }
  el.style.outline = 'none'
  el.style.boxShadow = 'none'
  el.addEventListener('blur', lift, { once: true })
  window.addEventListener('keydown', lift, { once: true })
}

export function MobileMenu({ isOpen, onClose, toggleRef }: MobileMenuProps) {
  const pathname = usePathname()

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // A true modal for the keyboard, not just the eye (same lesson as the photos lightbox):
  // aria-modal announces the page as inaccessible but doesn't make it so — Tab walked out of
  // the overlay into the covered page, where the focus ring is invisible under the opaque
  // background. `inert` on the page content makes the browser enforce the boundary natively.
  // Only #main-content, the site footer (its own sibling landmark now that it lives outside
  // <main>), and the skip link are inerted — the header above the overlay stays interactive
  // on purpose, since it carries the morphing hamburger/X that closes the menu. On close,
  // focus returns to that toggle.
  // Set while the menu is open and a Tab is pressed — the sign of a real keyboard session,
  // which is the only case where the close-time focus return should show its ring.
  const keyboardSession = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    keyboardSession.current = false
    const touched = [
      document.getElementById('main-content'),
      document.querySelector<HTMLElement>('footer[role="contentinfo"]'),
      document.querySelector<HTMLElement>('a[href="#main-content"]'),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.inert)
    touched.forEach((el) => { el.inert = true })
    const toggle = toggleRef?.current // captured at open — the hamburger persists across open/close
    return () => {
      touched.forEach((el) => { el.inert = false })
      if (!toggle) return
      if (keyboardSession.current) toggle.focus({ preventScroll: true })
      else focusWithoutRing(toggle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Focus lands on the DIALOG, not its first link: SRs announce the menu either way, but
  // focusing "Writing" painted its focus ring on every tap-open (programmatic focus after a
  // click can still match :focus-visible). tabIndex=-1 containers are excluded from the
  // global ring recipe, so the overlay takes focus invisibly; the first Tab reaches the
  // links with the ring where it belongs.
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isOpen) overlayRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Tab') keyboardSession.current = true
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Close on route change so the overlay covers the navigation instead of the old
  // page flashing before the new one paints. (Same-page taps handled on the link.)
  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          ref={overlayRef}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-[42] bg-[var(--color-bg)] flex flex-col overflow-y-auto"
        >
          {/* No header bar here — the real header (z-[45]) sits above this overlay and
              carries the logo + the morphing hamburger/X toggle. pt-20 clears it. */}
          {/* Primary nav */}
          <nav aria-label="Main navigation" className="pt-20 px-6">
            <ul className="space-y-1">
              {NAV_LINKS.map((link, i) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <m.li
                    key={link.href}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <Link
                      href={link.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => { if (pathname === link.href) onClose() }}
                      className={cn(
                        'font-sans text-[1.125rem] text-foreground transition-opacity hover:opacity-70 active:opacity-70 py-2 block',
                        isActive && 'text-foreground'
                      )}
                    >
                      <span className="relative">{isActive && <Dot />}{link.label}</span>
                    </Link>
                  </m.li>
                )
              })}
            </ul>
          </nav>

        </m.div>
      )}
    </AnimatePresence>
  )
}
