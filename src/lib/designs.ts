export interface Design {
  slug: string
  title: string
  description: string
  year: string
  role: string
  company: string
  image?: string
  /** The hero file's real pixel dimensions (sips-measured) — cards must reserve the true
   *  aspect box or the grid shifts as heroes decode. Video heroes size via aspectFor instead. */
  imageWidth?: number
  imageHeight?: number
  passwordProtected?: boolean
  imageBlurred?: boolean
  /** Drafts lane, mirroring writing's: a draft renders at its real URL in dev and
   *  is absent from production entirely — the /designs list, the route (lookup and
   *  static params both miss, so the URL 404s), the sitemap, and the search index
   *  all consume the filtered DESIGNS export below. */
  draft?: boolean
  /** Template example content: the entry (and its MDX, which also carries `example: true`
   *  in its frontmatter) is removed by `npm run clear-examples`. Real studies never set it. */
  example?: boolean
}

// One entry per case study, matching an MDX file of the same slug in src/content/designs/.
// The two below are the template's example studies for a fictional product; replace them
// with your own (or run `npm run clear-examples` to start from an empty list).
const ALL_DESIGNS: Design[] = [
  {
    slug: 'ridge-capture',
    title: 'Ridge capture. One tap, and the note is yours.',
    description: 'An example case study for Ridge, a fictional notes app for the outdoors. Capture saves before you look up: one tap opens it, one tap keeps it, and the place, the time, and the weather are already there. Everything here is invented to show the template.',
    year: '2026',
    role: 'Designer',
    company: 'Ridge (fictional)',
    image: '/images/designs/example-capture-hero.png',
    imageWidth: 2500,
    imageHeight: 1600,
    example: true,
  },
  {
    slug: 'ridge-sync',
    title: 'Ridge sync. Three words for where a note is.',
    description: 'An example case study with a video hero. Every note in Ridge is on this device, sending, or everywhere. Three states, one place they appear, and words chosen so a lost signal never reads as lost work.',
    year: '2026',
    role: 'Designer',
    company: 'Ridge (fictional)',
    image: '/images/designs/example-sync-hero.mp4',
    example: true,
  },
]

// The published view. Evaluated at build time: `next build` runs with NODE_ENV
// production, so drafts never enter the prod bundle, its prerendered pages, the
// sitemap, or search-index.json — while `next dev` shows everything.
export const DESIGNS: Design[] =
  process.env.NODE_ENV === 'production' ? ALL_DESIGNS.filter((d) => !d.draft) : ALL_DESIGNS

// Granted patents and published applications, newest first — rendered on /designs and
// folded into the search index so a patent number or title finds the page. Empty on the
// template; add `{ num: 'US0000000B2', title: '…' }` entries as `num` on patents.google.com.
export const PATENTS: ReadonlyArray<{ num: string; title: string }> = []
