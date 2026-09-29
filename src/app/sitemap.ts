import type { MetadataRoute } from 'next'
import { getAllPosts, getHashtagCounts } from '@/lib/posts'
import { DESIGNS } from '@/lib/designs'
import { siteUrl, moduleEnabled, MODULE_META, type ModuleId } from '@/lib/site-config'

const BASE = siteUrl

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

// Module index pages, listed only while the module is on. The lab is deliberately absent: it is gated.
const MODULE_ROUTES: Partial<Record<ModuleId, { changeFrequency: Freq; priority: number }>> = {
  archive: { changeFrequency: 'weekly', priority: 0.5 },
  photos: { changeFrequency: 'monthly', priority: 0.5 },
  designs: { changeFrequency: 'yearly', priority: 0.5 },
  books: { changeFrequency: 'yearly', priority: 0.5 },
  podcasts: { changeFrequency: 'yearly', priority: 0.5 },
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/writing`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
  ]

  const moduleRoutes: MetadataRoute.Sitemap = (Object.keys(MODULE_ROUTES) as ModuleId[])
    .filter(moduleEnabled)
    .map((id) => ({ url: `${BASE}${MODULE_META[id].href}`, lastModified: new Date(), ...MODULE_ROUTES[id]! }))

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${BASE}/writing/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const designRoutes: MetadataRoute.Sitemap = moduleEnabled('designs')
    ? DESIGNS.map((design) => ({
        url: `${BASE}/designs/${design.slug}`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.7,
      }))
    : []

  const tagRoutes: MetadataRoute.Sitemap = moduleEnabled('hashtags')
    ? Object.keys(getHashtagCounts()).map((tag) => ({
        // encodeURIComponent keeps the XML valid: a raw & in a tag is an unterminated
        // entity to a parser, and it matches every in-site tag link.
        url: `${BASE}/hashtags/${encodeURIComponent(tag)}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.4,
      }))
    : []

  return [...staticRoutes, ...moduleRoutes, ...postRoutes, ...designRoutes, ...tagRoutes]
}
