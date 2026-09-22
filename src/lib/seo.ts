import type { Metadata } from 'next'
import { site, siteUrl } from '@/lib/site-config'

/**
 * Single source of truth for social metadata.
 *
 * Next.js does NOT deep-merge `openGraph` / `twitter`: the moment a page defines either,
 * it REPLACES the root layout's version wholesale — silently dropping og:site_name,
 * og:locale, og:type and twitter:site / twitter:creator. `pageMetadata()` rebuilds the
 * complete block every time, so those tags can never go missing again. Every non-root
 * page builds its metadata through this helper.
 *
 * The identity values come from site.config.ts (via site-config). `twitter` is the X
 * handle as twitter:site wants it (@-prefixed), or undefined when no X account is set,
 * in which case those two tags are simply omitted.
 */
function twitterHandle(): string | undefined {
  const raw = site.social.x
  if (!raw) return undefined
  const handle = raw.startsWith('http') ? raw.replace(/^https?:\/\/[^/]+\//, '') : raw
  return `@${handle.replace(/^@/, '')}`
}

/** The home page's one-line description: the site description with the location folded in
 *  ("Potter making wheel-thrown stoneware in Ohio."). No location = the
 *  description as written. */
function homeDescription(): string {
  const { description, location } = site.identity
  return location ? `${description.replace(/\.$/, '')} based in ${location}.` : description
}

export const SITE = {
  name: site.identity.name,
  url: siteUrl,
  twitter: twitterHandle(),
  locale: site.identity.locale,
  /** BCP 47 with a hyphen, as `inLanguage` and <html lang> want it. */
  language: site.identity.locale.replace('_', '-'),
  description: homeDescription(),
}

type OgImage = { url: string; width?: number; height?: number }

interface PageMetaInput {
  /** Page <title>. Child segments render "<title> · <site name>" via the root template. */
  title?: string
  description: string
  /** Canonical + og:url path, e.g. "/photos". Omit for the site root. */
  path?: string
  /** og:title / twitter:title. Defaults to "<title> · <site name>" (site name at the root). */
  socialTitle?: string
  /** og:type. "website" everywhere except articles. */
  type?: 'website' | 'article'
  /** Social card image(s). Defaults to the generated /og card for `title`. */
  images?: OgImage[]
  /** twitter:image URL(s). Defaults to the og image URL(s). */
  twitterImages?: string[]
  /** article:published_time (articles only). */
  publishedTime?: string
}

// Match the hand-written card URLs exactly: encode spaces as "+", not "%20".
// The card prints the page's own address on its bottom line, so it needs the path.
/** Bump when the card DESIGN changes: scrapers (X especially) cache image bytes by the
 *  image URL, so a design change must change the URL or feeds keep serving the old card. */
/* v4 (2026-08-31): the package pages' cards seat their product mark in the field. Writing
 * posts keep v=3 in writing/[slug]/page.tsx — their card design is unchanged, and bumping
 * them would re-bust every scraper cache for nothing. */
const OG_CARD_VERSION = 4
function ogCard(title: string, pagePath?: string): OgImage {
  const t = encodeURIComponent(title).replace(/%20/g, '+')
  const p = pagePath ? `&path=${encodeURIComponent(pagePath)}` : ''
  return { url: `/og?title=${t}&type=page${p}&v=${OG_CARD_VERSION}`, width: 1200, height: 630 }
}

export function pageMetadata({
  title,
  description,
  path,
  socialTitle,
  type = 'website',
  images,
  twitterImages,
  publishedTime,
}: PageMetaInput): Metadata {
  // House style: no em dashes in descriptions. Every page is static, so this
  // throws at build time and blocks the deploy rather than shipping one.
  if (description.includes('—')) {
    throw new Error(`SEO description contains an em dash (rewrite with a colon, comma, or parentheses): "${description}"`)
  }
  const social = socialTitle ?? (title ? `${title} · ${SITE.name}` : SITE.name)
  const cards = images ?? [ogCard(title ?? SITE.name, path)]
  const twImages = twitterImages ?? cards.map((c) => c.url)

  return {
    title,
    description,
    alternates: { canonical: path ?? '/' },
    openGraph: {
      type,
      locale: SITE.locale,
      siteName: SITE.name,
      url: path ? `${SITE.url}${path}` : SITE.url,
      title: social,
      description,
      images: cards,
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      ...(SITE.twitter ? { site: SITE.twitter, creator: SITE.twitter } : {}),
      title: social,
      description,
      images: twImages,
    },
  }
}

// ---- Structured data (JSON-LD) ----

/**
 * Publisher entity shared by article + case-study schema. Google's Article rich result
 * requires publisher.logo, so it points at the 512×512 site icon.
 */
export const PUBLISHER = {
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.url,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE.url}/android-chrome-512x512.png`,
    width: 512,
    height: 512,
  },
} as const

/** Author entity shared by article + case-study schema. */
export const AUTHOR = {
  '@type': 'Person',
  name: SITE.name,
  url: `${SITE.url}/about`,
} as const

/** BreadcrumbList from a trail of { name, path } crumbs (path relative to the site root). */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${SITE.url}${crumb.path}`,
    })),
  }
}
