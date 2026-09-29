import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { site, siteUrl } from '@/lib/site-config'

export const runtime = 'nodejs'

// The bare host printed on the card's address line ("example.com").
const HOST = new URL(siteUrl).host

/* The Unfurl card (proposal F from /lab/og-cards): the site's page-card design at OG size.
   Title column on the left, the mark on its own surface field to the right, and the page's
   real address on the bottom line beside a small mark. An unfurl IS its address, which is
   why this card prints one where the earlier design did not.

   Two constraints from Satori, both non-negotiable and both documented in CLAUDE.md:
   fonts must be ttf/otf/woff (the page fonts are woff2, so the card reads its own static
   Geist ttf pair from public/fonts), and there is no Grid and no float, so every box here
   is flex + absolute.

   Colors are the LIGHT values of the real tokens, written as hex: the card is always light
   (it renders outside the page, so a var() would have nothing to follow) and an image file
   cannot hold an oklch(). Keep them in step with globals.css. */
const PAPER = '#ffffff' //  --color-bg
const INK = '#070a0c' //    --color-fg
const SURFACE = '#e8ecef' // --color-surface  (the mark's field)
const BORDER = '#d4d8db' //  --color-border   (the field's hairline)
const ACCENT = '#d70000' // --color-accent (light, oklch(0.51 0.27 27) gamut-mapped) — the mark's LED. Off the page the mark is the BRAND (site-mark.tsx's rule), so the LED is red here, never the header's you-are-here grey.
const ADDRESS_MUTE = 'rgba(0,0,0,0.45)' // the domain, quieter than the path it precedes

/* The mark, built from divs rather than an <svg>: Satori's SVG support is partial, and an
   outlined rectangle is a border, a line is a thin div, a dot is a border-radius. Geometry is
   site-mark.tsx's 64-unit drawing: the tower outline 22x46 at (16,8), the bay 10x36 at (38,18),
   two drive slots, the bay's shelf, the power button, and the LED, all at stroke 4. The
   drawing's ink bounds are x 14..50, y 6..56, so it is shifted by (0, +1) to sit centered. */
function Mark({ size }: { size: number }) {
  const u = (n: number) => (n / 64) * size
  const dy = u(1)
  const outline = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: u(x - 2),
    top: u(y - 2) + dy,
    width: u(w + 4),
    height: u(h + 4),
    border: `${u(4)}px solid ${INK}`,
  })
  const line = (x1: number, x2: number, y: number) => ({
    position: 'absolute' as const,
    left: u(x1),
    top: u(y - 2) + dy,
    width: u(x2 - x1),
    height: u(4),
    backgroundColor: INK,
  })
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
      <div style={outline(16, 8, 22, 46)} />
      <div style={outline(38, 18, 10, 36)} />
      <div style={line(20, 34, 16)} />
      <div style={line(20, 34, 24)} />
      <div style={line(16, 38, 38)} />
      <div style={{ position: 'absolute', left: u(41.5), top: u(41.5) + dy, width: u(3), height: u(3), borderRadius: u(3), backgroundColor: INK }} />
      <div style={{ position: 'absolute', left: u(24), top: u(42) + dy, width: u(6), height: u(6), borderRadius: u(6), backgroundColor: ACCENT }} />
    </div>
  )
}

// Hoisted: the route is dynamic (reads searchParams), so a handler-scoped read
// would pull ~250KB of font data off disk on every card request. Kicked off at
// module load, shared by every request in the instance. Static ttf instances, not the
// variable woff2 the page uses: Satori takes no woff2 and no variable axes.
const FONTS = Promise.all([
  readFile(path.join(process.cwd(), 'public/fonts/Geist-Medium.ttf')),
  readFile(path.join(process.cwd(), 'public/fonts/Geist-SemiBold.ttf')),
])

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const title = searchParams.get('title') ?? site.identity.name
  // The address under the title. Pages pass their own path; the site root prints bare.
  const pagePath = searchParams.get('path') ?? ''

  const [geistMedium, geistSemiBold] = await FONTS

  // Size by estimated WRAPPED HEIGHT, not raw length: the old character tiers let a
  // mid-length title (55 chars → 96px → five wrapped lines) run straight over the
  // address line. For each ladder step, estimate chars-per-line from a ~0.56em average
  // advance at this tracking (Inter SemiBold's figure; Geist SemiBold measures ~0.51em, so
  // 0.56 stays as a deliberate over-estimate that can only pick a smaller size), derive the
  // line count, and take the largest size whose block clears the address with breathing room.
  const TITLE_W = 716
  const TITLE_TOP = 72
  const ADDRESS_TOP = 630 - 64 - 30 // the address line's top edge
  const HEIGHT_BUDGET = ADDRESS_TOP - 28 - TITLE_TOP // 28px of guaranteed air above it
  const estHeight = (fs: number) => {
    const charsPerLine = Math.max(1, Math.floor(TITLE_W / (fs * 0.56)))
    return Math.ceil(title.length / charsPerLine) * fs * 1.05
  }
  // 96 caps the ladder: short titles used to win 150px and shout; long ones still step down.
  const fontSize = [96, 76, 64, 56, 48].find((fs) => estHeight(fs) <= HEIGHT_BUDGET) ?? 48
  // Belt and suspenders: even a pathological title (estimation is an estimate) gets
  // clamped to the lines that fit, ending in an ellipsis, rather than touching the address.
  const maxLines = Math.max(1, Math.floor(HEIGHT_BUDGET / (fontSize * 1.05)))

  // Satori implements no `text-overflow`, so an over-long address does not get an ellipsis:
  // it is chopped mid-glyph at the clip edge, which looks like a bug rather than a feed
  // truncating a URL. Cut it here instead. 34 characters is what fits beside "example.com"
  // in the 640px the address line has at 30px Geist.
  const shownPath = pagePath.length > 34 ? `${pagePath.slice(0, 33)}…` : pagePath

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: '100%',
          height: '100%',
          backgroundColor: PAPER,
          fontFamily: 'Geist, sans-serif',
        }}
      >
        {/* The mark's field: a hairline-separated panel on the right, the same gesture as
            the page card's right panel. */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 340,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: SURFACE,
            borderLeft: `1px solid ${BORDER}`,
          }}
        >
          <Mark size={190} />
        </div>

        {/* Title */}
        <div
          style={{
            display: 'block',
            position: 'absolute',
            left: 72,
            top: TITLE_TOP,
            width: TITLE_W,
            fontSize,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: INK,
            lineClamp: maxLines,
          }}
        >
          {title}
        </div>

        {/* Address line: the site's host + the page's path. No mark here — the field to the right
            already carries it, and a second one beside the address only repeats itself. Long
            slugs end in an ellipsis, the way every feed truncates an address. */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: 72,
            bottom: 64,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            color: INK,
          }}
        >
          <span style={{ color: ADDRESS_MUTE }}>{HOST}</span>
          <span>{shownPath}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Geist', data: geistMedium, weight: 500, style: 'normal' },
        { name: 'Geist', data: geistSemiBold, weight: 600, style: 'normal' },
      ],
    }
  )
}
