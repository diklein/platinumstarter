import { BookOpen } from 'lucide-react'
import type { TocItem } from '@/lib/posts'
import { TocClient } from './toc-client'
import { MobileToc } from './mobile-toc'

interface Props {
  toc: TocItem[]
}

// Prepended so both the desktop sidebar and mobile sheet start with an "Intro" item
// that's active at the top of the page and scrolls back there when tapped (slug "").
const INTRO: TocItem = { depth: 2, text: 'Intro', slug: '' }

export function TableOfContents({ toc }: Props) {
  if (toc.length === 0) return null
  const items = [INTRO, ...toc]
  return (
    <>
      <nav
        aria-label="Table of contents"
        style={{ gridRow: '1 / span 100' }}
        // p-4 -m-4: the page background extends 16px beyond the TOC on every side while the
        // content stays exactly on the grid — so when full-bleed media (the /dkmediaviewer
        // demo grid) flows under this column, the TOC sits on a quiet plate instead of
        // reading against photos, with clear air before the background ends. The padding
        // also absorbs the heading's book icon 4px left overhang (it centers on the dot
        // column) that overflow-y-auto would otherwise clip. z-10 paints the plate above
        // full-span siblings; top/max-h are 1rem less than the content's 9rem clearance
        // because the sticky offset now positions the padded box, not the text.
        className="ghost-scroll hidden md:block col-start-10 col-span-3 xl:col-start-11 xl:col-span-2 self-start sticky top-32 -mt-5 z-10 max-h-[calc(100vh-8rem)] overflow-y-auto bg-background p-4 -m-4"
      >
        {/* The small book ties this heading to the header's BookOpen trigger (site-header.tsx).
            strokeWidth 2.7 at 14px draws the same ~1.6px line as the header's 2.1 at 18px.
            Alignment shares the entries' geometry (6px dot + gap-2.5 → text at x=16): -ml-1
            centers the 14px book on the traveling dot's x=3, and mr-1.5 lands "Contents" at
            x=16, flush with the entry text below. */}
        <h2 className="mb-4 flex items-center font-sans text-label font-semibold text-foreground">
          <BookOpen aria-hidden="true" size={14} strokeWidth={2.7} className="-ml-1 mr-1.5 shrink-0" />
          Contents
        </h2>
        <TocClient toc={items} />
      </nav>

      {/* Mobile/tablet: floating pill → bottom sheet (desktop sidebar is xl-only). */}
      <MobileToc toc={items} />
    </>
  )
}
