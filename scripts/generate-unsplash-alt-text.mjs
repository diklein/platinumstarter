#!/usr/bin/env node
/**
 * generate-unsplash-alt-text.mjs
 * Fills null alt_description fields in synced-photos.json using Claude Vision.
 * Never overwrites existing alt_description values.
 *
 * Usage:
 *   node scripts/generate-unsplash-alt-text.mjs
 *   node scripts/generate-unsplash-alt-text.mjs --dry-run
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { generateText } from 'ai'
import { model } from './lib/ai.mjs'

const JSON_PATH = join(process.cwd(), 'src', 'lib', 'synced-photos.json')

// The provider and model come from site.intelligence (scripts/lib/ai.mjs); a missing key for
// the chosen provider exits here.
let visionModel
try {
  visionModel = model('fast')
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const ct = res.headers.get('content-type') ?? 'image/jpeg'
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`
}

async function generateAltText(imageUrl) {
  const dataUrl = await fetchImageAsDataUrl(imageUrl)
  const { text } = await generateText({
    model: visionModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: dataUrl },
          {
            type: 'text',
            text: 'Write concise alt text for this photo (max 125 characters). Describe what is visually present. No "image of" or "photo of" prefix. Reply with only the alt text, no quotes, no explanation.',
          },
        ],
      },
    ],
    maxOutputTokens: 80,
  })
  return text.trim().replace(/^["']|["']$/g, '').slice(0, 125)
}

async function main() {
  const photos = JSON.parse(await readFile(JSON_PATH, 'utf-8'))
  const missing = photos.filter((p) => !p.alt_description)

  console.log(`${photos.length} total photos, ${missing.length} missing alt text`)
  if (dryRun) console.log('DRY RUN — no files will be written\n')

  let count = 0
  for (const photo of missing) {
    const url = photo.urls.small
    process.stdout.write(`  ${photo.id}: `)
    try {
      const alt = await generateAltText(url)
      process.stdout.write(`${alt}\n`)
      if (!dryRun) photo.alt_description = alt
      count++
    } catch (err) {
      process.stderr.write(`ERROR — ${err.message}\n`)
    }
  }

  if (!dryRun && count > 0) {
    await writeFile(JSON_PATH, JSON.stringify(photos, null, 2) + '\n', 'utf-8')
    console.log(`\nWrote ${count} alt text(s) to synced-photos.json`)
  } else {
    console.log(`\n${dryRun ? '[dry run] ' : ''}${count} alt text(s) generated`)
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
