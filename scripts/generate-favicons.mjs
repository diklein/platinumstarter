#!/usr/bin/env node
/**
 * Rebuilds every favicon asset from ONE source of truth: the Weimar mark's geometry.
 *
 * Run it whenever the mark changes (`node scripts/generate-favicons.mjs`). The mark used
 * to be eyeballed into a hand-written SVG, which is how a favicon once shipped with a
 * #111111 square that exists nowhere in the color system.
 *
 * Colors are the system's own tokens, converted to sRGB hex (an icon file cannot hold an
 * oklch() or a var()):
 *   square  --color-fg          light #070a0c   dark #e2e5e7
 *   circle  brand red           #e10000 everywhere
 * OFF-PAGE marks wear the RED circle (2026-07-24). The header's grey-circle logic
 * (red = the "you are here" state) applies on the page, where the states can be confused;
 * a favicon, home-screen icon, or feed logo has no states, and grey there read as a
 * different, broken mark next to real app icons.
 *
 * The viewBox is offset so the mark sits with even padding inside the icon. The header's
 * SVG can use a plain 0 0 96 96 because it is optically placed against the wordmark; a
 * standalone icon has to be centered in its own square.
 */
import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

// Mark geometry — keep in sync with src/components/layout/site-mark.tsx
const SQUARE = { x: 12, y: 32, size: 56 }
const CIRCLE = { cx: 62, cy: 38, r: 28 }

const INK = { light: '#070a0c', dark: '#e2e5e7' }
const RED = '#e10000' // the brand red, same as the shadcn directory logo and feed mark

// Mark bounds are x 12..90, y 10..88 (78 square). A 96 viewBox offset to (3, 1) leaves
// 9 units of padding on all four sides — right for tab favicons, where 16px is tight.
const VIEW = '3 1 96 96'
// Home-screen tiles breathe more: app icons hold their art well inside the tile, and at
// 9 units the mark crowded the rounded corners. 118 centered on the mark = 20 units
// (~17%) of white on each side.
const VIEW_TILE = '-8 -10 118 118'

const shapes = (ink, mute) => `
  <circle cx="${CIRCLE.cx}" cy="${CIRCLE.cy}" r="${CIRCLE.r}" fill="${mute}"/>
  <rect x="${SQUARE.x}" y="${SQUARE.y}" width="${SQUARE.size}" height="${SQUARE.size}" fill="${ink}"/>`

/* The .svg favicon is the only one that can follow the OS theme, so it carries both
   palettes and a prefers-color-scheme rule. The rasters below are the light cut. */
const themedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}">
  <style>
    .sq { fill: ${INK.light} }
    .ci { fill: ${RED} }
    @media (prefers-color-scheme: dark) {
      .sq { fill: ${INK.dark} }
    }
  </style>
  <circle cx="${CIRCLE.cx}" cy="${CIRCLE.cy}" r="${CIRCLE.r}" class="ci"/>
  <rect x="${SQUARE.x}" y="${SQUARE.y}" width="${SQUARE.size}" height="${SQUARE.size}" class="sq"/>
</svg>
`

const lightSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}">${shapes(INK.light, RED)}</svg>`
const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_TILE}">${shapes(INK.light, RED)}</svg>`

// Home-screen and PWA icons are FLATTENED onto white: iOS composites the touch icon
// onto black when transparent (the black-tile home-screen icon), and Android maskable
// icons assume an opaque tile. Tab favicons stay transparent.
const RASTERS = [
  ['favicon-16x16.png', 16, false],
  ['favicon-32x32.png', 32, false],
  ['apple-touch-icon.png', 180, true],
  ['android-chrome-192x192.png', 192, true],
  ['android-chrome-512x512.png', 512, true],
]

await writeFile(path.join(PUBLIC, 'favicon.svg'), themedSvg)

for (const [name, size, onWhite] of RASTERS) {
  let img = sharp(Buffer.from(onWhite ? tileSvg : lightSvg), { density: 384 }).resize(size, size)
  if (onWhite) img = img.flatten({ background: '#ffffff' })
  await img.png({ compressionLevel: 9, palette: true }).toFile(path.join(PUBLIC, name))
  console.log(`${name.padEnd(28)} ${size}x${size}${onWhite ? ' (on white, roomy)' : ''}`)
}

// The RSS channel logo. Unlike the favicons, this is FLATTENED onto white: a feed reader
// draws it on its own surface (which may be dark), and the mark's ink square would vanish on
// a transparent tile. 144px is the RSS <image> spec's max width, and plenty for a sidebar.
await sharp(Buffer.from(tileSvg), { density: 384 })
  .resize(144, 144)
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(PUBLIC, 'feed-icon.png'))
console.log(`${'feed-icon.png'.padEnd(28)} 144x144 (on white, RSS channel image)`)

// The .ico carries 16/32/48 so Windows and old browsers pick their own size. sharp cannot
// write ICO, so the three PNGs are packed by hand: a 6-byte header, one 16-byte directory
// entry each, then the PNG bytes (PNG-in-ICO is valid and universally supported since Vista).
const icoSizes = [16, 32, 48]
const pngs = await Promise.all(
  icoSizes.map((s) =>
    sharp(Buffer.from(lightSvg), { density: 384 }).resize(s, s).png({ compressionLevel: 9 }).toBuffer()
  )
)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(icoSizes.length, 4)

let offset = 6 + 16 * icoSizes.length
const entries = icoSizes.map((s, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(s === 256 ? 0 : s, 0) // width
  e.writeUInt8(s === 256 ? 0 : s, 1) // height
  e.writeUInt8(0, 2) // palette size
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // color planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  return e
})

const ico = Buffer.concat([header, ...entries, ...pngs])
await writeFile(path.join(PUBLIC, 'favicon.ico'), ico)
// Next serves /favicon.ico from src/app if the file is there, so both copies must agree.
await writeFile(path.join(ROOT, 'src/app/favicon.ico'), ico)
console.log(`favicon.ico                  ${icoSizes.join('/')} (${ico.length} bytes), + src/app copy`)
console.log('favicon.svg                  themed (light + dark)')
