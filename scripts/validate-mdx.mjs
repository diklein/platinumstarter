#!/usr/bin/env node
/**
 * IMPORT-04 dry-run MDX validator.
 *
 * Validates all .mdx files in src/content/writing/ by:
 *   1. Checking required frontmatter fields (slug, date, type) — D-13
 *   2. Compiling each file's content through @mdx-js/mdx compile() — D-13
 *   3. Asserting slug uniqueness across all files — D-20
 *
 * Exits 0 when all files are valid.
 * Exits 1 when any file fails validation or a duplicate slug is detected.
 *
 * Usage: npm run validate-mdx
 *
 * CRITICAL (Pitfall 5): gray-matter strips frontmatter BEFORE compile() is called.
 * Passing the raw file to compile() causes "Unexpected character '-'" on every file.
 */

import { compile } from '@mdx-js/mdx'
import matter from 'gray-matter'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const CONTENT_DIR = join(process.cwd(), 'src', 'content', 'writing')

/**
 * Recursively walk dir and return all .mdx file paths.
 * Mirrors check-video-posters.mjs lines 22–38.
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkMdxFiles(dir) {
  let files = []
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    // Underscore-prefixed files are scaffolding (the shipped drafts/_placeholder.mdx), never
    // posts; the loader in src/lib/posts.ts skips them the same way.
    if (entry.isFile() && entry.name.endsWith('.mdx') && !entry.name.startsWith('_')) {
      const parentPath = entry.parentPath ?? entry.path ?? dir
      files.push(join(parentPath, entry.name))
    }
  }
  return files
}

async function main() {
  // Vacuous-pass guard — if writing/ doesn't exist, there's nothing to validate
  try {
    await stat(CONTENT_DIR)
  } catch {
    process.stdout.write(
      'validate-mdx: src/content/writing/ not found — 0 MDX files to validate, passing.\n'
    )
    process.exit(0)
  }

  const files = await walkMdxFiles(CONTENT_DIR)

  if (files.length === 0) {
    process.stdout.write('validate-mdx: 0 MDX files found — passing vacuously.\n')
    process.exit(0)
  }

  /** @type {Array<{ file: string, error: string }>} */
  const errors = []

  /** @type {Map<string, string[]>} slug → list of filenames (for duplicate detection) */
  const slugMap = new Map()

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf-8')

    // gray-matter strips the YAML frontmatter block so compile() receives clean MDX
    const { data, content } = matter(raw)

    // Relative path for readable error messages
    const rel = filePath.replace(process.cwd() + '/', '')

    // Validate required frontmatter fields
    const missing = ['slug', 'date', 'type'].filter((k) => !data[k])
    if (missing.length > 0) {
      errors.push({ file: rel, error: `Missing fields: ${missing.join(', ')}` })
      continue
    }

    // Compile MDX content — MUST pass content (not raw) per Pitfall 5
    try {
      await compile(content, { development: false })
    } catch (err) {
      errors.push({ file: rel, error: err.message })
    }

    // Track slugs for duplicate detection (D-20)
    const slug = String(data.slug)
    if (!slugMap.has(slug)) {
      slugMap.set(slug, [])
    }
    slugMap.get(slug).push(rel)
  }

  // Slug uniqueness check — duplicates within the same source are caught here
  for (const [slug, fileList] of slugMap) {
    if (fileList.length > 1) {
      errors.push({
        file: fileList.join(', '),
        error: `Duplicate slug: "${slug}" found in ${fileList.join(' and ')}`,
      })
    }
  }

  // Report results
  if (errors.length > 0) {
    process.stderr.write(
      `\nMDX validation failed: ${errors.length} error(s)\n\n`
    )
    for (const { file, error } of errors) {
      process.stderr.write(`  ${file}: ${error}\n`)
    }
    process.stderr.write('\n')
    process.exit(1)
  }

  process.stdout.write(`MDX validation passed (${files.length} files)\n`)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`validate-mdx: unexpected error — ${err.message}\n`)
  process.exit(1)
})
