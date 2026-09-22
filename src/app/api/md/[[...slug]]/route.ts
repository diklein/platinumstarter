import { renderMarkdownForPath } from '@/lib/markdown-pages'

/**
 * Markdown variants of the site's pages. Reached only through the proxy
 * (src/proxy.ts), which rewrites `GET /<page>.md` and `Accept: text/markdown`
 * requests to /api/md/<page>. Everything is built from repo files (MDX sources
 * and the same data modules the pages render from), so responses are
 * CDN-cacheable; `Vary: Accept` keeps the negotiated variant from ever being
 * confused with the HTML page at the same URL.
 */

export async function GET(_request: Request, ctx: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await ctx.params
  const path = `/${(slug ?? []).join('/')}`
  const { body, status } = renderMarkdownForPath(path)
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'Cache-Control':
        status === 200
          ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
          : 'public, max-age=0, s-maxage=300',
    },
  })
}
