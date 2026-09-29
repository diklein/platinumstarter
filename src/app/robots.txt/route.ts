import { absoluteUrl, site } from '@/lib/site-config'

// robots.txt, generated so the sitemap and llms.txt lines carry the configured origin.
// A route handler rather than Next's robots.ts convention because the comment lines
// (the AI-crawler pointer and the .md hint) have no seat in MetadataRoute.Robots.
export const dynamic = 'force-static'

export function GET() {
  // Hidden from search (publishing.hideFromSearch): crawling stays allowed so crawlers read
  // every page's noindex, and the sitemap line goes so nothing is advertised.
  const hidden = site.publishing.hideFromSearch
  const body = [
    'User-agent: *',
    '',
    ...(hidden ? ['# This site asks search engines not to index it (noindex on every page).'] : [`Sitemap: ${absoluteUrl('/sitemap.xml')}`]),
    `# AI crawlers: ${absoluteUrl('/llms.txt')}`,
    `# Markdown: append .md to any page URL (or send Accept: text/markdown) for a markdown version, e.g. ${absoluteUrl('/about.md')}`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
