'use client'

import { useEffect, useRef, useState } from 'react'
import { CopyIcon, type CopyIconHandle } from '@/components/icons/copy-icon'

/** Copy-to-clipboard for code blocks. Rendered as a sibling of the <pre> inside a
 *  `relative group` wrapper (a sibling, not a child, so it stays pinned top-right while
 *  the pre scrolls sideways). The code text is read from the DOM at click time — no props
 *  threaded through rehype. Confirmation is the same floating card the Copy URL button
 *  shows (t-dropdown + shadow-command), with code-specific text. */
export function CopyCodeButton() {
  const ref = useRef<HTMLButtonElement>(null)
  const iconRef = useRef<CopyIconHandle>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const close = () => {
    clearTimeout(autoCloseTimerRef.current)
    setIsOpen(false)
    setIsClosing(true)
    clearTimeout(closeTimerRef.current)
    // Outlast the CSS close animation (--dropdown-close-dur: 150ms) — same as ShareButton.
    closeTimerRef.current = setTimeout(() => setIsClosing(false), 170)
  }

  const copy = async () => {
    if (isOpen) { close(); return }
    const code = ref.current?.parentElement?.querySelector('pre')?.textContent
    if (!code) return
    await navigator.clipboard.writeText(code)
    // The icon plays once per successful copy (press feedback), never on hover.
    iconRef.current?.play()
    setIsClosing(false)
    setIsOpen(true)
    autoCloseTimerRef.current = setTimeout(close, 2200)
  }

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current)
    clearTimeout(autoCloseTimerRef.current)
  }, [])

  const cardClass = ['t-dropdown', isOpen && 'is-open', isClosing && 'is-closing'].filter(Boolean).join(' ')

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={copy}
        aria-label="Copy code"
        // Hidden-until-hover ONLY where hover exists — on touch screens there is no hover to
        // reveal it, so it stays visible there. Keyboard reveal rides group-focus-within (the
        // pre itself is tabbable) plus the button's own focus.
        // Resting bg lives in globals.css (.copy-code-chip): the code well's token nudged
        // toward foreground per theme, so the button reads as a control against the code
        // instead of floating invisibly (2026-08-25).
        className="copy-code-chip absolute right-2 top-2 z-10 flex size-8 cursor-pointer items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      >
        <CopyIcon ref={iconRef} className="size-4" />
      </button>
      {/* The ShareButton confirmation card, anchored under the button (top-2 + size-8 + 6px
          gap). role="status": always-mounted region, text renders only while open, so the
          insertion is what screen readers announce. */}
      <div
        className={cardClass}
        data-origin="top-right"
        style={{ position: 'absolute', top: 'calc(0.5rem + 2rem + 6px)', right: '0.5rem', zIndex: 50, width: 'max-content' }}
      >
        <div role="status" className="shadow-command bg-background dark:bg-[var(--color-surface)] px-4 py-3 whitespace-nowrap">
          <p className="font-sans text-sm text-foreground whitespace-nowrap">{(isOpen || isClosing) && 'Code copied to clipboard'}</p>
        </div>
      </div>
    </>
  )
}
