#!/usr/bin/env node
/**
 * Scans public/images/ and records which images have enough REAL transparency that the
 * loading shimmer placed behind them would bleed straight through (see
 * src/lib/image-transparency.ts for the consumer). Writes src/generated/image-transparency.json:
 * a map of public-relative src → true, containing ONLY the transparent images.
 *
 * This replaced scripts/extract-image-colors.mjs, which computed an average OKLCH color per
 * image for the dominant-color border design — a feature dropped long ago. The transparency
 * flag was the scan's only surviving output, and recomputing 600+ untouched images cost every
 * Vercel build ~34 seconds, so:
 *
 * CACHED BY FILE SIZE. Results live in .next/cache/image-transparency-cache.json, which
 * Vercel restores between deployments (and survives locally), so only new or changed images
 * are decoded. Size is the fingerprint: an edit that changes pixels but lands on the exact
 * same byte count would be missed, which is vanishingly rare for photographic assets and
 * costs only a cosmetic shimmer if it ever happens.
 *
 * Run automatically via the `prebuild` npm script. Re-run manually after adding images:
 * `node scripts/extract-image-transparency.mjs`
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join, relative, extname } from 'path'
import sharp from 'sharp'

const IMAGES_DIR = join(process.cwd(), 'public', 'images')
const OUTPUT_FILE = join(process.cwd(), 'src', 'generated', 'image-transparency.json')
const CACHE_FILE = join(process.cwd(), '.next', 'cache', 'image-transparency-cache.json')
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])

// Fraction of an image that must be transparent before we stop putting a loading shimmer behind
// it. Bezel screenshots are ~0% (rounded corners only) and keep their shimmer; the Dot hero is
// 11.2% and bleeds it through. 2% cleanly separates the two.
const TRANSPARENCY_THRESHOLD = 0.02

async function walkImages(dir) {
  let files = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(await walkImages(fullPath))
    } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }
  return files
}

async function isTransparent(file) {
  const meta = await sharp(file).metadata()
  if (!meta.hasAlpha) return false
  const stats = await sharp(file).stats()
  const alpha = stats.channels[3]
  return Boolean(alpha && 1 - alpha.mean / 255 > TRANSPARENCY_THRESHOLD)
}

async function main() {
  const files = await walkImages(IMAGES_DIR)

  let cache = {}
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, 'utf-8'))
  } catch { /* no cache yet — full scan */ }

  const nextCache = {}
  const transparent = {}
  let decoded = 0
  let failed = 0

  for (const file of files) {
    const key = '/' + relative(join(process.cwd(), 'public'), file).replace(/\\/g, '/')
    try {
      const { size } = await stat(file)
      const hit = cache[key]
      const t = hit && hit.size === size ? hit.t : (decoded++, await isTransparent(file))
      nextCache[key] = { size, t }
      if (t) transparent[key] = true
    } catch (err) {
      console.warn(`  Skipped ${relative(process.cwd(), file)}: ${err.message}`)
      failed++
    }
  }

  await mkdir(join(process.cwd(), 'src', 'generated'), { recursive: true })
  await writeFile(OUTPUT_FILE, JSON.stringify(transparent, null, 2) + '\n')
  await mkdir(join(process.cwd(), '.next', 'cache'), { recursive: true })
  await writeFile(CACHE_FILE, JSON.stringify(nextCache) + '\n')

  console.log(
    `image-transparency: ${files.length} images, ${decoded} decoded (${files.length - decoded - failed} cached)` +
    `${failed > 0 ? `, ${failed} skipped` : ''} — ${Object.keys(transparent).length} transparent.`,
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
