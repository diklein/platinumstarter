/**
 * Generate src/generated/video-dimensions.json — the intrinsic size of every <Video> clip
 * used in content, keyed by its src.
 *
 * WHY: a <video> has no intrinsic size until its metadata downloads, so the browser falls back
 * to the default 300x150 replaced-element box (ratio 2). The loading shimmer is absolute
 * inset-0 inside that box, so it painted scrunched at the wrong shape until metadata landed,
 * and the box then jumped to full height (real CLS). Declaring the ratio up front reserves the
 * correct box on the first paint. BezelVideo hardcodes its ratio because every baked master is
 * 900x1840; the <Video> clips have SIX different ratios (1.505 to 1.777), so they need this.
 *
 * HOW: dimensions are read from each clip's POSTER JPG, not the mp4. The poster shares the
 * clip's aspect ratio, is already mandatory (scripts/check-video-posters.mjs enforces it), and
 * is readable with sharp — which is already a build dependency (extract-image-transparency.mjs).
 * Reading the mp4 itself would need ffprobe, which is NOT available on the Vercel builder.
 */
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/generated/video-dimensions.json')

// EVERY tag that ends up rendering an AutoplayVideo: <Video>, <PortraitVideo>, <GifVideo>, and
// the raw <video> mapping. They all collapse to the 300x150 default box without a declared
// ratio, so they all need an entry. (BezelVideo is excluded on purpose: every baked master is
// 900x1840 and it hardcodes that.) Attribute order is not guaranteed, so pull each separately.
const VIDEO_TAG = /<(?:Video|PortraitVideo|GifVideo|video)\b([^>]*?)\/?>/g
const attr = (s, name) => s.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`))?.[1]

async function mdxFiles(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue // skip .obsidian etc
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await mdxFiles(p)))
    else if (e.name.endsWith('.mdx')) out.push(p)
  }
  return out
}

const files = await mdxFiles(join(ROOT, 'src/content'))
const dims = {}
const missing = []

// Authors point GifVideo at either the .mp4 or the .webm; AutoplayVideo always receives the
// .mp4. Key everything off the .mp4 so one entry serves every caller. The lookup in
// mdx-components normalises the same way.
const toKey = (src) => src.replace(/\.(mp4|webm)$/i, '') + '.mp4'

for (const file of files) {
  const body = await readFile(file, 'utf8')
  for (const [, attrs] of body.matchAll(VIDEO_TAG)) {
    const src = attr(attrs, 'src')
    if (!src || !/\.(mp4|webm)$/i.test(src)) continue
    const key = toKey(src)
    if (dims[key]) continue
    const poster = attr(attrs, 'poster') ?? src.replace(/\.(mp4|webm)$/i, '.jpg')
    const posterPath = join(ROOT, 'public', poster)
    if (!existsSync(posterPath)) {
      missing.push(`${key} (poster not found: ${poster})`)
      continue
    }
    const { width, height } = await sharp(posterPath).metadata()
    if (!width || !height) {
      missing.push(`${key} (poster unreadable: ${poster})`)
      continue
    }
    dims[key] = { w: width, h: height }
  }
}

// Sort for a stable diff.
const sorted = Object.fromEntries(Object.entries(dims).sort(([a], [b]) => a.localeCompare(b)))
await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(sorted, null, 2) + '\n')

console.log(`video-dimensions: ${Object.keys(sorted).length} clips`)
// A clip with no readable poster just gets no ratio and keeps the old behaviour. Warn, do not
// fail the build: check-video-posters.mjs is the gate that actually enforces posters.
if (missing.length) console.warn(`video-dimensions: skipped ${missing.length}:\n  ${missing.join('\n  ')}`)
