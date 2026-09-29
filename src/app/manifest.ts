import type { MetadataRoute } from 'next'
import { site, shortName } from '@/lib/site-config'

// The web app manifest, generated from site.config.ts (Next's manifest.ts convention: it
// serves at /manifest.webmanifest and the root layout links it automatically). The icons are
// files `npm run icons` generates from the mark; the maskable one keeps its art inside the
// 40% safe circle so Android can crop it to any shape. iOS 26 opens every Home Screen site as
// a web app, so `standalone` is the display that matches what visitors get anyway.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: site.identity.name,
    short_name: shortName(),
    description: site.identity.description,
    lang: site.identity.lang,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    theme_color: site.brand.themeColor.light,
    background_color: site.brand.themeColor.light,
  }
}
