'use client'

import { useRef, useSyncExternalStore } from 'react'
import Image from 'next/image'
import type { UnsplashPhoto } from '@/lib/unsplash-photos'

// One formatter + a permanent cache for the alt-less photos' aria-label dates:
// toLocaleDateString with an options bag builds a fresh Intl.DateTimeFormat per
// call, ~70 times per grid render — and the grid re-renders when numCols flips
// after hydration. timeZone stays pinned (see the aria-label comment below).
const MONTH_YEAR_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthYearCache = new Map<string, string>()

function monthYear(iso: string): string {
  let formatted = monthYearCache.get(iso)
  if (formatted === undefined) {
    formatted = MONTH_YEAR_FMT.format(new Date(iso))
    monthYearCache.set(iso, formatted)
  }
  return formatted
}

function colorToBlurDataURL(hex: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='${hex}'/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/* Direct-Unsplash responsive loader. The grid used to hardcode every thumbnail to the
 * snapshot's w=1080 fm=jpg URL (unoptimized next/image = no srcset), so a 390px phone
 * cold-loaded 54 full-width JPEGs — 9.1MB and a 25s throttled LCP (slow-network audit,
 * 2026-08-23). Routing the SAME direct-Unsplash URL through a loader lets next/image
 * emit a real srcset: phones pick ~640w, desktop stays ~1080w, and fm=jpg becomes
 * auto=format so Unsplash serves avif/webp (the 64% saving the lightbox hi-res layer
 * already gets). Still zero optimizer-proxy involvement, and the lightbox hi-res
 * expression (w=2048 + auto=format) is untouched — the hover prefetch and lightbox
 * stay byte-identical to each other. */
const unsplashLoader = ({ src, width }: { src: string; width: number }) =>
  // Cap at 1080: a DPR-3 phone otherwise asks for w=1200 (390px x 3), and 2.77x is
  // already beyond visible density for a contact-sheet thumb. 1080 also keeps the
  // desktop 3-col retina pick unchanged.
  src.replace(/([&?])w=\d+/, `$1w=${Math.min(width, 1080)}`).replace('fm=jpg', 'auto=format')

const COLS_SM = '(max-width: 639px)'
const COLS_MD = '(max-width: 1023px)'

function subscribeCols(onChange: () => void) {
  const sm = window.matchMedia(COLS_SM)
  const md = window.matchMedia(COLS_MD)
  sm.addEventListener('change', onChange)
  md.addEventListener('change', onChange)
  return () => {
    sm.removeEventListener('change', onChange)
    md.removeEventListener('change', onChange)
  }
}

/** 1, 2, or 3 columns for the current viewport (never 0: that is the server's "unmeasured"). */
function readCols(): number {
  if (window.matchMedia(COLS_SM).matches) return 1
  if (window.matchMedia(COLS_MD).matches) return 2
  return 3
}

export function PhotosGrid({ photos }: { photos: UnsplashPhoto[] }) {
  // The column count is read from the viewport as an external store (the same shape as
  // useIsMobile): no mount effect, no extra render after hydration. The server snapshot is 0,
  // "not measured yet": SSR + hydration paint a 1-col grid, which is correct for the LIKELIEST
  // slow client (starting at 3 meant phones painted 3 columns and reflowed to 1 when JS landed,
  // a whole-grid 0.15 CLS on a throttled load, audit 2026-08-23). Desktop takes the flip instead,
  // and CURTAINS the grid until it is measured (see photos-cols-pending below), so the
  // pre-hydration single column never paints as a full-width first image.
  const measuredCols = useSyncExternalStore(subscribeCols, readCols, () => 0)
  const colsSettled = measuredCols !== 0
  const numCols = measuredCols || 1
  const prefetched = useRef<Set<string>>(new Set())

  // Warm the hi-res layer on hover/focus so it is already downloading by the time the
  // lightbox opens. Prefetch the direct Unsplash URL (identical to the lightbox hiResUrl
  // expression) so the browser cache hit is guaranteed — bypassing the image optimizer
  // proxy means no cold-cache stall after a deploy. auto=format lets Unsplash serve
  // avif/webp where supported (64% smaller, curl-verified 2026-07-08). Local/manual
  // photos (urls.regular starts with '/') get a static asset prefetch, which is harmless.
  const prefetchHiRes = (photo: UnsplashPhoto) => {
    if (prefetched.current.has(photo.id)) return
    prefetched.current.add(photo.id)
    const hi = photo.urls.regular.replace(/([&?])w=\d+/, '$1w=2048').replace('fm=jpg', 'auto=format')
    const img = new window.Image()
    img.src = hi
  }

  if (photos.length === 0) {
    return (
      <p className="col-span-12 md:col-start-3 md:col-span-8 section-label">
        No photos yet. Add files to the photos folder, or a source to <code>photos.sources</code> and run <code>node scripts/fetch-photos.mjs</code>
      </p>
    )
  }

  const columns: Array<Array<{ photo: UnsplashPhoto; originalIndex: number }>> =
    Array.from({ length: numCols }, () => [])
  photos.forEach((photo, i) => columns[i % numCols].push({ photo, originalIndex: i }))

  return (
    // Tight 8px gaps, deliberately NOT aligned to the page grid (tried 24px grid-aligned
    // gutters 2026-08-21, chose the denser contact-sheet look instead).
    //
    // The DESKTOP CURTAIN (photos-cols-pending): ≥640px, the still-1-col grid is
    // visibility-hidden with its height capped until the media-query effect settles the
    // real count — a brief quiet area beats painting the wrong layout. visibility (not
    // display) keeps the <img> elements loading behind the curtain, so the reveal paints
    // with warm images; the height cap keeps 190 full-width photos from minting a
    // page-length scrollbar for the duration. Phones never enter the hidden state.
    // The <style> rides the component (not globals.css) — single consumer, and
    // Turbopack's stale-globals bug has eaten new globals rules twice this week.
    <div className={`col-span-12 flex gap-2${colsSettled ? '' : ' photos-cols-pending'}`}>
      {!colsSettled && (
        <>
          <style>{`
            @media (min-width: 640px) {
              .photos-cols-pending { visibility: hidden; max-height: 100vh; overflow: hidden; }
            }
          `}</style>
          {/* Without JS nothing ever lifts the curtain — a no-JS visitor gets the
              working 1-col grid instead of a hidden page. */}
          <noscript>
            <style>{`.photos-cols-pending { visibility: visible; max-height: none; overflow: visible; }`}</style>
          </noscript>
        </>
      )}
      {columns.map((colItems, colIndex) => (
        // min-w-0: children's intrinsic widths (incl. content-visibility remembered
        // sizes) must never hold a column wider than its flex share of the viewport.
        // container-type: the per-item contain-intrinsic-height below is written in cqw,
        // so each column is its items' size container. inline-size containment only —
        // the column's own height stays content-driven.
        <div key={colIndex} className="flex-1 min-w-0 flex flex-col gap-2" style={{ containerType: 'inline-size' }}>
          {colItems.map(({ photo, originalIndex }) => (
            <button
              key={photo.id}
              onMouseEnter={() => prefetchHiRes(photo)}
              onFocus={() => prefetchHiRes(photo)}
              data-photo-index={originalIndex}
              data-photo-id={photo.id}
              data-photo-url={photo.urls.regular}
              data-photo-alt={photo.alt_description ?? ''}
              data-photo-description={photo.description ?? ''}
              data-photo-color={photo.color}
              data-photo-width={photo.width}
              data-photo-height={photo.height}
              data-photo-exif={JSON.stringify(photo.exif)}
              // No focus-visible override: the global :focus-visible recipe (globals.css) gives
              // keyboard users the standard accent ring — the old focus-visible:outline-none
              // opted the grid out and left them tabbing blind.
              className="cv-auto block w-full cursor-zoom-in group"
              // Exact placeholder height for content-visibility: the class's generic
              // 320px estimate shifted the mobile grid 0.151 CLS when real aspect
              // ratios rendered in (audit 2026-08-23). 100cqw x the photo's own ratio
              // IS the rendered height at any column width; `auto` still lets the
              // browser remember the real size after first render. Browsers without
              // cqw ignore the declaration and keep the class fallback.
              style={{ containIntrinsicHeight: `auto calc(100cqw * ${(photo.height / photo.width).toFixed(4)})` }}
              // Photos with no alt at source (the recent Unsplash batch) used to collapse into
              // dozens of identical "Open photo" buttons; the capture date at least makes each
              // row distinguishable in a screen-reader list.
              aria-label={
                photo.alt_description ??
                photo.description ??
                (photo.created_at
                  // timeZone pinned: the label is SSR'd, and a server/client zone mismatch
                  // around midnight would flip the month and break hydration.
                  ? `Open photo from ${monthYear(photo.created_at)}`
                  : `Open photo ${originalIndex + 1}`)
              }
            >
              <Image
                src={photo.urls.regular}
                alt={photo.alt_description ?? photo.description ?? ''}
                width={photo.width}
                height={photo.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="img-outline w-full h-auto transition-opacity duration-200 group-hover:opacity-85"
                // Column-aware eager loading: ~3 rows are visible per column, so 1-col
                // mobile keeps the original 3 priority images (bandwidth-safe on the
                // SSR/hydration path, where numCols is still 1) while a 3-col desktop
                // eagerly fetches the 9 it actually shows above the fold. Lazy-loading
                // those 6 cost ~half a second of blur-to-sharp swap after every
                // client-side nav to /photos (measured on production, 2026-08-25).
                priority={originalIndex < numCols * 3}
                // Remote (Unsplash): the responsive loader above — real srcset, direct
                // URLs, no optimizer proxy. Local/manual photos keep the default
                // next/image optimizer exactly as before.
                {...(photo.urls.regular.startsWith('/') ? {} : { loader: unsplashLoader })}
                placeholder="blur"
                blurDataURL={colorToBlurDataURL(photo.color)}
              />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
