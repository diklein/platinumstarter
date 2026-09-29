'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'

export function ShareButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const close = useCallback(() => {
    clearTimeout(autoCloseTimerRef.current)
    setIsOpen(false)
    setIsClosing(true)
    clearTimeout(closeTimerRef.current)
    // Outlast the CSS close animation (--dropdown-close-dur: 150ms) so the exit plays fully;
    // removing .is-closing early snapped the card to its hidden base mid-animation.
    closeTimerRef.current = setTimeout(() => setIsClosing(false), 170)
  }, [])

  const handleClick = useCallback(() => {
    if (isOpen) { close(); return }
    // The write can be refused (permissions policy, non-secure context) — the rejection
    // swaps the already-open card's text to the failure line, same status area.
    setCopyFailed(false)
    navigator.clipboard.writeText(window.location.href).catch(() => setCopyFailed(true))
    setIsClosing(false)
    setIsOpen(true)
    autoCloseTimerRef.current = setTimeout(close, 2200)
  }, [isOpen, close])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen, close])

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current)
    clearTimeout(autoCloseTimerRef.current)
  }, [])

  const cardClass = [
    't-dropdown',
    isOpen && 'is-open',
    isClosing && 'is-closing',
  ].filter(Boolean).join(' ')

  return (
    <div ref={wrapperRef} className="relative">
      <Button variant="secondary" size="default" onClick={handleClick}>
        Copy URL
      </Button>
      <div
        className={cardClass}
        data-origin="top-right"
        // width: max-content sizes the card to its one-line content, ignoring the narrow
        // containing block (the button-width wrapper) that was collapsing it and wrapping the text.
        style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, width: 'max-content' }}
      >
        {/* Floating panel: no border/ring — light mode separates on the diffuse
            shadow-command stack, dark mode on the lifted surface plane (same recipe as
            the command palette). */}
        {/* role="status": the confirmation must be ANNOUNCED, not just shown. The node is
            always mounted (the reveal is a class flip), so the region exists before the
            open — and the text renders only while open, which is the insertion screen
            readers announce. */}
        <div role="status" className="shadow-command bg-background dark:bg-[var(--color-surface)] px-4 py-3 whitespace-nowrap">
          <p className="font-sans text-sm text-foreground whitespace-nowrap">{(isOpen || isClosing) && (copyFailed ? 'Copy failed' : 'URL copied to clipboard')}</p>
        </div>
      </div>
    </div>
  )
}
