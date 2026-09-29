import { navLinks } from './site-config'

export type NavLink = { num: string; href: string; label: string }

/**
 * The header's primary links, derived from site.config.ts: the `nav` order, with any module
 * that is toggled off dropped (see navLinks()). `num` is the zero-padded ordinal the header
 * and the mobile menu print beside each link, numbered over the links that actually render.
 */
export const NAV_LINKS: readonly NavLink[] = navLinks().map((link, i) => ({
  num: String(i + 1).padStart(2, '0'),
  ...link,
}))

