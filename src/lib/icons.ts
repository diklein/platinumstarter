/**
 * The site's icon set, generated from one SVG: the header mark.
 *
 * Server-side only (node:fs, @resvg/resvg-js). Plain erasable TypeScript so both callers can
 * import it: `scripts/icons.mjs` (`npm run icons`, and what an agent runs from chat) and the
 * dev-only settings route that takes an upload (src/app/api/settings/icon/route.ts).
 *
 * The 2026 set is six things (https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs,
 * updated 2026-01; see docs/icons.md):
 *   src/app/favicon.ico        32 and 16 (Next declares the ICO's largest image as its `sizes`, and
 *                              32x32 keeps the SVG the preferred tab icon; 48 is not needed)
 *   src/app/icon.svg           the mark itself, with its dark-mode rule
 *   src/app/apple-icon.png     180, opaque tile (iOS composites transparency onto black)
 *   public/icon-192.png        manifest
 *   public/icon-512.png        manifest
 *   public/icon-maskable-512.png  manifest, purpose "maskable": art inside the 40% safe circle
 * plus three the site itself uses: public/apple-touch-icon.png (the root URL iOS and Google
 * probe without reading the page), public/feed-icon.png (the RSS channel image), and
 * public/logo.svg + logo.png (the "download the mark" commands).
 *
 * Rasters are the LIGHT cut: resvg ignores @media rules and web fonts, and resolves
 * currentColor to black, so colors are substituted before rendering and text is refused.
 */
import { Resvg } from '@resvg/resvg-js'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The ink pair the starter mark wears (the --color-fg token as sRGB) and its badge red. */
export const INK = { light: '#070a0c', dark: '#e2e5e7' }
const RED = '#d70000'
/** The default home-screen tile: --color-surface as sRGB, what the icons have always sat on. */
export const DEFAULT_ICON_BACKGROUND = '#e8ecef'

/** The template's own mark, the same geometry as src/components/layout/site-mark.tsx. */
export const STARTER_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>
    .ink { stroke: ${INK.light} } .dot { fill: ${INK.light} }
    @media (prefers-color-scheme: dark) { .ink { stroke: ${INK.dark} } .dot { fill: ${INK.dark} } }
  </style>
  <g fill="none" class="ink" stroke-width="4">
    <rect x="16" y="8" width="22" height="46"/>
    <rect x="38" y="18" width="10" height="36"/>
    <line x1="20" y1="16" x2="34" y2="16"/>
    <line x1="20" y1="24" x2="34" y2="24"/>
    <line x1="16" y1="38" x2="38" y2="38"/>
  </g>
  <rect x="41.5" y="41.5" width="3" height="3" rx="1.5" class="dot"/>
  <rect x="24" y="42" width="6" height="6" rx="3" fill="${RED}"/>
</svg>
`

export class IconSourceError extends Error {}

/**
 * Validate an uploaded SVG and return it cleaned: prolog, doctype and comments dropped. It is
 * served from the site's own origin, so anything that can run or fetch is refused outright
 * rather than rewritten, and text is refused because no renderer here has the fonts.
 */
export function cleanSvg(input: string): string {
  const svg = input.replace(/^﻿/, '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new IconSourceError('That file is not an SVG (it should start with <svg and end with </svg>).')
  if (svg.length > 512 * 1024) throw new IconSourceError('That SVG is over 512 KB; an icon should be a few kilobytes. Simplify it and try again.')
  const refused: Array<[RegExp, string]> = [
    [/<script[\s>]/i, 'a <script>'],
    [/<foreignObject[\s>]/i, 'a <foreignObject>'],
    [/<(iframe|embed|object|audio|video)[\s>]/i, 'embedded media'],
    [/\son[a-z]+\s*=/i, 'an event handler attribute'],
    [/javascript:/i, 'a javascript: link'],
    [/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i, 'a link to an outside file'],
    [/@import|url\(\s*["']?(?!#|data:)/i, 'an outside stylesheet or url()'],
    [/<text[\s>]/i, 'live text (convert the text to outlines/paths in your design tool)'],
  ]
  for (const [re, what] of refused) {
    if (re.test(svg)) throw new IconSourceError(`That SVG contains ${what}, which an icon cannot use.`)
  }
  return svg + '\n'
}

/** The root <svg>'s viewBox (from viewBox, or width/height) and its inner markup. */
function parseSvg(svg: string): { viewBox: [number, number, number, number]; inner: string } {
  const open = svg.match(/^<svg\b[^>]*>/i)
  if (!open) throw new IconSourceError('That file is not an SVG.')
  const attrs = open[0]
  const vb = attrs.match(/viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/)
  let viewBox: [number, number, number, number]
  if (vb) viewBox = [Number(vb[1]), Number(vb[2]), Number(vb[3]), Number(vb[4])]
  else {
    const w = attrs.match(/\swidth\s*=\s*["']([\d.]+)/)
    const h = attrs.match(/\sheight\s*=\s*["']([\d.]+)/)
    if (!w || !h) throw new IconSourceError('That SVG has no viewBox or width and height, so its size is unknown.')
    viewBox = [0, 0, Number(w[1]), Number(h[1])]
  }
  if (!(viewBox[2] > 0 && viewBox[3] > 0)) throw new IconSourceError('That SVG has an empty viewBox.')
  return { viewBox, inner: svg.slice(attrs.length).replace(/<\/svg>\s*$/i, '') }
}

/** The mark inside a square, padded by `pad` (a fraction of the side) on every side, optionally
 *  on an opaque tile. currentColor is pinned to the light ink so rasters match the page. */
function framed(svg: string, size: number, pad: number, background?: string): string {
  const { viewBox, inner } = parseSvg(svg)
  const p = size * pad
  const body = inner.replace(/currentColor/g, INK.light)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${
    background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''
  }<svg x="${p}" y="${p}" width="${size - 2 * p}" height="${size - 2 * p}" viewBox="${viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet">${body}</svg></svg>`
}

function png(svg: string, size: number, pad: number, background?: string): Buffer {
  return new Resvg(framed(svg, size, pad, background), { fitTo: { mode: 'width', value: size } }).render().asPng()
}

/** PNG-in-ICO (valid everywhere since Vista): a 6-byte header, a 16-byte entry per image, the
 *  PNG bytes. */
function ico(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

/** Give a currentColor mark a color in the served SVG too: browsers resolve currentColor in an
 *  SVG favicon against the SVG's own `color`, which is black on a dark tab strip. */
function themedIconSvg(svg: string): string {
  if (!svg.includes('currentColor')) return svg
  return svg.replace(/^<svg\b[^>]*>/i, (open) => `${open}<style>svg{color:${INK.light}}@media (prefers-color-scheme:dark){svg{color:${INK.dark}}}</style>`)
}

export type IconFile = { path: string; data: Buffer | string; note: string }

/** Every file the set is made of, rendered in memory. `root` is the repo root. */
export function renderIcons(sourceSvg: string, opts: { background?: string } = {}): IconFile[] {
  const svg = cleanSvg(sourceSvg)
  const bg = opts.background || DEFAULT_ICON_BACKGROUND
  const apple = png(svg, 180, 0.1, bg)
  return [
    { path: 'src/app/icon.svg', data: themedIconSvg(svg), note: 'tab icon, follows light and dark' },
    { path: 'src/app/favicon.ico', data: ico([32, 16].map((s) => ({ size: s, data: png(svg, s, 0, undefined) }))), note: '32 and 16 for older browsers' },
    { path: 'src/app/apple-icon.png', data: apple, note: '180 on the tile, iOS home screen' },
    { path: 'public/apple-touch-icon.png', data: apple, note: 'the same, at the root URL iOS and Google probe' },
    { path: 'public/icon-192.png', data: png(svg, 192, 0.1, bg), note: 'manifest, Android home screen' },
    { path: 'public/icon-512.png', data: png(svg, 512, 0.1, bg), note: 'manifest, install and splash' },
    // Maskable: the platform crops to any shape inside a circle of radius 40% of the width, so
    // the art sits in the square inscribed in it (side 0.566, a 21.7% margin), on the full tile.
    { path: 'public/icon-maskable-512.png', data: png(svg, 512, 0.217, bg), note: 'manifest, Android adaptive shapes' },
    { path: 'public/feed-icon.png', data: png(svg, 144, 0.1, bg), note: 'the RSS channel image' },
    { path: 'public/logo.svg', data: svg, note: 'the mark download' },
    { path: 'public/logo.png', data: png(svg, 512, 0.06, undefined), note: 'the mark download, transparent' },
  ]
}

/** Files the old hand-kept set shipped that the 2026 set replaces (see docs/icons.md). */
export const OBSOLETE_ICON_FILES = [
  'public/favicon.ico',
  'public/favicon.svg',
  'public/favicon-16x16.png',
  'public/favicon-32x32.png',
  'public/android-chrome-192x192.png',
  'public/android-chrome-512x512.png',
]

/** Write the set under `root` and remove the obsolete files. Returns what was written. */
export function writeIcons(root: string, files: IconFile[]): IconFile[] {
  for (const f of files) {
    const out = join(/*turbopackIgnore: true*/ root, f.path)
    // Ignore comments: these paths are data, not code the deployment needs. The only runtime
    // caller is the dev-only /settings route; tracing them would pull in the whole project.
    mkdirSync(/*turbopackIgnore: true*/ dirname(out), { recursive: true })
    writeFileSync(/*turbopackIgnore: true*/ out, f.data)
  }
  for (const old of OBSOLETE_ICON_FILES) {
    const p = join(/*turbopackIgnore: true*/ root, old)
    if (existsSync(/*turbopackIgnore: true*/ p)) rmSync(/*turbopackIgnore: true*/ p)
  }
  return files
}

/** The SVG the icons come from for a given `brand.mark`: the starter mark, or the owner's SVG
 *  under public/. A wordmark or a PNG mark has no vector to draw icons from, so it is null. */
export function markSource(root: string, mark: string): string | null {
  if (mark === 'starter') return STARTER_MARK_SVG
  if (mark.startsWith('/') && mark.toLowerCase().endsWith('.svg')) {
    const p = join(/*turbopackIgnore: true*/ root, 'public', mark)
    return existsSync(/*turbopackIgnore: true*/ p) ? readFileSync(/*turbopackIgnore: true*/ p, 'utf8') : null
  }
  return null
}
