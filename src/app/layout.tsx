import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Providers } from './providers'
import { SkipToContent } from '@/components/layout/skip-to-content'
import { SiteHeader } from '@/components/layout/site-header'
import { CommandMenu } from '@/components/command-menu'
import { GridOverlay } from '@/components/layout/grid-overlay'
import { SpeculationRules } from '@/components/perf/speculation-rules'
import { VercelBeacons } from '@/components/vercel-beacons'
import { site, siteUrl, absoluteUrl } from '@/lib/site-config'
import { SITE } from '@/lib/seo'
import './globals.css'

// Preloads Geist-Variable only: the upright face, one ~70KB woff2 carrying the whole
// 100 to 900 weight axis. Body copy (400) and every heading weight (400/500/600) come out of
// this single file, so one preload covers every LCP text candidate and the browser never
// fetches a second upright file. The scale still tops out at semibold 600 (audited
// 2026-07-10; the lone font-bold was redistributed to 600) even though the axis goes higher.
// 'swap' (not 'optional'): preload + optional extends Chrome's block period to ~3s, holding
// text invisible until the font arrives. swap lets text paint immediately with system-ui,
// then swaps in Geist once the preloaded file arrives.
// declarations overrides the auto-generated font-family to a stable 'Geist' name so the
// italic face below joins the same family and weight/style-based selection works.
// globals.css sets --font-sans: 'Geist' to connect Tailwind's font-sans utility to this name.
const geistBody = localFont({
  src: '../../public/fonts/Geist-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-sans-trigger',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [{ prop: 'font-family', value: "'Geist'" }],
})

// The italic face (Geist ships a true italic since 1.5, also variable 100 to 900): no
// preload, loaded on demand after LCP the first time an <em> renders.
const geistItalic = localFont({
  src: '../../public/fonts/Geist-Italic-Variable.woff2',
  weight: '100 900',
  style: 'italic',
  variable: '--font-sans-italic-trigger',
  // 'fallback': ~100ms block then system fallback, with a ~3s swap window. 'optional' never
  // swapped after the block period, so a cold cache rendered the fallback for the whole visit
  // (a reload "fixed" it). fallback swaps once the file lands, and still gives up on very
  // slow connections instead of janking late.
  display: 'fallback',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'font-family', value: "'Geist'" }],
})

const geistMono = localFont({
  src: '../../public/fonts/GeistMono-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-mono-trigger',
  display: 'fallback',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'font-family', value: "'Geist Mono'" }],
})

export const viewport: Viewport = {
  // Defaults only — they key on the OS scheme, so ThemeToggle retunes both metas (same two
  // colors) whenever next-themes resolves a theme, and the photo lightboxes pin their own
  // meta while open. Change these values in ThemeToggle too.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: site.brand.themeColor.light },
    { media: '(prefers-color-scheme: dark)', color: site.brand.themeColor.dark },
  ],
  // Draw edge-to-edge under the notch and the (translucent, iOS 26 "Liquid Glass") toolbars.
  // Required for two things: it activates the `env(safe-area-inset-*)` values the layout already
  // relies on (e.g. the lightbox rail's bottom padding), and it lets a full-screen fixed overlay
  // actually paint UNDER the toolbar — without it, content stops at the safe-area boundary and the
  // page shows through the gap behind Safari's bar.
  viewportFit: 'cover',
}

// The identity here is site.config.ts, resolved through @/lib/site-config. The title
// template's separator is load-bearing: the command palette strips " — <name>" off
// document.title to build its mailto subject, so change both together.
const NAME = site.identity.name
// The metadata description: `identity.description` (falls back to the tagline in the schema).
const DESCRIPTION = site.identity.description

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: NAME, template: `%s · ${NAME}` }, // the middle dot is the site's separator (date · reading time); no em dashes anywhere
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon.svg?v=2', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // No `manifest` entry: src/app/manifest.ts (Next's convention) links itself.
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/',
    ...(site.publishing.rss ? { types: { 'application/rss+xml': absoluteUrl('/feed.xml') } } : {}),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: NAME,
  },
  openGraph: {
    type: 'website',
    locale: site.identity.locale,
    url: siteUrl,
    siteName: NAME,
    title: NAME,
    description: DESCRIPTION,
    images: [{ url: `/og?title=${encodeURIComponent(NAME).replace(/%20/g, '+')}&type=site&v=3`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    ...(SITE.twitter ? { site: SITE.twitter, creator: SITE.twitter } : {}),
    title: NAME,
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang={site.identity.lang}
      className={`${geistBody.variable} ${geistItalic.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" />
        {/* brand.accent from site.config.ts: one color for both themes, laid over the house
            red in globals.css. */}
        {site.brand.accent && (
          <style
            dangerouslySetInnerHTML={{
              __html: `:root,.dark{--color-accent:${site.brand.accent};--color-accent-fill:${site.brand.accent}}`,
            }}
          />
        )}
        {/* Stamp data-browser="safari" during parse, before anything paints. Lives HERE
            (not in the component that consumes it) because React does not execute
            inline <script>s it client-renders: a SPA navigation once mounted a page's own
            detector as inert markup, so Safari visitors saw the wrong frame until a hard
            refresh. The attribute set on a hard load of ANY page
            survives every client-side navigation after it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var ua=navigator.userAgent;if(/Safari\\//.test(ua)&&!/Chrom|Edg|CriOS|OPR/.test(ua)){document.documentElement.setAttribute('data-browser','safari')}})()",
          }}
        />
        <SpeculationRules />
      </head>
      <body>
        <SkipToContent />
        <Providers>
          <SiteHeader />
          {/* Shell only — the palette code + search index lazy-load on first intent. */}
          <CommandMenu />
          <GridOverlay />
          {/* No <main> here: SiteLayout owns the single <main id="main-content"> (and
              not-found brings its own), so the footer can sit OUTSIDE it — contentinfo
              nested inside main isn't a top-level landmark. Lab sketches render their own
              plain <main> (footerless by design, gated from prod). */}
          {children}
        </Providers>
        {process.env.VERCEL && <VercelBeacons />}
        {/* Animation inspector, dev only — the component no-ops (and its chunk is dead
            code) outside development. */}
      </body>
    </html>
  )
}
