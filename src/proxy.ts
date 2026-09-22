import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { labReachable } from '@/lib/site-config'

// Three jobs, each scoped by its own matcher entry so normal page loads never
// invoke this function (Lighthouse: zero added cost to HTML requests):
//
// 1. /lab is a sketchbook: reachable in dev and on preview deployments, never on
//    the production site. The gate must run at request time — VERCEL_ENV does not
//    reach the static prerender, so a build-time layout check cannot enforce it.
// 2. Any GET whose pathname ends in .md is rewritten to the markdown route
//    handler (/api/md), which serves a markdown rendition of the page. Files under
//    /files/ are the one exception: they are real downloads served from public/.
// 3. Content negotiation: a request for a normal URL that explicitly prefers
//    `text/markdown` over `text/html` gets the same markdown rendition. The
//    matcher's `has` clause means browsers (which never send text/markdown)
//    never reach this function.
export const config = {
  matcher: [
    '/lab/:path*',
    '/settings/:path*',
    '/api/settings/:path*',
    '/(.*\\.md)',
    {
      source: '/((?!api|_next).*)',
      has: [{ type: 'header', key: 'accept', value: '(.*text/markdown.*)' }],
    },
  ],
}

// True when the Accept header explicitly lists text/markdown with a quality at
// least as high as text/html (ties break by listing order, so an agent sending
// "text/markdown, text/html" gets markdown while "text/html, text/markdown"
// still gets the page).
function prefersMarkdown(accept: string | null): boolean {
  if (!accept || !accept.toLowerCase().includes('text/markdown')) return false
  type Entry = { q: number; index: number }
  let md: Entry | undefined
  let html: Entry | undefined
  const parts = accept.split(',')
  for (let index = 0; index < parts.length; index++) {
    const [typeRaw, ...params] = parts[index].trim().split(';')
    const type = typeRaw.trim().toLowerCase()
    let q = 1
    for (const param of params) {
      const m = param.trim().match(/^q=(\d(?:\.\d{1,3})?)$/i)
      if (m) q = parseFloat(m[1])
    }
    if (type === 'text/markdown' && (!md || q > md.q)) md = { q, index }
    if ((type === 'text/html' || type === 'application/xhtml+xml') && (!html || q > html.q)) html = { q, index }
  }
  if (!md || md.q === 0) return false
  if (!html) return true
  if (md.q !== html.q) return md.q > html.q
  return md.index < html.index
}

function markdownRewrite(pathname: string, request: NextRequest) {
  // The page path rides as catch-all segments (query params set here would not
  // survive the rewrite into the route handler's params).
  return NextResponse.rewrite(new URL(`/api/md${pathname === '/' ? '' : pathname}`, request.url))
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /settings (and its API) exists only under `next dev`: it writes site.config.ts on disk,
  // which no deployment can do. The page and the route handlers repeat this check; the
  // rewrite here means production never even renders them.
  if (pathname === '/settings' || pathname.startsWith('/settings/') || pathname.startsWith('/api/settings')) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.rewrite(new URL('/settings-gated-404', request.url))
    }
    return NextResponse.next()
  }

  // /lab gate first so .md and Accept variants of /lab pages are gated too.
  if (pathname === '/lab' || pathname.startsWith('/lab/') || pathname.startsWith('/lab.')) {
    // site.config.ts decides: lab off = never; gate 'dev' = local only; gate 'preview' = dev +
    // preview deployments. Production never sees it either way.
    if (!labReachable(process.env.VERCEL_ENV)) {
      // Rewrite to a route that does not exist so the themed root not-found
      // page renders with a 404 status.
      return NextResponse.rewrite(new URL('/lab-gated-404', request.url))
    }
    if (!pathname.endsWith('.md')) return NextResponse.next()
    // dev/preview: fall through so /lab/foo.md reaches the markdown handler.
  }

  if (request.method !== 'GET') return NextResponse.next()

  // (a) explicit .md suffix: /about.md, /writing/some-post.md, /index.md, /.md
  // /files/ is exempt: real markdown FILES live there as downloads (skills,
  // scripts, checklists), and rewriting them to the rendition handler would 404 them.
  if (pathname.endsWith('.md') && !pathname.startsWith('/files/')) {
    let target = pathname.slice(0, -3)
    if (target === '' || target === '/index') target = '/'
    return markdownRewrite(target, request)
  }

  // (b) content negotiation on the original URL. Skip API/internals and any
  // path with a file extension (/feed.xml, /sitemap.xml, images…), which have
  // their own formats.
  if (
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/') &&
    !/\.[a-z0-9]+$/i.test(pathname) &&
    prefersMarkdown(request.headers.get('accept'))
  ) {
    return markdownRewrite(pathname, request)
  }

  return NextResponse.next()
}
