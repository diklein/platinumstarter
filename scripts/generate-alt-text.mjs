#!/usr/bin/env node
/**
 * generate-alt-text.mjs — Claude Vision auto alt text generator.
 *
 * Finds MDX images with empty alt text, calls Claude Vision, writes back.
 * Handles both inline ![](src) and reference-style ![][ref] syntax.
 *
 * Usage:
 *   node scripts/generate-alt-text.mjs [file1.mdx ...]  # specific files
 *   node scripts/generate-alt-text.mjs                  # all writing MDX files
 *
 * Safety rules:
 *   - Never overwrites non-empty alt text
 *   - Skips .gif, .svg, .mp4, .webm, .mov, .mp3 (unsupported by vision API)
 *   - Skips images whose path cannot be resolved to an existing local file
 *   - Individual image errors are logged — run continues
 *   - Requires the key for the provider in site.intelligence (ANTHROPIC_API_KEY by default;
 *     see scripts/lib/ai.mjs)
 */

import { readFile, writeFile, access, readdir } from 'fs/promises'
import { join, resolve, isAbsolute, basename, extname } from 'path'
import { generateText } from 'ai'
import { intelligenceEnabled, model } from './lib/ai.mjs'

const CWD = process.cwd()
const PUBLIC_DIR = join(CWD, 'public')
const CONTENT_DIR = join(CWD, 'src', 'content')
const WRITING_DIR = join(CWD, 'src', 'content', 'writing')

const SKIP_EXTENSIONS = new Set(['.gif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.wav'])

const ALLOWED_ROOTS = [CWD + '/']

function isAllowedPath(p) {
  return ALLOWED_ROOTS.some((root) => p.startsWith(root))
}

// intelligence.altText off means this script has nothing to do; it says so before the key
// check, so a workflow step stays green with no key at all.
if (!intelligenceEnabled('altText')) {
  console.log('generate-alt-text: off (intelligence.altText is false in site.config.ts); nothing to do')
  process.exit(0)
}

// The provider and model come from site.intelligence (scripts/lib/ai.mjs); a missing key for
// the chosen provider exits here, before any file is read.
let visionModel
try {
  visionModel = model('fast')
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function resolveImagePath(src, mdxFilePath) {
  if (/^https?:\/\//i.test(src) || src.startsWith('//')) return null
  if (src.startsWith('data:')) return null

  const ext = extname(src).toLowerCase()
  if (SKIP_EXTENSIONS.has(ext)) return null

  if (isAbsolute(src)) {
    const candidate = join(PUBLIC_DIR, src)
    if (!isAllowedPath(candidate)) return null
    return (await fileExists(candidate)) ? candidate : null
  }

  const dir = mdxFilePath.replace(/\/[^/]+$/, '')
  const candidates = [
    resolve(dir, src),
    join(CONTENT_DIR, src),
    join(PUBLIC_DIR, src),
    src.startsWith('/') ? join(PUBLIC_DIR, src.slice(1)) : null,
  ].filter(Boolean)

  for (const c of candidates) {
    if (!isAllowedPath(c)) continue
    if (await fileExists(c)) return c
  }
  return null
}

async function imageToDataUrl(filePath) {
  const buf = await readFile(filePath)
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpeg'
  const mimeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
  }
  const mime = mimeMap[ext] ?? 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function generateAltText(imagePath) {
  const dataUrl = await imageToDataUrl(imagePath)

  const { text } = await generateText({
    model: visionModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: dataUrl },
          {
            type: 'text',
            text: 'Write concise, descriptive alt text for this image (max 125 characters). Describe what is visually present. No "image of" prefix. Plain nouns over marketing adjectives: never "sleek", "stunning", "vibrant", or similar. Reply with only the alt text, no quotes, no explanation.',
          },
        ],
      },
    ],
    maxOutputTokens: 100,
  })

  return text.trim().replace(/^["']|["']$/g, '').slice(0, 125)
}

// ---------------------------------------------------------------------------
// MDX parsing
// ---------------------------------------------------------------------------

function buildExcludedRanges(raw) {
  const ranges = []
  const fmMatch = /^---[\s\S]*?\n---\s*\n?/.exec(raw)
  if (fmMatch) ranges.push([0, fmMatch[0].length])
  const fenceRe = /^```[^\n]*\n[\s\S]*?^```\s*$/gm
  let m
  while ((m = fenceRe.exec(raw)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}

function isExcluded(index, ranges) {
  return ranges.some(([s, e]) => index >= s && index < e)
}

/**
 * Parse reference-style image definitions from MDX:
 * [image-1]: /path/to/image.jpg
 * Returns a Map of refName → srcPath
 */
function parseImageRefs(content) {
  const refs = new Map()
  const refDefRe = /^\[([^\]]+)\]:\s*(\S+)/gm
  let m
  while ((m = refDefRe.exec(content)) !== null) {
    refs.set(m[1], m[2])
  }
  return refs
}

async function processMdxFile(filePath) {
  const content = await readFile(filePath, 'utf-8')
  let updated = content
  let count = 0
  const replacements = []
  const excludedRanges = buildExcludedRanges(content)

  // Build reference map for this file
  const imageRefs = parseImageRefs(content)

  // --- Inline images: ![alt](src) ---
  const mdInlineRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m
  while ((m = mdInlineRe.exec(content)) !== null) {
    if (isExcluded(m.index, excludedRanges)) continue
    if (m[1].trim() !== '') continue // has alt text

    const src = m[2].split(' ')[0]
    const ext = extname(src).toLowerCase()
    if (SKIP_EXTENSIONS.has(ext)) continue

    const resolvedPath = await resolveImagePath(src, filePath)
    if (!resolvedPath) {
      process.stderr.write(`  skip (no file): "${src}" in ${basename(filePath)}\n`)
      continue
    }

    let altText
    try {
      altText = await generateAltText(resolvedPath)
    } catch (err) {
      process.stderr.write(`  skip (API error): "${src}" — ${err.message}\n`)
      continue
    }

    const replacement = `![${altText}](${m[2]})`
    replacements.push({ start: m.index, end: m.index + m[0].length, replacement })
    count++
    process.stdout.write(`  ✓ ${basename(src)}: ${altText}\n`)
  }

  // --- Reference-style images: ![][ref] or ![  ][ref] ---
  const mdRefRe = /!\[([^\]]*)\]\[([^\]]+)\]/g
  while ((m = mdRefRe.exec(content)) !== null) {
    if (isExcluded(m.index, excludedRanges)) continue
    if (m[1].trim() !== '') continue // has alt text

    const refName = m[2]
    const src = imageRefs.get(refName)
    if (!src) {
      process.stderr.write(`  skip (ref not found): "[${refName}]" in ${basename(filePath)}\n`)
      continue
    }

    const ext = extname(src).toLowerCase()
    if (SKIP_EXTENSIONS.has(ext)) continue

    const resolvedPath = await resolveImagePath(src, filePath)
    if (!resolvedPath) {
      process.stderr.write(`  skip (no file): "${src}" in ${basename(filePath)}\n`)
      continue
    }

    let altText
    try {
      altText = await generateAltText(resolvedPath)
    } catch (err) {
      process.stderr.write(`  skip (API error): "${src}" — ${err.message}\n`)
      continue
    }

    const replacement = `![${altText}][${refName}]`
    replacements.push({ start: m.index, end: m.index + m[0].length, replacement })
    count++
    process.stdout.write(`  ✓ [${refName}] ${basename(src)}: ${altText}\n`)
  }

  // Apply replacements from last to first
  if (replacements.length > 0) {
    replacements.sort((a, b) => b.start - a.start)
    for (const { start, end, replacement } of replacements) {
      updated = updated.slice(0, start) + replacement + updated.slice(end)
    }
  }

  return { updatedContent: updated, count }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filePaths = args
    .filter((a) => !a.startsWith('--'))
    .filter((a) => a.endsWith('.mdx') || a.endsWith('.md'))

  // Default: all writing MDX files
  let resolvedPaths = filePaths
  if (resolvedPaths.length === 0) {
    const entries = await readdir(WRITING_DIR)
    resolvedPaths = entries
      .filter((e) => e.endsWith('.mdx'))
      .map((e) => join(WRITING_DIR, e))
  }

  if (dryRun) {
    process.stdout.write('DRY RUN — no files will be written\n\n')
  }

  let totalImages = 0
  let totalFiles = 0

  for (const fp of resolvedPaths) {
    const absPath = isAbsolute(fp) ? fp : resolve(CWD, fp)

    if (!(await fileExists(absPath))) {
      process.stderr.write(`  skip (not found): ${fp}\n`)
      continue
    }

    process.stdout.write(`\n${basename(absPath)}\n`)

    let result
    try {
      result = await processMdxFile(absPath)
    } catch (err) {
      process.stderr.write(`  Error: ${err.message}\n`)
      continue
    }

    if (result.count > 0) {
      if (!dryRun) {
        // Final safety check: ensure no non-empty alt was clobbered
        const original = await readFile(absPath, 'utf-8')
        const nonEmptyAltRe = /!\[([^\]]+)\][\[(]/g
        let safetyMatch
        while ((safetyMatch = nonEmptyAltRe.exec(original)) !== null) {
          const originalAlt = safetyMatch[1].trim()
          // Find the same position in updated content and verify the alt is unchanged
          const updatedSlice = result.updatedContent.slice(safetyMatch.index, safetyMatch.index + safetyMatch[0].length + 50)
          if (!updatedSlice.startsWith(`![${originalAlt}]`)) {
            process.stderr.write(`  SAFETY ABORT: non-empty alt would be overwritten in ${basename(absPath)} — "${originalAlt.slice(0, 60)}"\n`)
            process.stderr.write(`  Skipping this file entirely. Please report this bug.\n`)
            result.count = 0
            break
          }
        }
      }

      if (result.count > 0) {
        if (!dryRun) {
          await writeFile(absPath, result.updatedContent, 'utf-8')
        }
        totalImages += result.count
        totalFiles++
        process.stdout.write(`  → ${dryRun ? 'would write' : 'wrote'} ${result.count} alt text(s)\n`)
      }
    } else {
      process.stdout.write(`  → no empty alts\n`)
    }
  }

  console.log(`\n${dryRun ? '[dry run] ' : ''}Done: ${totalImages} alt text(s) ${dryRun ? 'found' : 'generated'} across ${totalFiles} file(s)`)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
