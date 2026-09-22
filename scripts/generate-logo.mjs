#!/usr/bin/env node
/**
 * Renders the downloadable logo assets the header mark's right-click menu serves:
 *   public/logo.svg — the Weimar mark in the avatar's circle-safe frame
 *   public/logo.png — the same, 512x512 with a TRANSPARENT background
 *
 * Same single source of truth as generate-avatar.mjs / generate-favicons.mjs: the mark's
 * square + circle in the LIGHT two-color brand form — accent-red circle, ink square
 * (the homepage lockup) — since a downloaded logo is the brand, not the header's
 * "you are here" state. Re-run whenever the mark changes (`node scripts/generate-logo.mjs`).
 */
import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Mark geometry — keep in sync with src/components/layout/site-mark.tsx.
const SQUARE = { x: 12, y: 32, size: 56 }
const CIRCLE = { cx: 62, cy: 38, r: 28 }
const INK = '#070a0c'
const ACCENT = '#d70000'
// The avatar's 128-unit circle-crop-safe frame (see generate-avatar.mjs): centered on the
// mark's bounds so the square's farthest corner stays inside any circular crop.
const VIEW = '-13 -15 128 128'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}">
  <circle cx="${CIRCLE.cx}" cy="${CIRCLE.cy}" r="${CIRCLE.r}" fill="${ACCENT}"/>
  <rect x="${SQUARE.x}" y="${SQUARE.y}" width="${SQUARE.size}" height="${SQUARE.size}" fill="${INK}"/>
</svg>`

await writeFile(path.join(ROOT, 'public', 'logo.svg'), svg + '\n')

await sharp(Buffer.from(svg), { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(path.join(ROOT, 'public', 'logo.png'))

console.log('logo.svg + logo.png          512x512 (transparent, header mark downloads)')
