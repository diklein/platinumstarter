import createMDX from '@next/mdx'
import siteConfig from './site.config.ts'
import syncedPhotos from './src/lib/synced-photos.json' with { type: 'json' }
import { photoRemoteHosts } from './src/lib/photo-hosts.ts'
import { MODULE_META } from './src/lib/site-config-schema.ts'

// Remote image hosts, derived from the configured photo sources plus the hosts the synced
// records actually use (media CDNs the services pick themselves). Feeds next/image's
// remotePatterns and the CSP img-src below, so no host is hardcoded per service here.
const photoHosts = photoRemoteHosts(siteConfig.photos.sources, syncedPhotos)

// The site's canonical origin, resolved once here and inlined into both bundles as
// NEXT_PUBLIC_SITE_URL (see `env` below), so the server and the browser agree. Order: an
// explicit NEXT_PUBLIC_SITE_URL, then identity.url from site.config.ts, then the Vercel
// project's production domain (the custom domain once attached, the .vercel.app one before;
// a Deploy-button site gets its URL this way before anyone edits a file), then localhost.
// Node 24 strips the .ts import's types natively; no build step is involved.
const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  siteConfig.identity.url ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
).replace(/\/$/, '')

// The origins remark-self-links folds into site-relative hrefs: the resolved one plus the
// canonical one from site.config.ts when an author wrote that into posts and it differs.
const selfOrigins = [...new Set([siteUrl, siteConfig.identity.url].filter(Boolean))]

// Content-Security-Policy tuned to the site's real sources:
// - self-hosted next/font, next/image (self), the synced photo hosts (photoHosts) + data: blur
// - Vercel Analytics / Speed Insights beacons (self-proxied + vercel-insights)
// - youtube-nocookie, for an embedded video in a post
// 'unsafe-inline' is required because this is a static/SSG site with no nonce
// middleware (Next injects inline hydration/theme scripts). The policy still adds
// real defense-in-depth: object-src none, base-uri/form-action self, a frame-src
// allowlist, and origin-restricted connect/img/font. A nonce-based strict CSP is
// a future upgrade if strict script control is ever needed.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${photoHosts.map((host) => `https://${host}`).join(' ')}`,
  "font-src 'self'",
  "media-src 'self' https: data:",
  "connect-src 'self' https://*.vercel-insights.com https://vitals.vercel-analytics.com",
  "frame-src 'self' https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
]

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  // Analysis builds write to their own dist dir so they can run while `next dev`
  // holds .next, and carry browser source maps so source-map-explorer can attribute
  // chunk bytes to modules (Turbopack has no webpack analyzer plugin). Both are
  // no-ops for normal dev/prod builds — never set these in Vercel env.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  productionBrowserSourceMaps: process.env.ANALYZE_MAPS === '1',
  // React Compiler (stable in this Next line): auto-memoizes every component, cutting
  // re-render work on the interactive pages without hand-written useMemo/useCallback.
  // Enabled 2026-08-28, the day the hooks lint hit zero findings — the compiler skips
  // (or miscompiles) components that violate those rules, so zero findings is the
  // precondition. The experimental Turbopack-Rust port only changes BUILD speed; the
  // stable Babel implementation is the reference one, so we stay on it.
  env: {
    NEXT_PUBLIC_SITE_URL: siteUrl,
    // The UTC day this build ran. Posts dated after it were hidden as scheduled; the daily
    // cron (/api/cron/scheduled-posts) compares against it to know when one has come due.
    // PLATINUM_TODAY is the test override, see todayUtc() in src/lib/posts.ts.
    PLATINUM_BUILD_DATE: process.env.PLATINUM_TODAY || new Date().toISOString().slice(0, 10),
  },
  reactCompiler: true,
  // Dev-only floating button (bottom-left), off: it photobombs screenshots of the site.
  devIndicators: false,
  // photo-feed.ts fs-reads original photo files for EXIF, which made the file tracer bundle
  // public/ (562MB — over Vercel's 250MB function limit) into the feed + photo-page
  // functions. Those reads happen at BUILD time only (both routes are fully static), so the
  // deployed functions never need the files.
  // No function ships public/ — the CDN serves those files, and every fs read of public/
  // in app code happens at BUILD time on static routes (photo EXIF for the feed, the MDX
  // img component's bezelDims). Without this, the tracer bundled all 565MB of public/ into
  // EVERY MDX-rendering function the moment bezelDims appeared (designs/[slug] first,
  // then every other MDX route — 2026-08-04). Global exclude instead of per-route whack-a-mole;
  // the one RUNTIME reader, /og, gets its fonts back via the include below.
  // KEY FORMAT MATTERS: keys are picomatch globs — a literal '[slug]' is a CHARACTER
  // CLASS that never matches, and '/*' stops at one segment; the pair below covers both
  // top-level and nested routes.
  outputFileTracingExcludes: {
    '/*': ['./public/**'],
    '/**': ['./public/**'],
  },
  outputFileTracingIncludes: {
    '/og': ['./public/fonts/**'],
  },
  experimental: {
    // Inline the page's CSS into the HTML instead of a render-blocking <link>.
    // The 30KB stylesheet round-trip held throttled-mobile paint to a blank
    // screen for ~2.5s (PSI, 2026-07-27); inlining removes the fetch entirely.
    // Experimental flag: validated by a local Lighthouse A/B before shipping.
    inlineCss: true,
    // Guarantee lucide-react (the only icon barrel) is tree-shaken to per-icon
    // imports. Next already includes it in its built-in optimize list; this pins
    // the behavior so it survives config/version churn.
    optimizePackageImports: ['lucide-react'],
    // Client router cache TTL for static pages, up from the 5-minute default.
    // Past the TTL, a header click pays a full RSC refetch before anything
    // changes on screen (~400ms measured against production, 2026-08-25) —
    // the intermittent "slow click" between nav links. 30 minutes keeps every
    // visited/prefetched route click-instant for a whole reading session; the
    // site publishes at most daily, so half-hour-stale page segments in a
    // long-lived tab are an acceptable trade. Shared layouts never refetch on
    // navigation either way — this only governs the page segment.
    staleTimes: { static: 1800 },
  },
  async rewrites() {
    // The production first-run state. A Deploy-button site is live before anyone has edited a
    // file; while setup.completed is false, production serves /setup-needed for every page
    // instead of the template's demo. Decided here at build time from the same flag the
    // Setup page reads, so it costs nothing at request time and the push that completes
    // setup rebuilds without it. Development and preview keep the demo (that is where the
    // owner works). Assets, the API, the social-card route, and the feeds stay reachable.
    // PLATINUM_DEMO=1 in a project's environment keeps the demo on production: that is the
    // deployment the marketplace listing links to as the live demo.
    const firstRun = !siteConfig.setup?.completed && process.env.VERCEL_ENV === 'production' && !process.env.PLATINUM_DEMO
    const beforeFiles = []
    if (firstRun) {
      beforeFiles.push({
        source: '/((?!setup-needed|_next/|api/|og(?:$|\\?)|feed\\.xml|sitemap\\.xml|robots\\.txt|llms\\.txt|manifest\\.webmanifest|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|woff2?|ttf|otf|css|js|json|xml|txt|webmanifest)$).*)',
        destination: '/setup-needed',
      })
    }
    // A module that is off answers 404 at its URL, whether or not its folder is still on disk:
    // the nav, palette, sitemap, and home grid already drop it, and this closes the route
    // itself. Decided at build time from site.config.ts; a rewrite to a path that does not
    // exist renders the themed not-found page. The lab has its own gate in src/proxy.ts.
    for (const [id, meta] of Object.entries(MODULE_META)) {
      if (id === 'lab' || siteConfig.modules?.[id] !== false) continue
      beforeFiles.push({ source: meta.href, destination: '/module-off-404' }, { source: `${meta.href}/:path*`, destination: '/module-off-404' })
    }
    return { beforeFiles }
  },
  async redirects() {
    // Legacy URLs from a previous home for your writing go here, one row per old path:
    //   { source: '/old-path', destination: '/writing/new-slug', permanent: true },
    // Percent-encode non-ASCII characters in `source` (the router matches the encoded
    // request path). The importers in scripts/import/ print the rows an import implies.
    return []
  },
  async headers() {
    // Production only. In local dev these headers break Safari: HSTS locks the
    // browser to HTTPS on localhost (Safari, unlike Chrome, has no localhost
    // exemption), and CSP `upgrade-insecure-requests` rewrites http asset
    // requests to https — which the TLS-less dev server can't serve, so CSS/JS
    // silently fail to load and the page renders unstyled.
    if (process.env.NODE_ENV !== 'production') return []
    return [
      { source: '/(.*)', headers: securityHeaders },
      // Social-card renders are fetch targets for scrapers, not pages: noindex keeps the
      // ~28 /og?slug=… URLs Search Console reports as "crawled - currently not indexed"
      // out of Google's queue entirely. Scrapers (FB/X) don't read X-Robots-Tag, so
      // link previews are unaffected.
      { source: '/og', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ]
  },
  images: {
    // Production serves AVIF (smaller than WebP, and the reason the site scores what it does).
    // LOCAL DEV SKIPS IT, and that is what stops `next dev` from running out of memory.
    //
    // The site has 54 source images over 1MB, some of them 12-18MB. To resize one, Next unpacks
    // the whole photo into raw pixels first — a 17MB JPEG becomes ~100MB in memory — then
    // re-encodes it once per format, at several widths. AVIF is by far the most expensive
    // encoder. In dev there is no prebuilt cache, so this happens live, over and over, and the
    // server climbed past 8GB and died. Dropping AVIF in dev halves the encodes and removes the
    // costly one. Production output is completely unchanged.
    //
    // The real fix is upstream: those 12-18MB source photos should be a few hundred KB. Nobody
    // ever sees that detail, and shrinking them speeds up the live site too.
    formats: process.env.NODE_ENV === 'production'
      ? ['image/avif', 'image/webp']
      : ['image/webp'],
    // Hold each optimized variant in the CDN cache far longer so repeat visitors reuse it
    // instead of re-hitting the optimizer. Safe here: images live at stable paths and are
    // cache-busted by a fresh URL whenever a photo actually changes (see the carousel images).
    minimumCacheTTL: 2678400, // 31 days
    // One pattern per photo host (see photoHosts above): images.unsplash.com always, plus
    // whatever site.photos.sources and the synced records bring in.
    remotePatterns: photoHosts.map((hostname) => ({ protocol: 'https', hostname, pathname: '/**' })),
  },
}

const withMDX = createMDX({
  options: {
    // remark-unwrap-images: markdown puts an image in a paragraph, so `![a](x)` compiles to
    // <p><figure>...</figure></p>. That is INVALID HTML — the browser's parser hoists the figure
    // OUT of the <p>, so the server HTML renders the figure as a direct grid child and the
    // col-* grid-column applies (correct, wide). React then hydrates, rebuilds the DOM to match
    // its own tree with the figure back INSIDE the <p>, the parent is no longer a grid, the
    // grid-column stops applying, and the image snaps to the narrower prose column. That is the
    // "loads at 6 columns, jumps to 4" on /writing/deer-valley. Unwrapping image-only paragraphs
    // removes the invalid nesting entirely, so the server and client trees agree.
    // remark-self-links: absolute links to this site's own origin compile to relative
    // hrefs, so the branded self-link CSS (a[href^="/"]) catches them without knowing
    // the domain. See the plugin's header comment.
    remarkPlugins: [
      'remark-frontmatter',
      'remark-gfm',
      'remark-smartypants',
      'remark-unwrap-images',
      new URL('./src/lib/remark/remark-amazon-product.mjs', import.meta.url).pathname,
      [new URL('./src/lib/remark/remark-self-links.mjs', import.meta.url).pathname, { origins: selfOrigins }],
    ],
    rehypePlugins: [
      'rehype-slug',
      ['rehype-autolink-headings', { behavior: 'wrap' }],
      // min-light/min-dark over the github pair (2026-08-30): mostly grayscale ink with one
      // restrained blue — far closer to the house's quiet palette than GitHub's purple/red/green.
      ['rehype-pretty-code', { theme: { light: 'min-light', dark: 'min-dark' } }],
    ],
  },
})

export default withMDX(nextConfig)
