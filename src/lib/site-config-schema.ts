/**
 * The site configuration SCHEMA: types, defaults, and `defineConfig`.
 *
 * This module has no imports on purpose: the root `site.config.ts` imports it, and
 * `src/lib/site-config.ts` imports the root config. Keeping the schema import-free breaks the
 * cycle, so `DEFAULTS` is always initialised before `defineConfig` runs.
 *
 * The site configuration contract.
 *
 * `site.config.ts` at the repo root is the ONE file a site owner edits (by hand, through the
 * dev-only /settings page, or by asking an agent). Everything identity-shaped in the codebase
 * reads from here: metadata, feeds, OG cards, the header wordmark, the footer byline, the social
 * row, navigation, and the module registry that decides which routes exist.
 *
 * Three rules keep it honest:
 *   1. Every field has a default. An EMPTY config (`defineConfig({})`) must build and render a
 *      site that looks intentional (the zero-configuration doctrine). Optional input that is
 *      absent makes its feature disappear cleanly; nothing renders a blank seat.
 *   2. No taste knobs. Spacing, the type scale, motion, and shadows are the design system, not
 *      settings. If a knob would let a user make the site worse, it does not belong here.
 *   3. Consumers import `site` from '@/lib/site-config' (never the root file directly), so the
 *      defaults are always merged in. Scripts (Node) import the root file with a `.ts`
 *      specifier; Node 24 strips types natively.
 */

// ---------------------------------------------------------------------------------------------
// Module registry
// ---------------------------------------------------------------------------------------------

/**
 * Every optional route group is a module. `core` routes (home, about, writing, feeds, OG,
 * search, sitemap) always exist. Toggling a module off hides it everywhere it is registered
 * (nav, palette rows, search index, sitemap, home grid cells); deleting its folder is the
 * agent's job and the build must still pass ("delete-folder-still-builds").
 */
export const MODULE_IDS = [
  'designs',
  'photos',
  'books',
  'podcasts',
  'archive',
  'hashtags',
  'lab',
] as const

export type ModuleId = (typeof MODULE_IDS)[number]

/** Static facts about each module: where it lives and what it is called by default. */
export const MODULE_META: Record<ModuleId, { href: string; label: string; dir: string }> = {
  designs:       { href: '/designs',        label: 'Designs',        dir: 'src/app/designs' },
  photos:        { href: '/photos',         label: 'Photos',         dir: 'src/app/photos' },
  books:         { href: '/books',          label: 'Books',          dir: 'src/app/books' },
  podcasts:      { href: '/podcasts',       label: 'Podcasts',       dir: 'src/app/podcasts' },
  archive:       { href: '/archive',        label: 'Archive',        dir: 'src/app/archive' },
  hashtags:      { href: '/hashtags',       label: 'Hashtags',       dir: 'src/app/hashtags' },
  lab:           { href: '/lab',            label: 'Lab',            dir: 'src/app/lab' },
}

// ---------------------------------------------------------------------------------------------
// Social networks
// ---------------------------------------------------------------------------------------------

/** Networks the footer row and the About directory know how to draw. Order here is the default
 *  render order; `social.order` in the config overrides it. Only networks with a value render. */
export const SOCIAL_NETWORKS = [
  'instagram',
  'linkedin',
  'threads',
  'bluesky',
  'x',
  'mastodon',
  'buttondown',
  'unsplash',
  'youtube',
  'github',
] as const

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

/** How a bare handle becomes a profile URL. Full URLs in the config are passed through. */
export const SOCIAL_URL: Record<SocialNetwork, (handle: string) => string> = {
  instagram:  (h) => `https://instagram.com/${h}`,
  linkedin:   (h) => `https://linkedin.com/in/${h}`,
  threads:    (h) => `https://threads.net/@${h}`,
  bluesky:    (h) => `https://bsky.app/profile/${h}`,
  x:          (h) => `https://x.com/${h}`,
  mastodon:   (h) => h, // needs the full instance URL; a bare handle has no home
  buttondown: (h) => `https://buttondown.com/${h}`,
  unsplash:   (h) => `https://unsplash.com/@${h}`,
  youtube:    (h) => `https://youtube.com/@${h}`,
  github:     (h) => `https://github.com/${h}`,
}

// ---------------------------------------------------------------------------------------------
// Photo sources
// ---------------------------------------------------------------------------------------------

/**
 * One remote photo service the sync (`scripts/fetch-photos.mjs`) reads. Each kind has an
 * adapter in `scripts/photo-sources/<kind>.mjs` that returns the same photo record the site
 * renders, so sources combine freely. Only the public identifiers live here; credentials are
 * env vars (see `photos.sources` below).
 */
export type PhotoSource =
  /** Unsplash profile. `user` defaults to `social.unsplash`. Needs UNSPLASH_ACCESS_KEY. */
  | { kind: 'unsplash'; user?: string }
  /** Glass public profile (glass.photo/<profile>), read from its RSS feed. No key. */
  | { kind: 'glass'; profile: string }
  /** Pixelfed account: `instance` is the host (pixelfed.social), `user` the handle. Public
   *  accounts need no token; PIXELFED_TOKEN unlocks the Mastodon-compatible API path. */
  | { kind: 'pixelfed'; instance: string; user: string }
  /** Self-hosted Immich at `url`; `album` is an album name or id (absent = whole timeline).
   *  Needs IMMICH_API_KEY; the sync provisions a public shared link so browsers can load
   *  the images. */
  | { kind: 'immich'; url: string; album?: string }
  /** Self-hosted PhotoPrism at `url`; `album` is an album name or UID (absent = every
   *  public photo). PHOTOPRISM_TOKEN (an app password) is needed unless the instance is public. */
  | { kind: 'photoprism'; url: string; album?: string }

export type PhotoSourceKind = PhotoSource['kind']

/** Display names, for "View on <Service>" links and the settings UI. */
export const PHOTO_SOURCE_LABELS: Record<PhotoSourceKind, string> = {
  unsplash: 'Unsplash',
  glass: 'Glass',
  pixelfed: 'Pixelfed',
  immich: 'Immich',
  photoprism: 'PhotoPrism',
}

// ---------------------------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------------------------

/** The onboarding checklist, in the order the setup skill drives it. */
export const SETUP_STEPS = ['identity', 'shape', 'brand', 'content', 'ship'] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

export interface SiteConfigInput {
  /** First-run state. `completed: false` keeps the Setup page (/setup) and its nav entry, in dev and preview and on a demo deployment; a production site that is not set up shows /setup-needed instead.
   *  `steps` is the onboarding checklist the setup skill, the /settings wizard, and hand-editing
   *  all share (see docs/onboarding.md); a step is flipped when its config is written. */
  setup?: { completed?: boolean; steps?: Partial<Record<SetupStep, boolean>> }

  identity?: {
    /** The site's name and the author's byline. The header wordmark, <title> template,
     *  og:site_name, JSON-LD Person/Organization. */
    name?: string
    /** One line under the name: "UX designer, photographer, and writer." No em dashes. */
    tagline?: string
    /** Longer description for metadata and the home hero. Falls back to `tagline`. */
    description?: string
    /** One paragraph in the author's voice for the home hero and the About lede
     *  ("Jane designs software and photographs cities."). Falls back to `tagline`. */
    intro?: string
    /** Canonical origin, no trailing slash. Leave it unset on Vercel: the build reads the
     *  project's production domain (VERCEL_PROJECT_PRODUCTION_URL, the custom domain once one
     *  is attached, the .vercel.app one before). Set it only to pin a different host or when
     *  hosting elsewhere. NEXT_PUBLIC_SITE_URL overrides both at runtime. */
    url?: string
    /** BCP 47 with underscore, as og:locale wants it. */
    locale?: string
    /** <html lang>. */
    lang?: string
    /** Reply-to for "Reply via email" links, the palette's email command, like notifications.
     *  Absent = those affordances do not render. */
    email?: string
    /** Path under /public. Absent = no portrait anywhere (hero, feeds). */
    portrait?: string
    /** Free-text location for the About header and JSON-LD. */
    location?: string
  }

  brand?: {
    /** 'wordmark' renders the name as text. A path under /public renders that SVG/PNG.
     *  The template ships its own mark and the wordmark as the no-mark fallback. */
    mark?: 'wordmark' | 'starter' | `/${string}`
    /** Single accent color as an OKLCH string; the accent-fill derives from it by APCA. */
    accent?: string
    /** <meta name="theme-color"> pair. ThemeToggle and the lightboxes read the same values. */
    themeColor?: { light?: string; dark?: string }
  }

  /** Handles (or full URLs) per network. Only filled networks render, in `order`. */
  social?: Partial<Record<SocialNetwork, string>> & {
    order?: SocialNetwork[]
    /** Show the RSS mark at the end of the row. Default true when the writing feed exists. */
    rss?: boolean
  }

  header?: {
    /** Search affordance in the header: a magnifier that opens the palette, or none. */
    search?: 'none' | 'icon'
    themeToggle?: boolean
    /** Default theme when the visitor has no stored preference. */
    defaultTheme?: 'system' | 'light' | 'dark'
  }

  /** Ordered nav. Module ids resolve to their default href/label; objects are custom links;
   *  'setup' is the first-run Setup page, shown only until setup is complete.
   *  Modules that are toggled off are dropped even if listed. 'writing' and 'about' are core. */
  nav?: Array<ModuleId | 'setup' | 'writing' | 'about' | { href: string; label: string }>

  footer?: {
    /** The byline sentence. Absent = the footer renders without one. */
    byline?: string
    /** Where the byline links, in the footer's quiet link style. Absent = plain text. */
    bylineHref?: string
    /** Show "vX.Y.Z · updated N days ago". */
    version?: boolean
    lastUpdated?: boolean
  }

  /** Module toggles. Off = hidden from nav/palette/search/sitemap/home. Missing folder + off = builds. */
  modules?: Partial<Record<Exclude<ModuleId, 'lab'>, boolean>> & {
    /** The lab is a gated sketchbook: 'preview' = dev + preview deployments (default), 'dev' = local only. */
    lab?: false | { gate: 'preview' | 'dev' }
  }

  home?: {
    /** Grid cells under the hero, in order. Cells whose module is off, or whose data is absent,
     *  self-disable: reading and now need `books`, photos needs `photos` and at least one
     *  photo, calendar needs GITHUB_TOKEN. */
    grid?: Array<'latestPost' | 'reading' | 'now' | 'photos' | 'social' | 'calendar'>
    /** 'minimal' = hero only. */
    preset?: 'default' | 'minimal'
  }

  /** Content locations relative to the repo root. Loaders AND convention checks read these. */
  sources?: {
    writing?: string
    designs?: string
    images?: string
    photos?: string
    /** Obsidian vault name for obsidian:// edit links (dev-only affordance). */
    obsidianVault?: string
  }

  photos?: {
    /** The sentence under the Photos title (also its meta description). */
    description?: string
    /** @deprecated Use `sources`. Kept for one release: 'unsplash' and 'both' become
     *  `[{ kind: 'unsplash' }]`; 'local' is the same as leaving `sources` empty. */
    source?: 'local' | 'unsplash' | 'both'
    /** Remote services `scripts/fetch-photos.mjs` syncs into `src/lib/synced-photos.json`,
     *  merged with the local photos folder (which always renders). Empty = local only.
     *  Keys never live here: UNSPLASH_ACCESS_KEY, PIXELFED_TOKEN (optional), IMMICH_API_KEY,
     *  PHOTOPRISM_TOKEN go in .env.local. See docs/photo-sources.md. */
    sources?: PhotoSource[]
    altText?: boolean
    exif?: boolean
    attribution?: boolean
  }

  writing?: {
    /** The sentence under the Writing index title (also its meta description). */
    description?: string
    /** 'titled' hides untitled notes from the index; 'notes' shows them as short posts. */
    postTypes?: 'titled' | 'notes'
    /** Render a "Reply via email" link under posts (needs `identity.email`). */
    replyByEmail?: boolean
  }

  publishing?: {
    rss?: boolean
    /** Like buttons on posts (needs DATABASE_URL). */
    likes?: boolean
    /** Amazon Associates tag appended to ProductCard links built from an ASIN. Absent = plain
     *  Amazon links. */
    amazonAffiliateTag?: string
  }

  /** AI-assisted publishing. Each feature is a script the author runs; all of them go through
   *  scripts/lib/ai.mjs, which needs the chosen provider's key in env. */
  intelligence?: {
    /** Who answers: 'anthropic' (ANTHROPIC_API_KEY, the default), 'openai' (OPENAI_API_KEY),
     *  or 'gateway' (Vercel AI Gateway, AI_GATEWAY_API_KEY, any model behind one key). */
    provider?: 'anthropic' | 'openai' | 'gateway'
    /** Per-tier model id overrides. 'fast' does alt text, captions, and bulk work; 'capable'
     *  does SEO, review, and enrichment. Absent = the provider's defaults in scripts/lib/ai.mjs. */
    models?: { fast?: string; capable?: string }
    altText?: boolean
    seo?: boolean
    review?: boolean
  }

  code?: {
    /** Shiki theme pair. 'house' = the template's own tokens. */
    theme?: 'house' | { light: string; dark: string }
    lineNumbers?: boolean
  }

  palette?: {
    /** The rotating tips strip under the ⌘K input. */
    tips?: boolean
    /** Maximum results per section. */
    resultCount?: number
  }

  advanced?: {
    jsonLd?: boolean
    /** Instant theme swap everywhere; the circular wipe stays Chromium-only regardless. */
    themeTransition?: 'wipe' | 'instant'
  }
}

// ---------------------------------------------------------------------------------------------
// Defaults + resolved type
// ---------------------------------------------------------------------------------------------

/** The starter's own identity: what an untouched clone renders as (a labelled demo). */
export const DEFAULTS = {
  setup: {
    completed: false,
    steps: { identity: false, shape: false, brand: false, content: false, ship: false } as Record<SetupStep, boolean>,
  },
  identity: {
    name: 'Platinum',
    tagline: 'A personal site you publish to with a git push.',
    description: 'A personal site you publish to with a git push.',
    intro: 'A personal site you publish to with a git push.',
    url: undefined as string | undefined,
    locale: 'en_US',
    lang: 'en',
    email: undefined as string | undefined,
    portrait: undefined as string | undefined,
    location: undefined as string | undefined,
  },
  brand: {
    mark: 'starter' as 'wordmark' | 'starter' | `/${string}`,
    accent: undefined as string | undefined,
    themeColor: { light: '#ffffff', dark: '#26272f' },
  },
  social: {
    order: [...SOCIAL_NETWORKS] as SocialNetwork[],
    rss: true,
  } as Partial<Record<SocialNetwork, string>> & { order: SocialNetwork[]; rss: boolean },
  header: {
    search: 'icon' as 'none' | 'icon',
    themeToggle: true,
    defaultTheme: 'system' as 'system' | 'light' | 'dark',
  },
  nav: ['setup', 'writing', 'photos', 'about'] as Array<
    ModuleId | 'setup' | 'writing' | 'about' | { href: string; label: string }
  >,
  footer: {
    byline: undefined as string | undefined,
    bylineHref: undefined as string | undefined,
    version: true,
    lastUpdated: true,
  },
  modules: {
    designs: false,
    photos: true,
    books: false,
    podcasts: false,
    archive: false,
    hashtags: false,
    lab: { gate: 'preview' } as false | { gate: 'preview' | 'dev' },
  },
  home: {
    grid: ['latestPost', 'photos', 'social'] as Array<
      'latestPost' | 'reading' | 'now' | 'photos' | 'social' | 'calendar'
    >,
    preset: 'default' as 'default' | 'minimal',
  },
  sources: {
    writing: 'src/content/writing',
    designs: 'src/content/designs',
    images: 'public/images',
    photos: 'public/images/photos',
    obsidianVault: undefined as string | undefined,
  },
  photos: {
    description: 'Photographs, with the camera and settings behind each one.',
    sources: [] as PhotoSource[],
    altText: true,
    exif: true,
    attribution: true,
  },
  writing: {
    description: 'Posts, most recent first.',
    postTypes: 'titled' as 'titled' | 'notes',
    replyByEmail: true,
  },
  publishing: {
    rss: true,
    likes: false,
    amazonAffiliateTag: undefined as string | undefined,
  },
  intelligence: {
    provider: 'anthropic' as 'anthropic' | 'openai' | 'gateway',
    models: {} as { fast?: string; capable?: string },
    altText: true,
    seo: true,
    review: true,
  },
  code: {
    theme: 'house' as 'house' | { light: string; dark: string },
    lineNumbers: true,
  },
  palette: {
    tips: true,
    resultCount: 8,
  },
  advanced: {
    jsonLd: true,
    themeTransition: 'wipe' as 'wipe' | 'instant',
  },
}

export type SiteConfig = typeof DEFAULTS

function mergeSection<T extends object>(base: T, input: Partial<T> | undefined): T {
  if (!input) return base
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

/**
 * Identity function with defaults: the root config calls this so hand-edits get types, and
 * every consumer sees a fully-populated object.
 */
export function defineConfig(input: SiteConfigInput = {}): SiteConfig {
  const identity = mergeSection(DEFAULTS.identity, input.identity)
  if (!input.identity?.description && input.identity?.tagline) identity.description = input.identity.tagline
  if (!input.identity?.intro && input.identity?.tagline) identity.intro = input.identity.tagline
  const { themeColor, ...brandRest } = input.brand ?? {}
  // photos.source is a deprecated alias for photos.sources (one release, then it goes):
  // 'unsplash' and 'both' meant "sync the account in social.unsplash", which is now the
  // single-entry list. An explicit `sources` always wins over the alias.
  const { source: legacyPhotoSource, ...photosRest } = input.photos ?? {}
  const photos = mergeSection(DEFAULTS.photos, photosRest)
  if (!input.photos?.sources && (legacyPhotoSource === 'unsplash' || legacyPhotoSource === 'both')) {
    photos.sources = [{ kind: 'unsplash' }]
  }
  return {
    setup: {
      completed: input.setup?.completed ?? DEFAULTS.setup.completed,
      steps: mergeSection(DEFAULTS.setup.steps, input.setup?.steps),
    },
    identity,
    brand: {
      ...mergeSection(DEFAULTS.brand, brandRest),
      themeColor: mergeSection(DEFAULTS.brand.themeColor, themeColor),
    },
    social: mergeSection(DEFAULTS.social, input.social),
    header: mergeSection(DEFAULTS.header, input.header),
    nav: input.nav ?? DEFAULTS.nav,
    footer: mergeSection(DEFAULTS.footer, input.footer),
    modules: mergeSection(DEFAULTS.modules, input.modules),
    home: mergeSection(DEFAULTS.home, input.home),
    sources: mergeSection(DEFAULTS.sources, input.sources),
    photos,
    writing: mergeSection(DEFAULTS.writing, input.writing),
    publishing: mergeSection(DEFAULTS.publishing, input.publishing),
    intelligence: mergeSection(DEFAULTS.intelligence, input.intelligence),
    code: mergeSection(DEFAULTS.code, input.code),
    palette: mergeSection(DEFAULTS.palette, input.palette),
    advanced: mergeSection(DEFAULTS.advanced, input.advanced),
  }
}
