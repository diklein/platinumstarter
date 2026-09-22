import { cn } from '@/lib/utils'

interface PageShellProps {
  /** Optional full-width media rendered ABOVE the header (e.g. an app hero screenshot).
   *  The caller supplies its own grid-column wrapper. */
  hero?: React.ReactNode
  /** Big page title (rendered with .page-title). Accepts rich content for per-page
   *  typographic surgery (e.g. hand-kerning a glyph pair the font doesn't cover). */
  title: React.ReactNode
  /** The little muted line under the title (rendered with .section-label). Optional but standard.
   *  Accepts rich content (e.g. inline links) as well as a plain string. */
  subtitle?: React.ReactNode
  /** Optional element above the title (e.g. a back-link or kicker). */
  eyebrow?: React.ReactNode
  /** Optional top-right element in the header (e.g. a toggle). */
  action?: React.ReactNode
  children: React.ReactNode
  /** Extra classes on the outer grid wrapper. */
  className?: string
  /** Grid column for the header (title/subtitle). Defaults to `col-content`; pass e.g.
   *  `col-prose` so the title's left edge aligns with a wider body column (used by the
   *  /writing and /designs list pages to match their post / case-study reading column). */
  headerClassName?: string
}

/**
 * Standard content-page layout. Encapsulates the shell every page shares:
 * header-clearing top padding, the 12-column grid, and a title + muted subtitle
 * in the content column. Page content is passed as children and placed into the
 * same grid (use the col-* utilities to position it). Pass `hero` for landing
 * pages that lead with a full-width image above the title.
 *
 * Used by /about, /podcasts, /books, etc. Reach for this
 * whenever making a new page so layout and spacing stay consistent.
 */
export function PageShell({ hero, title, subtitle, eyebrow, action, children, className, headerClassName }: PageShellProps) {
  return (
    <div className={cn('px-6 md:px-12 pt-36 pb-32 grid grid-cols-12 gap-x-6', className)}>
      {hero}
      <header className={cn('mb-16 flex items-start justify-between gap-4', headerClassName ?? 'col-content')}>
        <div>
          {eyebrow && <div className="mb-6">{eyebrow}</div>}
          {/* -4px optical left-align: pull the first glyph's side bearing to the content edge,
              matching the home hero (hero-reveal.tsx). Inline, like the hero, because arbitrary
              classes / globals.css edits to this don't hot-reload reliably in Turbopack dev. */}
          <h1 className="page-title mb-4" style={{ marginLeft: '-4px' }}>{title}</h1>
          {subtitle && <div className="section-label">{subtitle}</div>}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}
