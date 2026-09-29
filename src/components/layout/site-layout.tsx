import { SiteFooter } from './site-footer'

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // This wrapper owns the single <main id="main-content"> (the root layout renders none),
    // so the footer sits OUTSIDE it as a sibling — a contentinfo nested inside <main> is not
    // a top-level landmark. The sticky-footer flex is unchanged: main takes the old flex-1
    // div's place, and neither element carried any other layout.
    <div className="flex flex-col min-h-[calc(100dvh-3rem)]">
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
