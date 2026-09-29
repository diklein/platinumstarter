import { getAllPosts } from './posts'
import { DESIGNS, PATENTS } from './designs'
import { MODULE_IDS, moduleEnabled, type ModuleId, setupPageVisible } from './site-config'
import { site } from './site-config'

export type SearchKind = 'Page' | 'Writing' | 'Design'

export type SearchItem = {
  title: string
  href: string
  kind: SearchKind
  keywords?: string
  /** One-line context shown as the result's second line when the query doesn't
   *  appear in the item's body text (pages have no body at all). */
  description?: string
}

// The Archive page's "N posts since YYYY" subtitle, recomputed the same way
// (src/app/archive/page.tsx counts non-note posts).
function archiveSubtitle(): string {
  const items = getAllPosts().filter((p) => p.type !== 'note')
  const earliest = items[items.length - 1]?.date.slice(0, 4) ?? ''
  return `${items.length} posts since ${earliest}`
}

/* Every description below is the page's own subtitle (the .section-label line under its
   title), verbatim — never invented summary copy (2026-07-23). Pages whose
   subtitle is a live stat compute it from the same data the page uses (Archive); pages
   with no subtitle get no second line at all. */
// Core pages: always present.
const CORE_PAGES: SearchItem[] = [
  // Home has no subtitle; its h1 reads "<name> — <tagline>", so the tagline stands in.
  { title: 'Home', href: '/', kind: 'Page', description: site.identity.tagline.replace(/\.$/, '') },
  { title: 'Writing', href: '/writing', kind: 'Page', description: 'Subscribe to the RSS feed, view the archive, or sign up for an occasional email digest' },
  { title: 'About', href: '/about', kind: 'Page', description: 'Who runs this site, what it is built on, and where else to find them' },
  // The first-run guide rides only while the page exists (setupPageVisible).
  ...(setupPageVisible() ? [{ title: 'Setup', href: '/setup', kind: 'Page' as const, keywords: 'first run get started make it mine checklist', description: 'Three ways to make this site yours, and the checklist they share' }] : []),
]

// Module pages: each list rides only while its module is on in site.config.ts.
const MODULE_PAGES: Partial<Record<ModuleId, SearchItem[]>> = {
  archive: [
    { title: 'Archive', href: '/archive', kind: 'Page', keywords: 'posts everything index all writing', description: archiveSubtitle() },
  ],
  designs: [
    // Patents ride as keywords so a patent number or title lands on /designs#patents.
    { title: 'Designs', href: '/designs', kind: 'Page', description: 'Selected design work and case studies', keywords: `patents ${PATENTS.map((p) => `${p.num} ${p.title}`).join(' ')}` },
  ],
  photos: [
    { title: 'Photos', href: '/photos', kind: 'Page', description: 'Photographs, with the camera and settings behind each one' },
  ],
  books: [
    { title: 'Books', href: '/books', kind: 'Page', keywords: 'reading novels fiction non-fiction recommendations', description: 'What is worth reading, and why' },
  ],
  podcasts: [
    { title: 'Podcasts', href: '/podcasts', kind: 'Page', keywords: 'listening shows audio episodes recommendations', description: 'Shows worth a subscription' },
  ],
}

const PAGES: SearchItem[] = [
  ...CORE_PAGES,
  ...MODULE_IDS.filter(moduleEnabled).flatMap((id) => MODULE_PAGES[id] ?? []),
]

/**
 * A flat, serializable index for the ⌘K palette's site-wide search: the pages, every
 * titled writing post, and every design case study. Kept light (title + description +
 * tags, no bodies) so the payload handed to the client stays small — post bodies for the
 * palette's snippet lines come separately from /api/search-index, fetched only on open.
 */
export function getSearchIndex(): SearchItem[] {
  const writing: SearchItem[] = getAllPosts()
    .filter((p): p is typeof p & { title: string } => Boolean(p.title))
    .map((p) => ({
      title: p.title,
      href: `/writing/${p.slug}`,
      kind: 'Writing',
      keywords: (p.tags ?? []).join(' '),
      description: p.excerpt,
    }))

  // Slug words ride as keywords: several studies are known by their slug, not their
  // title ("vibecoded" appears nowhere in the AI-agents study's title/description,
  // so typing "vibe" found nothing — 2026-08-28).
  const designs: SearchItem[] = moduleEnabled('designs')
    ? DESIGNS.map((d) => ({
        title: d.title,
        href: `/designs/${d.slug}`,
        kind: 'Design',
        keywords: d.slug.replace(/-/g, ' '),
        description: d.description,
      }))
    : []

  return [...PAGES, ...designs, ...writing]
}
