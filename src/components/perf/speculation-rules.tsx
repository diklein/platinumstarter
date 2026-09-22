// Site-wide Speculation Rules (Chrome/Edge). A single static <script type="speculationrules">
// that tells the browser to PREFETCH the document for any same-origin link the reader shows
// intent on — a ~200ms hover or a pointerdown ('moderate' eagerness) — so a full-page navigation
// lands on bytes already in hand. This is prefetch, not prerender: only the destination's HTML is
// fetched, none of its code runs, so there are no double-execution side effects to guard. It
// augments next/link (which prefetches the RSC data for client navigations) by also covering hard
// navigations — a reload, a new tab, an opened-in-background link, a cold arrival.
//
// The rule is a plain inline script, not next/script: the type is inert, so browsers that don't
// speak Speculation Rules ignore it and every other browser is unaffected. It ships in the static
// HTML with zero client JS and no Lighthouse cost. CSP already allows it via script-src
// 'unsafe-inline'.
//
// document source + href_matches '/*' resolves against the page's own origin, so cross-origin
// links never match — same-origin only, for free. The exclusions keep it off routes that
// shouldn't be warmed: /api (data endpoints), /lab (gated, 404s in production), and any link a
// page opts out with rel=external, target=_blank, download, or data-no-prefetch.
const RULES = {
  prefetch: [
    {
      source: 'document',
      eagerness: 'moderate',
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: '/api/*' } },
          { not: { href_matches: '/lab/*' } },
          {
            not: {
              selector_matches: '[rel~=external], [target=_blank], [download], [data-no-prefetch]',
            },
          },
        ],
      },
    },
  ],
}

export function SpeculationRules() {
  return (
    <script
      type="speculationrules"
      // Minified: the rule ships in every page's HTML, so keep it to the byte.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(RULES) }}
    />
  )
}
