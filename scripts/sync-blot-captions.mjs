#!/usr/bin/env node
/**
 * sync-blot-captions.mjs
 *
 * Reads each blot/Posts/ source file, extracts captions from
 * <div class="caption">...</div> elements, then updates the corresponding
 * MDX ref definitions to include the caption as a markdown title attribute:
 *
 *   [image-1]: /path/image.jpg "Caption text here"
 *
 * makeMdxImg treats the title as the visible figcaption.
 * alt text is left untouched — it stays as AI-generated accessibility text.
 *
 * Rules:
 *   - Only <div class="caption"> counts as a caption
 *   - If no caption div follows an image → no title added → no figcaption shown
 *   - If a ref definition already has a title, it is replaced with the blot caption
 *   - Images without a matching blot post are left untouched
 *
 * Usage:
 *   node scripts/sync-blot-captions.mjs [--dry-run]
 */

import { readFile, writeFile, readdir } from 'fs/promises'
import { join, basename } from 'path'
import matter from 'gray-matter'

const CWD = process.cwd()
const BLOT_DIR = join(CWD, 'blot', 'Posts')
const WRITING_DIR = join(CWD, 'src', 'content', 'writing')
const DRY_RUN = process.argv.includes('--dry-run')

if (DRY_RUN) console.log('DRY RUN — no files will be written\n')

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function blotFilenameToSlug(filename) {
  return filename
    .replace(/\.(md|txt)$/, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// Caption extraction from blot post content
// ---------------------------------------------------------------------------

/**
 * Extract text content from a <div class="caption">...</div> block,
 * handling nested divs by tracking depth and stripping inner HTML tags.
 */
function extractCaptionText(content, startIndex) {
  const openTag = '<div class="caption">'
  const start = content.indexOf(openTag, startIndex)
  if (start === -1) return null

  // Walk forward tracking div nesting depth to find the matching </div>
  let depth = 1
  let i = start + openTag.length
  while (i < content.length && depth > 0) {
    if (content.slice(i, i + 4) === '<div') depth++
    else if (content.slice(i, i + 6) === '</div>') { depth--; if (depth === 0) break }
    i++
  }

  const inner = content.slice(start + openTag.length, i)
  // Strip all HTML tags, collapse whitespace, trim
  const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text || null
}

/**
 * Given blot post content, returns a Map of imageRef → caption string.
 * Looks for: ![...][ref] followed (within ~8 lines) by <div class="caption">
 */
function extractCaptions(content) {
  const captions = new Map()
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const imgMatch = lines[i].match(/!\[[^\]]*\]\[([^\]]+)\]/)
    if (!imgMatch) continue

    const ref = imgMatch[1]

    // Look ahead up to 8 lines for a caption div opening
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      if (lines[j].includes('<div class="caption">')) {
        // Find character offset of this line in content
        const lineOffset = content.indexOf(lines[j], lines.slice(0, j).join('\n').length)
        const text = extractCaptionText(content, lineOffset)
        if (text) captions.set(ref, text)
        break
      }
      // Stop if we hit another image or a heading
      if (/^!\[|^#{1,6}\s/.test(lines[j].trim())) break
    }
  }

  return captions
}

// ---------------------------------------------------------------------------
// MDX ref definition updater
// ---------------------------------------------------------------------------

/**
 * Given MDX content and a caption map, returns updated content where
 * ref definitions are updated to include (or remove) the markdown title.
 *
 * [image-1]: /path/img.jpg          → [image-1]: /path/img.jpg "Caption"
 * [image-1]: /path/img.jpg "old"    → [image-1]: /path/img.jpg "Caption"
 * [image-1]: /path/img.jpg          → unchanged if ref not in captions map
 */
function applyCaptioms(mdxContent, captions) {
  if (captions.size === 0) return { content: mdxContent, count: 0 }

  let updated = mdxContent
  let count = 0

  for (const [ref, caption] of captions) {
    // Match the ref definition line (with or without existing title)
    // [ref]: /path/to/file.jpg
    // [ref]: /path/to/file.jpg "existing title"
    const refRe = new RegExp(
      `^(\\[${escapeRegex(ref)}\\]:\\s*\\S+)(?:\\s+"[^"]*")?\\s*$`,
      'm'
    )
    const match = refRe.exec(updated)
    if (!match) continue

    // Escape double-quotes in caption so it can't break the markdown title syntax
    const safeCaption = caption.replace(/"/g, '“').replace(/"/g, '”')
    const replacement = `${match[1]} "${safeCaption}"`

    if (updated.slice(match.index, match.index + match[0].length) !== replacement) {
      updated = updated.slice(0, match.index) + replacement + updated.slice(match.index + match[0].length)
      count++
    }
  }

  return { content: updated, count }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Build slug → MDX path lookup
  const mdxFiles = (await readdir(WRITING_DIR)).filter(f => f.endsWith('.mdx'))
  const mdxBySlug = new Map()

  for (const filename of mdxFiles) {
    const fullPath = join(WRITING_DIR, filename)
    const raw = await readFile(fullPath, 'utf-8')
    const { data } = matter(raw)
    if (data.slug) mdxBySlug.set(data.slug, fullPath)
  }

  // Process each blot post
  const blotFiles = (await readdir(BLOT_DIR)).filter(f => f.endsWith('.md') || f.endsWith('.txt'))

  let totalFiles = 0
  let totalCaptions = 0

  for (const blotFile of blotFiles) {
    const slug = blotFilenameToSlug(blotFile)
    const mdxPath = mdxBySlug.get(slug)

    if (!mdxPath) {
      // Try fuzzy match — some slugs differ slightly
      const candidates = [...mdxBySlug.keys()].filter(s =>
        s.includes(slug.slice(0, 20)) || slug.includes(s.slice(0, 20))
      )
      if (candidates.length !== 1) continue
      // Use the single fuzzy match
    }

    const resolvedMdxPath = mdxPath ?? [...mdxBySlug.entries()]
      .find(([s]) => s.includes(slug.slice(0, 20)) || slug.includes(s.slice(0, 20)))?.[1]

    if (!resolvedMdxPath) continue

    const blotContent = await readFile(join(BLOT_DIR, blotFile), 'utf-8')
    const captions = extractCaptions(blotContent)

    if (captions.size === 0) continue

    const mdxRaw = await readFile(resolvedMdxPath, 'utf-8')
    const { content: updated, count } = applyCaptioms(mdxRaw, captions)

    if (count === 0) continue

    console.log(`\n${basename(resolvedMdxPath)} (matched from "${blotFile}")`)
    for (const [ref, cap] of captions) {
      console.log(`  [${ref}]: "${cap}"`)
    }

    if (!DRY_RUN) {
      await writeFile(resolvedMdxPath, updated, 'utf-8')
    }

    totalFiles++
    totalCaptions += count
  }

  console.log(`\n${DRY_RUN ? '[dry run] ' : ''}Done: ${totalCaptions} caption(s) applied to ${totalFiles} file(s)`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
