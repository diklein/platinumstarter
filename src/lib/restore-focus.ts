// Returns focus to `el` after a modal closes. `withRing` should be true only when the session
// showed real keyboard navigation (a Tab press, or a keyboard-activated open): those users need
// the :focus-visible ring to see where they landed. A mouse user who pressed Escape just gets
// their focus position back with no ring — the browser's own heuristic counts Escape as
// "keyboard" and would flash the ring at them, which is exactly the over-trigger this avoids.
export function restoreFocus(el: HTMLElement, withRing: boolean) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest' })
  if (withRing) return
  // Suppress the ring for this landing only — ALL THREE pieces of the site's global
  // :focus-visible recipe (globals.css): the 2px accent outline, the 4px box-shadow halo,
  // AND the 4px border-radius. (An Escape press makes the browser treat the subsequent
  // programmatic focus as :focus-visible, so the rule fires even for a mouse session;
  // suppressing only outline+shadow left the radius rounding a photo thumbnail's corners.)
  // Inline styles win over the rule; lifted the moment focus moves on or the keyboard
  // comes into play.
  const prevOutline = el.style.outline
  const prevShadow = el.style.boxShadow
  const prevRadius = el.style.borderRadius
  const lift = () => {
    el.style.outline = prevOutline
    el.style.boxShadow = prevShadow
    el.style.borderRadius = prevRadius
    el.removeEventListener('blur', lift)
    window.removeEventListener('keydown', lift)
  }
  el.style.outline = 'none'
  el.style.boxShadow = 'none'
  el.style.borderRadius = '0'
  el.addEventListener('blur', lift, { once: true })
  window.addEventListener('keydown', lift, { once: true })
}
