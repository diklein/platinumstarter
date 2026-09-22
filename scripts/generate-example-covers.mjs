#!/usr/bin/env node
/**
 * Placeholder artwork for the example shelves: book covers (/books and the home "reading"
 * cell) and podcast art (/podcasts). The sibling of scripts/generate-example-images.mjs,
 * which covers the example posts and case studies; this one covers the data-file shelves.
 *
 * Every picture is a flat composition in the house palette (the OKLCH tokens in
 * src/app/globals.css, converted to sRGB below because resvg has no oklch()), drawn as SVG
 * and rasterised with @resvg/resvg-js. Nothing is fetched. Every output starts with
 * `example-` so it can be cleared in one sweep.
 *
 *   node scripts/generate-example-covers.mjs          render everything
 *   node scripts/generate-example-covers.mjs --list   print the manifest without rendering
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = process.argv.includes('--list')

// ---------------------------------------------------------------------------------------------
// OKLCH -> sRGB (the light-theme tokens in globals.css)
// ---------------------------------------------------------------------------------------------

function oklchToHex(L, C, h) {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const toSrgb = (v) => {
    const c = Math.min(1, Math.max(0, v))
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(g * 255)
  }
  return '#' + lin.map((v) => toSrgb(v).toString(16).padStart(2, '0')).join('')
}

const C = {
  bg: oklchToHex(1, 0, 0),
  surface: oklchToHex(0.94, 0.006, 240),
  fg: oklchToHex(0.14, 0.008, 240),
  muted: oklchToHex(0.48, 0.01, 240),
  accent: oklchToHex(0.51, 0.27, 27),
  border: oklchToHex(0.88, 0.006, 240),
  borderStrong: oklchToHex(0.64, 0.008, 240),
}

const MONO = 'GeistMono, Geist Mono, Menlo, Consolas, monospace'

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>`

// ---------------------------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------------------------

/** A book cover: surface ground, a spine band in the page ink, title bars, one accent cell,
 *  and the dimension label. `variant` moves the accent so the three covers differ. */
function bookCover({ w, h, variant }) {
  const spine = Math.round(w * 0.08)
  const m = Math.round(w * 0.12)
  const bar = Math.round(h * 0.035)
  const bars = [0.72, 0.5, 0.62].map((f, i) =>
    `<rect x="${spine + m}" y="${m + i * bar * 2.2}" width="${Math.round((w - spine - m * 2) * f)}" height="${bar}" fill="${C.fg}" fill-opacity="0.85"/>`,
  )
  const side = Math.round(w * 0.14)
  const ax = spine + m + (variant % 2) * (w - spine - m * 2 - side)
  const ay = h - m - side - Math.floor(variant / 2) * side * 1.5
  return svg(w, h, [
    `<rect width="${w}" height="${h}" fill="${C.surface}"/>`,
    `<rect width="${spine}" height="${h}" fill="${C.fg}"/>`,
    ...bars,
    `<rect x="${ax}" y="${ay}" width="${side}" height="${side}" fill="${C.accent}"/>`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${C.border}"/>`,
    `<text x="${w - m * 0.5}" y="${h - m * 0.35}" text-anchor="end" font-family="${MONO}" font-size="${Math.round(w * 0.05)}" fill="${C.muted}">${w}×${h}</text>`,
  ].join('\n'))
}

/** Podcast art: a square with a large ring in the page ink and one accent dot on it, the
 *  dot walking around the ring per `variant`. */
function podcastArt({ w, variant }) {
  const cx = w / 2
  const r = w * 0.3
  const angle = (-90 + variant * 120) * (Math.PI / 180)
  const dx = cx + r * Math.cos(angle)
  const dy = cx + r * Math.sin(angle)
  return svg(w, w, [
    `<rect width="${w}" height="${w}" fill="${C.surface}"/>`,
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${C.fg}" stroke-width="${Math.round(w * 0.045)}"/>`,
    `<circle cx="${cx}" cy="${cx}" r="${w * 0.06}" fill="${C.fg}"/>`,
    `<circle cx="${dx}" cy="${dy}" r="${w * 0.075}" fill="${C.accent}"/>`,
    `<text x="${w * 0.94}" y="${w * 0.95}" text-anchor="end" font-family="${MONO}" font-size="${Math.round(w * 0.04)}" fill="${C.muted}">${w}×${w}</text>`,
  ].join('\n'))
}

// ---------------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------------

const BOOKS = 'public/images/books'
const PODCASTS = 'public/images/podcasts'

/** { out, render } */
const IMAGES = [
  // /books and lib/books.ts (2x of the 120x180 slot)
  { out: `${BOOKS}/example-time-machine.png`, render: () => bookCover({ w: 240, h: 360, variant: 0 }) },
  { out: `${BOOKS}/example-pride-and-prejudice.png`, render: () => bookCover({ w: 240, h: 360, variant: 1 }) },
  { out: `${BOOKS}/example-moby-dick.png`, render: () => bookCover({ w: 240, h: 360, variant: 2 }) },
  // /podcasts (2x of the 176px slot)
  { out: `${PODCASTS}/example-grid-hour.png`, render: () => podcastArt({ w: 352, variant: 0 }) },
  { out: `${PODCASTS}/example-ship-notes.png`, render: () => podcastArt({ w: 352, variant: 1 }) },
  { out: `${PODCASTS}/example-darkroom-radio.png`, render: () => podcastArt({ w: 352, variant: 2 }) },
]

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------

function fontOptions() {
  const dir = join(ROOT, 'public/fonts')
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => join(dir, f))
    : []
  return { loadSystemFonts: true, fontFiles: files, defaultFontFamily: 'Menlo' }
}

async function main() {
  if (LIST) {
    for (const img of IMAGES) console.log(img.out)
    return
  }
  const font = fontOptions()
  let bytes = 0
  for (const img of IMAGES) {
    const outPath = join(ROOT, img.out)
    mkdirSync(dirname(outPath), { recursive: true })
    const png = new Resvg(img.render(), { font }).render().asPng()
    const buf = await sharp(png).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
    writeFileSync(outPath, buf)
    const size = statSync(outPath).size
    bytes += size
    console.log(`${String(size).padStart(8)}  ${img.out}`)
  }
  console.log(`\n${IMAGES.length} images, ${(bytes / 1024).toFixed(0)} KB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
