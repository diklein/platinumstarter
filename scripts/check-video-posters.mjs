#!/usr/bin/env node
/**
 * MEDIA-04 CI gate: fails npm run build when any MDX file in src/content/
 * contains a <video> or <VideoEmbed> element without a poster attribute.
 *
 * Wired into package.json as a prebuild lifecycle script so it runs
 * automatically before `next build` — including on Vercel deploys.
 */

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

const CONTENT_DIR = join(process.cwd(), 'src', 'content')

/**
 * Compute the 1-based line number for a match at `matchIndex` within `content`.
 */
function lineNumberOf(content, matchIndex) {
  return content.slice(0, matchIndex).split('\n').length
}

async function walkMdxFiles(dir) {
  let files = []
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
      // Build the full path from the entry — Node 20+ withFileTypes gives us the path via entry.parentPath
      const parentPath = entry.parentPath ?? entry.path ?? dir
      files.push(join(parentPath, entry.name))
    }
  }
  return files
}

async function main() {
  // Check if content directory exists
  try {
    await stat(CONTENT_DIR)
  } catch {
    console.log('MEDIA-04 check: src/content/ not found — 0 MDX files to scan, passing vacuously.')
    process.exit(0)
  }

  const mdxFiles = await walkMdxFiles(CONTENT_DIR)

  if (mdxFiles.length === 0) {
    console.log('MEDIA-04 check: passed (0 MDX files scanned, 0 violations)')
    process.exit(0)
  }

  const violations = []

  // Regex for native HTML <video ...> elements
  const videoRe = /<video\b([^>]*)>/gi
  // Regex for <VideoEmbed ... /> and <VideoEmbed ...> JSX elements
  const videoEmbedRe = /<VideoEmbed\b([^>]*)\/?\s*>/g

  for (const filePath of mdxFiles) {
    const content = await readFile(filePath, 'utf-8')

    // Check <video> elements
    let match
    videoRe.lastIndex = 0
    while ((match = videoRe.exec(content)) !== null) {
      const attributes = match[1]
      if (!/poster\s*=/i.test(attributes)) {
        const line = lineNumberOf(content, match.index)
        const snippet = match[0].slice(0, 80)
        violations.push({ file: filePath, line, snippet })
      }
    }

    // Check <VideoEmbed> elements
    videoEmbedRe.lastIndex = 0
    while ((match = videoEmbedRe.exec(content)) !== null) {
      const attributes = match[1]
      if (!/poster\s*=/i.test(attributes)) {
        const line = lineNumberOf(content, match.index)
        const snippet = match[0].slice(0, 80)
        violations.push({ file: filePath, line, snippet })
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write('\n')
    process.stderr.write('MEDIA-04 violations found — build blocked.\n')
    process.stderr.write('All video elements must include a poster= attribute.\n\n')
    for (const { file, line, snippet } of violations) {
      // Make the path relative to cwd for readability
      const relativePath = file.replace(process.cwd() + '/', '')
      process.stderr.write(`MEDIA-04 violation: ${relativePath}:${line} — video element missing poster attribute\n`)
      process.stderr.write(`  ${snippet}\n\n`)
    }
    process.exit(1)
  }

  console.log(`MEDIA-04 check: passed (${mdxFiles.length} MDX file${mdxFiles.length === 1 ? '' : 's'} scanned, 0 violations)`)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`MEDIA-04 check: unexpected error — ${err.message}\n`)
  process.exit(1)
})
