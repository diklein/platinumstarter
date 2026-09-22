import { absoluteUrl } from '@/lib/site-config'

// robots.txt, generated so the sitemap and llms.txt lines carry the configured origin.
// A route handler rather than Next's robots.ts convention because the comment lines
// (the AI-crawler pointer and the .md hint) have no seat in MetadataRoute.Robots.
export const dynamic = 'force-static'

export function GET() {
  const body = [
    'User-agent: *',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
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
