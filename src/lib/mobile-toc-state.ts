/* Bridge between page content and the global header: the mobile TOC sheet lives inside
 * the page (only pages with headings render it), but its trigger is the book icon in the
 * site header's mobile bar. A module-level presence count (not a boolean — during a
 * client-side navigation between two TOC pages the new sheet can mount before the old one
 * cleans up) lets the header show the icon exactly when the current page has a sheet to
 * open. Opening goes the other way via the 'open-mobile-toc' window event, mirroring the
 * command palette's 'open-command-menu' pattern. */

type Unsubscribe = () => void

let count = 0
const listeners = new Set<() => void>()

export function registerMobileToc(): Unsubscribe {
  count++
  listeners.forEach((l) => l())
  return () => {
    count--
    listeners.forEach((l) => l())
  }
}

export function subscribeMobileToc(onChange: () => void): Unsubscribe {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

export function getMobileTocPresent(): boolean {
  return count > 0
}

export function openMobileToc(): void {
  window.dispatchEvent(new Event('open-mobile-toc'))
}

/** id of the header's book-icon trigger — the sheet returns focus here on close. */
export const MOBILE_TOC_TRIGGER_ID = 'mobile-toc-trigger'
