#!/usr/bin/env node
/**
 * Deterministic placeholder media for the example content.
 *
 * Renders quiet grid compositions in the house palette with @resvg/resvg-js (already a
 * devDependency), labels each one with its pixel dimensions in a corner so it reads as an
 * intentional placeholder, and writes them to the example paths the example posts and case
 * studies reference. The clips are built from the rendered posters with ffmpeg when it is
 * installed (a slow push-in over the composition, silent, four seconds); without ffmpeg the
 * posters still render and the script says which clips it skipped.
 *
 *   node scripts/generate-example-images.mjs          render everything
 *   node scripts/generate-example-images.mjs --list   print the manifest without rendering
 *
 * Every output file name starts with `example-` (the bezel clips live under the path
 * BezelVideo hardcodes). scripts/clear-examples.mjs removes them again by reading the
 * example MDX, so a new asset here needs a reference in an example post to be cleaned up.
 *
 * Colors: the OKLCH tokens in src/app/globals.css converted to sRGB hex below (resvg has no
 * oklch()). Re-run after a palette change and the placeholders follow it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = process.argv.includes('--list')

// ---------------------------------------------------------------------------------------------
// OKLCH -> sRGB (the globals.css tokens, light and dark)
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

const LIGHT = {
  bg: oklchToHex(1, 0, 0),
  surface: oklchToHex(0.94, 0.006, 240),
  fg: oklchToHex(0.14, 0.008, 240),
  muted: oklchToHex(0.48, 0.01, 240),
  accent: oklchToHex(0.51, 0.27, 27),
  border: oklchToHex(0.88, 0.006, 240),
  borderStrong: oklchToHex(0.64, 0.008, 240),
}
const DARK = {
  bg: oklchToHex(0.18, 0.008, 240),
  surface: oklchToHex(0.23, 0.01, 240),
  fg: oklchToHex(0.92, 0.005, 240),
  muted: oklchToHex(0.63, 0.01, 240),
  accent: oklchToHex(0.65, 0.16, 27),
  border: oklchToHex(0.3, 0.01, 240),
  borderStrong: oklchToHex(0.52, 0.01, 240),
}

// ---------------------------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32) seeded from the file name, so every run of this
 *  script draws the same picture for the same file. */
function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One placeholder: a 12-column hairline grid on the surface tint, two or three quiet blocks
 * snapped to the grid, one accent mark, and the dimension label in the bottom-right corner.
 * `variant` nudges the blocks so a pair of files (before/after) differ visibly.
 */
function composition({ w, h, name, dark = false, variant = 0 }) {
  const c = dark ? DARK : LIGHT
  const rand = rng(name)

  // A quiet wireframe made of squares only: a grey field, one large square, a few smaller
  // ones, and one small red square, all snapped to a grid of square cells with a generous
  // margin. Nothing overlaps, nothing touches, no hairlines, no labels.
  const across = w >= h ? 10 : 6
  const margin = Math.round(Math.min(w, h) * 0.1)
  const gutter = Math.round(Math.min(w, h) * 0.03)
  const cell = (w - margin * 2 - gutter * (across - 1)) / across
  const down = Math.max(3, Math.floor((h - margin * 2 + gutter) / (cell + gutter)))
  const top = Math.round((h - (down * cell + (down - 1) * gutter)) / 2)
  const cx = (col) => margin + col * (cell + gutter)
  const cy = (row) => top + row * (cell + gutter)

  const parts = [`<rect width="${w}" height="${h}" fill="${c.surface}"/>`]
  const taken = []
  // A square may not overlap or touch another: one cell of air on every side.
  const free = (col, row, n) => taken.every((t) => col + n < t.col || t.col + t.n < col || row + n < t.row || t.row + t.n < row)
  const place = (n, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const col = Math.floor(rand() * (across - n + 1))
      const row = Math.floor(rand() * (down - n + 1))
      if (free(col, row, n)) { taken.push({ col, row, n }); return { col, row, n } }
    }
    return null
  }
  const draw = (sq, fill, opacity) => {
    if (!sq) return
    const size = sq.n * cell + (sq.n - 1) * gutter
    parts.push(`<rect x="${cx(sq.col)}" y="${cy(sq.row)}" width="${size}" height="${size}" fill="${fill}"${opacity ? ` fill-opacity="${opacity}"` : ''}/>`)
  }

  // The large square first (it anchors the composition), then the smaller ones in
  // descending size, then the red one, which is always a single cell.
  const big = Math.min(down - 1, 3 + (variant % 2))
  const plan = [big, 2, 2, 1, 1].slice(0, 3 + Math.floor(rand() * 3))
  const ink = dark ? 0.22 : 0.12
  for (const n of plan) draw(place(n), c.fg, ink)
  draw(place(1), c.accent)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('\n')}</svg>`
}


// ---------------------------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------------------------

const D = 'public/images/designs'

/** { out, w, h, dark?, variant?, frame?, clip?: { webm?, hiRes? } } */
const IMAGES = [
  // Writing: images and captions
  // Writing: photo essay
  // Writing: product cards
  // Writing: video posters (jpg) and the clips built from them
  // Designs: study one (static hero)
  { out: `${D}/example-capture-hero.png`, w: 2500, h: 1600 },
  { out: `${D}/example-capture-before.png`, w: 1600, h: 1000 },
  { out: `${D}/example-capture-after.png`, w: 1600, h: 1000, variant: 3, seed: `${D}/example-capture-before.png` },
  { out: `${D}/example-capture-flow.png`, w: 1920, h: 1080 },
  { out: `${D}/example-capture-phone.png`, w: 1200, h: 1500 },
  // Designs: study two (video hero)
  { out: `${D}/example-sync-hero.jpg`, w: 1920, h: 1080, clip: { webm: true } },
  { out: `${D}/example-sync-states.png`, w: 1920, h: 1080 },
  { out: `${D}/example-sync-row-1.png`, w: 800, h: 1000 },
  { out: `${D}/example-sync-row-2.png`, w: 800, h: 1000, variant: 1 },
  { out: `${D}/example-sync-row-3.png`, w: 800, h: 1000, variant: 2 },
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

function ffmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** A four-second silent push-in over the poster, H.264 for the .mp4 and VP9 for the .webm. */
function renderClip(posterPath, { webm, hiRes }, w, h) {
  const base = posterPath.replace(/\.jpg$/, '')
  const frames = 96
  const filter = `zoompan=z='1+0.05*on/${frames}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=24,format=yuv420p`
  const common = ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '24', '-i', posterPath, '-vf', filter, '-t', '4', '-an']
  execFileSync('ffmpeg', [...common, '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', `${base}.mp4`], { stdio: 'inherit' })
  const made = [`${base}.mp4`]
  if (webm) {
    execFileSync('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', `${base}.webm`], { stdio: 'inherit' })
    made.push(`${base}.webm`)
  }
  if (hiRes) {
    // BezelVideo asks for a 3x encode for dense screens; the placeholder has no more detail
    // to give, so the same clip stands in and the request never 404s.
    copyFileSync(`${base}.mp4`, `${base}-3x.mp4`)
    made.push(`${base}-3x.mp4`)
  }
  return made
}

async function main() {
  if (LIST) {
    for (const img of IMAGES) console.log(`${img.out}  ${img.w}x${img.h}${img.clip ? '  + clip' : ''}`)
    return
  }
  const font = fontOptions()
  const hasFfmpeg = ffmpeg()
  const written = []
  const skippedClips = []

  for (const img of IMAGES) {
    const outPath = join(ROOT, img.out)
    mkdirSync(dirname(outPath), { recursive: true })
    const svg = composition({ w: img.w, h: img.h, name: img.seed ?? img.out, dark: img.dark, variant: img.variant ?? 0, frame: img.frame })
    // Framed stills keep their transparent corners; everything else painted its own surface.
    const png = new Resvg(svg, { font }).render().asPng()
    if (/\.png$/.test(img.out)) {
      // Flat art: palette-quantised PNG stays small without visible loss.
      const buf = await sharp(png).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
      writeFileSync(outPath, buf)
    } else {
      // Framed clips cannot keep transparent corners in H.264, so the corners take the page
      // background of their theme (the baked-bezel convention); flat art has no transparency.
      const pal = img.dark ? DARK : LIGHT
      const buf = await sharp(png).flatten({ background: img.frame ? pal.bg : pal.surface }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      writeFileSync(outPath, buf)
    }
    written.push(img.out)
    if (img.clip) {
      if (hasFfmpeg) written.push(...renderClip(outPath, img.clip, img.w, img.h).map((p) => p.replace(ROOT + '/', '')))
      else skippedClips.push(img.out.replace(/\.jpg$/, '.mp4'))
    }
  }

  let imageBytes = 0
  let clipBytes = 0
  for (const rel of written) {
    const size = statSync(join(ROOT, rel)).size
    if (/\.(png|jpg)$/.test(rel)) imageBytes += size
    else clipBytes += size
    console.log(`${String(size).padStart(8)}  ${rel}`)
  }
  const images = written.filter((f) => /\.(png|jpg)$/.test(f)).length
  console.log(`\n${images} images, ${(imageBytes / 1024).toFixed(0)} KB; ${written.length - images} clips, ${(clipBytes / 1024).toFixed(0)} KB`)
  if (skippedClips.length) {
    console.log(`ffmpeg not found; skipped ${skippedClips.length} clips (the posters rendered):\n  ${skippedClips.join('\n  ')}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
