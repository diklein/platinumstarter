/**
 * The site's keycap recipe for literal keyboard keys in prose ("press G", "tap esc").
 * Quiet by design: square corners, a hairline 1.5px border, regular-weight muted text, so
 * the cap reads as an annotation rather than a button (settled on /dkmediaviewer, 2026-07-18).
 * border-current, not a named color: the border IS the letter's color by construction, so
 * the two can never drift apart across themes or tinted contexts.
 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-[1.5px] border-current px-1 py-0 font-sans text-[1em] font-normal text-[var(--color-muted)]">
      {children}
    </kbd>
  )
}
