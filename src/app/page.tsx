import { pageMetadata, AUTHOR, SITE } from '@/lib/seo'
import { HeroBlock } from '@/components/home/hero-block'
import { HomeGrid } from '@/components/home/home-grid'
import { SiteLayout } from '@/components/layout/site-layout'
import { getAllPosts } from '@/lib/posts'
import { JsonLd } from '@/components/seo/json-ld'
import { site } from '@/lib/site-config'

// Identity from site.config.ts. SITE.description is the description with the location
// folded in ("<description> based in <location>."); the social card carries the hero's
// intro sentence, the same words the page opens with.
const NAME = SITE.name
const TAGLINE = site.identity.tagline
const OG_TITLE = encodeURIComponent(site.identity.intro).replace(/%20/g, '+')

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: NAME,
  url: SITE.url,
  description: SITE.description,
  inLanguage: SITE.language,
  author: AUTHOR,
}

export const metadata = pageMetadata({
  title: NAME,
  socialTitle: NAME,
  description: SITE.description,
  path: '/',
  images: [{ url: `/og?title=${OG_TITLE}`, width: 1200, height: 630 }],
})

// How many titled posts the grid's `latestPost` cell lists.
const LATEST_POSTS = 4

export default function HomePage() {
  const latestPosts = getAllPosts().filter((p) => Boolean(p.title)).slice(0, LATEST_POSTS)

  return (
    <SiteLayout>
      <div className="px-6 md:px-12 min-h-[100dvh] flex flex-col">
        <JsonLd data={websiteSchema} />
        <h1 className="sr-only">{NAME} — {TAGLINE.replace(/\.$/, '')}</h1>{/* convention: em-dash (name separator) */}
        {/* Hero-only for now. To bring back the pulsing beacon backdrop: add `relative` to this
            grid, render <HeroBeacon /> as its first child, and give HeroBlock `relative z-10`.
            Both backdrops are kept ready — the beacon at src/components/home/hero-beacon.tsx and
            the <NowColumn /> rail at src/components/home/now-column.tsx. */}
        <div className="grid grid-cols-12 gap-x-6">
          <HeroBlock className="col-span-12 md:col-span-9" />
        </div>
        {/* preset 'minimal' is the hero alone; otherwise the grid renders whichever
            `site.home.grid` cells have a module and data behind them. */}
        {site.home.preset !== 'minimal' && <HomeGrid posts={latestPosts} />}
      </div>
    </SiteLayout>
  )
}
