import type { TocItem } from '@/lib/posts'
import { TableOfContents } from './table-of-contents'

/* toc: scroll — the ToC rail for pages that open with a full-width hero (the element
 * marked [data-toc-gate]). The rail is always visible but anchors at row 3, the first
 * body row past the hero, so its top aligns with the intro paragraph instead of
 * overlapping the hero. (This replaced a scroll-gated show/hide variant — the choice was
 * the simpler always-on placement, 2026-08-26.) */
export function ScrollGatedToc({ toc }: { toc: TocItem[] }) {
  return (
    <div style={{ display: 'contents' }} className="toc-below-hero">
      {/* Styles ride WITH the component (BeaconLab's pattern), not globals.css — this
          rule is single-consumer behavior, and Turbopack's stale-globals bug ate the
          globals version silently. */}
      {/* Anchor the rail at row 3, not the nav's default row 1: a row-1 start makes
          the grid inflate the header row to help fit the nav's height, opening a
          ~144px hole between the h1 and the hero. From row 3 the tall body rows
          absorb it and the sticky pin still travels the rest of the article.
          !important because the nav carries its default row as an inline style. */}
      <style>{`
        .toc-below-hero > nav {
          grid-row: 3 / span 100 !important;
        }
      `}</style>
      <TableOfContents toc={toc} />
    </div>
  )
}
