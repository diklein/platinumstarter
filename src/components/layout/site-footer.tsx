import Link from 'next/link'
import pkg from '../../../package.json'
import { SOCIAL_LINKS } from '@/components/social-icons'
import { getLastCommitTimestamp } from '@/lib/last-updated'
import { site } from '@/lib/site-config'
import { FooterLastUpdated } from './footer-last-updated'

// Server component — the package.json import stays server-side (never shipped to the client);
// only the resolved version string is serialized into the HTML. The version is bumped
// automatically on push by scripts/bump-version.mjs (see the pre-push hook).
//
// Layout: a single left-aligned block — byline, the quiet social row, then the version tag
// beneath it. (A newsletter signup form lived here once; a `buttondown` handle in `social`
// links out to the newsletter instead, since a form that fails silently is worse than none.)
//
// The footer sits on the same 12-column grid as PageShell (matching px-6 md:px-12 gutters and
// gap-x-6), so its left edge lines up with the page content above it. From lg up the block is
// held to 3 of those 12 columns; below lg it stays the max-w-md stack it has always been.
//
// Every row is a config decision (site.footer + the social handles): the byline renders only
// when one is written, the social row only when a network is filled, and the version line
// only when at least one of its two halves is switched on.
export function SiteFooter() {
  const lastUpdatedAt = getLastCommitTimestamp()
  const { byline, bylineHref, version, lastUpdated } = site.footer
  return (
    // The footer now renders OUTSIDE <main> (a sibling in SiteLayout's sticky-footer flex),
    // where <footer> carries the contentinfo role implicitly. The explicit attribute stays:
    // it is harmless, and MobileMenu's inert sweep targets footer[role="contentinfo"].
    <footer role="contentinfo" className="px-6 md:px-12 py-8 grid grid-cols-12 gap-x-6">
      <div className="col-span-12 flex w-fit flex-col gap-4">
        {byline && (
          <p className="w-0 min-w-full font-sans text-label leading-label text-muted-foreground">
            {/* With a target the whole byline is one quiet link (.link-subtle: hairline
                underline, ink on hover), the same treatment the colophon uses. */}
            {bylineHref
              ? <a href={bylineHref} className="link-subtle" rel={/^https?:/.test(bylineHref) ? 'noopener noreferrer' : undefined}>{byline}</a>
              : byline}
          </p>
        )}
        {/* Quiet row: muted marks that turn the link-red accent on hover, the same signal every
            prose link uses (globals .link-accent-hover) and the social-marks direction from
            /lab/social-links. Each mark sits in a fixed 20px box at its full optical size (the
            box the optical values were tuned for — this row ran them at 90% until 2026-07-23)
            so filled and stroked marks carry equal visual weight; the invisible ::after extends
            the tap target to ~32x34px (non-overlapping within the gap-4 row) without moving the
            icon, matching the header's hit-area trick. :active mirrors :hover for touch. */}
        {SOCIAL_LINKS.length > 0 && (
        <ul className="flex items-center gap-4">
          {SOCIAL_LINKS.map(({ label, href, Icon, optical }) => (
            <li key={label}>
              <Link
                href={href}
                aria-label={label}
                title={label}
                // ::after tap target: 36x44 (x capped by the gap-4 row so neighbors don't
                // overlap; y is free — the byline above and version below aren't clickable).
                className="relative flex h-5 w-5 items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)] active:text-[var(--color-accent)] after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
              >
                <Icon size={optical} />
              </Link>
            </li>
          ))}
        </ul>
        )}
        {/* Version keeps its mono identity; the timestamp rides after it in the site sans,
            separated by two (non-breaking) spaces, a dot, and two spaces. */}
        {(version || lastUpdated) && (
          <p className="font-sans text-label leading-label text-muted-foreground">
            {version && <span className="font-mono tabular-nums">v{pkg.version}</span>}
            {lastUpdated && <FooterLastUpdated timestamp={lastUpdatedAt} separator={version} />}
          </p>
        )}
      </div>
    </footer>
  )
}
