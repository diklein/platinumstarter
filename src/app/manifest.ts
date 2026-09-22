import type { MetadataRoute } from 'next'
import { site } from '@/lib/site-config'

// The web app manifest, generated from site.config.ts (Next's manifest.ts convention: it
// serves at /manifest.webmanifest and the root layout links it automatically). The icons
// are the fixed set under /public; only the name, description, and colors are identity.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.identity.name,
    short_name: site.identity.name,
    description: site.identity.tagline,
    start_url: '/',
    scope: '/',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: site.brand.themeColor.light,
    background_color: site.brand.themeColor.light,
    display: 'browser',
  }
}
