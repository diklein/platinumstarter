import type { Metadata } from 'next'
import { SiteFooter } from '@/components/layout/site-footer'
import { NotFoundBackground } from '@/components/not-found-background'
import { ClickOrTap } from '@/components/click-or-tap'

export const metadata: Metadata = {
  title: '404',
  description: 'This page has moved, been renamed, or never existed in the first place.',
  robots: { index: false, follow: false },
}

const TEXT_COL = 'col-prose' // the reading column every real page uses

export default function NotFound() {
  return (
    <div className="relative flex flex-col min-h-[calc(100dvh-3rem)]">
      <NotFoundBackground />
      {/* This page bypasses SiteLayout, so it carries its own <main id="main-content">
          (skip-link target) with the footer outside it, matching the site-wide structure. */}
      <main id="main-content" className="flex-1 px-6 md:px-12 pt-36 pb-32 grid grid-cols-12 gap-x-6 content-start">
        <div className={`${TEXT_COL}`}>
          <h1
            className="font-sans font-normal leading-none text-foreground mb-10"
            style={{ fontSize: 'clamp(5rem, 12vw, 9rem)' }}
          >
            404
          </h1>
          <p className="font-sans text-prose leading-prose tracking-[-0.01em] text-foreground mb-10">
            This page has moved, been renamed, or never existed in the first place.
            Everything worth reading is still one <ClickOrTap /> away.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
