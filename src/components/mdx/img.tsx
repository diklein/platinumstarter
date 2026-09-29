import { Fragment } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ImgModal } from './img-modal'

const FULL_COL = 'col-span-12'
const TEXT_COL = 'col-media'
const WIDE_COL = 'col-media'
const PORTRAIT_COL = 'col-portrait'

function renderCaption(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (m) return <a key={i} href={m[2]} className="underline" target="_blank" rel="noopener noreferrer">{m[1]}<span className="sr-only"> (opens in new tab)</span></a>
    return <Fragment key={i}>{part}</Fragment>
  })
}

interface ImgProps {
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  title?: string
}

// title supports layout variants and an optional caption via pipe syntax:
//   "portrait"            → portrait layout, no caption
//   "portrait|My caption" → portrait layout + caption
//   "|My caption"         → default layout + caption
//   "My caption"          → if not a layout keyword, treated as caption with default layout
//
// defaultFull=true  → no title means full bleed
// defaultFull=false → no title means 800px centered (writing)
// Converts Obsidian-friendly relative paths back to web-root paths at render time.
// e.g. ../../../public/images/foo.png → /images/foo.png
function normalizeSrc(src: string): string {
  const match = src.match(/public\/images\/(.+)$/)
  if (match) return `/images/${match[1]}`
  return src
}

// Intrinsic pixels sniffed from the file's header bytes (this is a Server Component), so
// dimensionless markdown images reserve their REAL box instead of the 1200x800 fallback —
// a 3:2 guess on a portrait or square image mis-reserved the space and shifted layout when
// the true ratio arrived. Read once per src per server lifetime.
function parseDims(buf: Buffer): { w: number; h: number } | null {
  // PNG — IHDR sits at a fixed offset
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  // GIF — logical screen descriptor
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  // JPEG — walk the markers to the first SOFn (C4/C8/CC are DHT/JPG/DAC, not frames)
  if (buf.readUInt16BE(0) === 0xffd8) {
    let off = 2
    while (off + 9 < buf.length && buf[off] === 0xff) {
      const marker = buf[off + 1]
      if (marker === 0xff) { off++; continue } // fill byte
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) }
      }
      off += 2 + buf.readUInt16BE(off + 2)
    }
    return null
  }
  // WebP — RIFF container, size encoding differs per chunk flavor
  if (buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16)
    if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
    if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) } }
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
  }
  return null
}

const dimsCache = new Map<string, { w: number; h: number } | null>()
function imageDims(src: string): { w: number; h: number } | null {
  if (!src.startsWith('/')) return null // remote image — no file to sniff
  let d = dimsCache.get(src)
  if (d === undefined) {
    try {
      d = parseDims(readFileSync(join(process.cwd(), 'public', src.replace(/^\/+/, ''))))
    } catch {
      d = null
    }
    dimsCache.set(src, d)
  }
  return d
}

// Bezel-baked stills (`<name>-framed.png` from scripts/bake-bezel.mjs) get the BezelImage
// treatment automatically, so posts embed them as PLAIN markdown images — which Obsidian
// can preview, unlike a <BezelImage/> JSX tag. The bakes vary per device frame:
// 900x1840 / 920x1920 / 980x2000.
function bezelDims(src: string): { w: number; h: number } {
  return imageDims(src) ?? { w: 920, h: 1920 }
}

export function makeMdxImg(defaultFull: boolean, counterRef = { count: 0 }) {
  return function MdxImg({ src, alt, width, height, title }: ImgProps) {
    const idx = counterRef.count++
    const priority = idx === 0
    const loading: 'eager' | 'lazy' | undefined = idx === 0 ? undefined : idx < 4 ? 'eager' : 'lazy'
    src = normalizeSrc(src ?? '')

    // Baked bezel stills: same figure BezelImage renders, chosen by the -framed suffix.
    // `title` (if any) is a plain caption here — bezels take no layout keywords.
    if (/-framed\.png$/i.test(src)) {
      const d = bezelDims(src)
      return (
        <figure className="col-portrait my-14">
          <div className="mx-auto" style={{ maxWidth: 460 }}>
            <ImgModal
              src={src}
              alt={alt ?? ''}
              width={d.w}
              height={d.h}
              sizes="(max-width: 460px) 100vw, 460px"
              className="h-auto w-full"
              priority={priority}
              loading={loading}
            />
          </div>
          {title && (
            <figcaption className="section-label mt-3 text-center">{renderCaption(title)}</figcaption>
          )}
        </figure>
      )
    }

    const pipeIdx = title?.indexOf('|') ?? -1
    const rawLayout = pipeIdx >= 0 ? title!.slice(0, pipeIdx) : (title ?? '')
    const captionAfterPipe = pipeIdx >= 0 ? title!.slice(pipeIdx + 1) || null : null

    // Optional per-image border flag inside the layout part: `border` forces a hairline
    // on this one image; `noborder` removes it (e.g. one screenshot under a page-wide
    // imageBorders flag). Stripped out before the layout keyword is read.
    let borderFlag: 'on' | 'off' | null = null
    let layoutPart = rawLayout
    if (/\bnoborder\b/.test(layoutPart)) { borderFlag = 'off'; layoutPart = layoutPart.replace(/\bnoborder\b/g, '') }
    else if (/\bborder\b/.test(layoutPart)) { borderFlag = 'on'; layoutPart = layoutPart.replace(/\bborder\b/g, '') }
    // `shadow` gives a window screenshot the site's shadow-window treatment (the
    // /quicktake hero look) — for app windows whose transparent rounded corners
    // float without a ground. Same vocabulary slot as border/noborder.
    let shadowFlag = false
    if (/\bshadow\b/.test(layoutPart)) { shadowFlag = true; layoutPart = layoutPart.replace(/\bshadow\b/g, '') }
    layoutPart = layoutPart.trim()

    const isLayoutKeyword = layoutPart === 'full' || layoutPart === 'portrait' || layoutPart === 'narrow'
      || (layoutPart !== '' && !isNaN(Number(layoutPart)))
      || /^\d+x\d+$/.test(layoutPart)

    // No pipe + leftover non-keyword text = that text is the caption.
    const effectiveLayout = isLayoutKeyword ? layoutPart : undefined
    const effectiveCaption = captionAfterPipe ?? (pipeIdx < 0 && !isLayoutKeyword && layoutPart !== '' ? layoutPart : null)
    const borderClass = borderFlag === 'on' ? ' img-bordered' : borderFlag === 'off' ? ' img-no-border' : ''

    const isFullBleed = effectiveLayout === 'full' || (!effectiveLayout && defaultFull)
    const isWide = !defaultFull && !isFullBleed && !effectiveLayout
    const wxhMatch = typeof effectiveLayout === 'string' ? effectiveLayout.match(/^(\d+)x(\d+)$/) : null
    const maxW = isFullBleed || isWide ? null
      : wxhMatch ? Number(wxhMatch[1])
      : effectiveLayout === 'portrait' ? 480
      : effectiveLayout === 'narrow' ? 620
      : typeof effectiveLayout === 'string' && !isNaN(Number(effectiveLayout)) ? Number(effectiveLayout)
      : 800

    // Markdown images carry no dimensions — sniff the file's real pixels so the reserved box
    // matches the true RATIO (the flat 1200x800 guess mis-reserved every non-3:2 image). The
    // width baseline stays what it always was (the attr also sets display width for centered
    // images); only the height moves onto the real ratio. Skipped when dimensions are
    // declared, so a given width never pairs with a height from a different ratio.
    const sniffed = !Number(width) && !Number(height) && !wxhMatch ? imageDims(src) : null
    const imgWidth = Number(width) || (wxhMatch ? Number(wxhMatch[1]) : (maxW ?? 1200))
    const imgHeight = Number(height) || (wxhMatch ? Number(wxhMatch[2]) : sniffed ? Math.round(imgWidth * (sniffed.h / sniffed.w)) : 800)

    const sizes = isFullBleed
      ? '100vw'
      : isWide
      ? '(max-width: 768px) 100vw, 50vw'
      : `(max-width: ${maxW}px) 100vw, ${maxW}px`

    const isPortrait = effectiveLayout === 'portrait'

    return (
      <figure
        className={`${isFullBleed ? FULL_COL : isPortrait ? PORTRAIT_COL : isWide ? WIDE_COL : TEXT_COL} mx-auto my-14 w-full${borderClass}`}
        style={!isFullBleed && !isPortrait && !isWide ? { maxWidth: maxW!, marginLeft: 'auto', marginRight: 'auto' } : undefined}
      >
        <ImgModal
          src={src}
          alt={alt ?? ''}
          width={imgWidth}
          height={imgHeight}
          sizes={sizes}
          // Full-bleed and wide images FILL the figure (w-full), same as every video. The width
          // attribute is a 1200 fallback (markdown images carry no dimensions), and without
          // w-full the img caps at 1200px CSS and pins LEFT inside the column — invisible until
          // the media column outgrows 1200px on a wide window, because the figure used to
          // shrink-wrap + mx-auto (its w-full arrived 2026-07-11 and uncovered this).
          className={`max-w-full h-auto${isFullBleed || isWide ? ' w-full' : ''}${isPortrait ? ' block mx-auto' : ''}${shadowFlag ? ' shadow-window' : ''}`}
          priority={priority}
          loading={loading}
        />
        {effectiveCaption && (
          <figcaption className="section-label mt-3 text-center">
            {renderCaption(effectiveCaption)}
          </figcaption>
        )}
      </figure>
    )
  }
}
