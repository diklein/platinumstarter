import { getFeedItems } from '@/lib/photo-feed'
import { site, siteUrl, absoluteUrl } from '@/lib/site-config'

// JSON Feed 1.1 of every photo on /photos, in the shape Openfeed (openfeed.photo) reads:
// one item per photo, newest first, full-size image, `_photoring` carrying the ring id and
// the camera info card. Statically generated — the build regenerates it from repo files
// whenever a photo lands (Unsplash sync commit or a manual-photos entry); never hand-edited.
export const dynamic = 'force-static'

// The permanent Openfeed identity. `creator` is the handle photos are attributed to in the
// ring — picked once, never change it (Openfeed keys the membership on it). It is the
// Unsplash handle when one is configured (the account the photos come from), else the
// site's host.
const RING = 'openfeed-demo'
const CREATOR = (site.social.unsplash ?? new URL(siteUrl).host).replace(/^@/, '').replace(/^https?:\/\/[^/]+\/@?/, '')

export async function GET() {
  const items = await getFeedItems()

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${site.identity.name} — Photos`,
    home_page_url: absoluteUrl('/photos/'),
    feed_url: absoluteUrl('/photos/feed.json'),
    // All three author fields are required by Openfeed (name, url, avatar). Without a
    // configured portrait the avatar falls back to the site icon so the field stays filled.
    authors: [
      {
        name: site.identity.name,
        url: siteUrl,
        avatar: absoluteUrl(site.identity.portrait ?? '/android-chrome-512x512.png'),
      },
    ],
    _photoring: { ring: RING, creator: CREATOR },
    items: items.map((it) => ({
      id: it.permalink,
      url: it.permalink,
      image: it.image,
      date_published: it.datePublished,
      ...(it.exif ? { _photoring: { exif: it.exif } } : {}),
    })),
  }

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
