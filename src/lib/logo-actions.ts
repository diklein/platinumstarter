/** Logo take-away actions, shared by the mark's right-click menu and the ⌘K palette —
 *  the palette rows exist because the context menu is pointer-only (right-click /
 *  long-press), so keyboard and switch users need another road to the same assets. */
import { site } from '@/lib/site-config'

/** The saved file is named after the site, not the template: "maren-holloway-mark.svg". */
export function markFilename(ext: 'svg' | 'png'): string {
  const slug = site.identity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'site'}-mark.${ext}`
}

export function copyLogoSvg(): Promise<void> {
  return fetch('/logo.svg')
    .then((r) => r.text())
    .then((svg) => navigator.clipboard.writeText(svg))
}

export function downloadLogo(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}
