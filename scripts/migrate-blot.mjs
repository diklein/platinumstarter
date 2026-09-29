#!/usr/bin/env node
/**
 * IMPORT-01: Migrate all the Blot posts from blot/Posts/ to
 * src/content/writing/ as typed MDX. Runs a dry-run table first, awaits
 * human approval, then writes files and copies images to
 * public/images/imported/blot/.
 *
 * Decisions applied: D-01 (full import), D-04 (type heuristic), D-07 (image
 * re-hosting), D-09 (frontmatter shape), D-10 (image path rewrite), D-11
 * (body cleaning), D-20 (slug conflict prevention)
 *
 * Security:  T-08-02-PT (slug → path traversal guard via assertSafeWritePath),
 *            T-08-02-IM (basename-only image copy destination),
 *            T-08-02-OW (existence check before writeMdxFile),
 *            T-08-02-DR (default dry-run + approval prompt),
 *            T-08-02-SC (within-source slug collision → exit 1 before any write)
 *
 * Usage:
 *   npm run migrate-blot                          # dry-run: prints table, prompts
 *   npm run migrate-blot -- --apply               # skips prompt, writes immediately
 *   npm run migrate-blot -- --apply --registry .planning/slug-registry.json
 */

import { createInterface } from 'node:readline'
import fs from 'node:fs'
import { readFile, readdir, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import {
  ask,
  parseBlotDate,
  writeMdxFile,
} from './migration-utils.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOT_POSTS_DIR = path.join(process.cwd(), 'blot', 'Posts')
const BLOT_IMG_SRC = path.join(process.cwd(), 'blot', 'img')
const BLOT_IMG_DEST = path.join(process.cwd(), 'public', 'images', 'imported', 'blot')
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'content', 'writing')

/** D-04: word-count threshold for note vs. article classification */
const WORD_COUNT_THRESHOLD = 150

// ---------------------------------------------------------------------------
// CLI arg parsing (no external library)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const APPLY_MODE = args.includes('--apply')
const REGISTRY_IDX = args.indexOf('--registry')
const REGISTRY_PATH = REGISTRY_IDX !== -1 ? args[REGISTRY_IDX + 1] : null

if (REGISTRY_IDX !== -1 && !REGISTRY_PATH) {
  process.stderr.write('migrate-blot: --registry flag requires a path argument\n')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// parseBlotPost — parse a single blot source file
// ---------------------------------------------------------------------------

/**
 * Parse a blot post file into structured data.
 *
 * Blot files start with optional header lines (`Tags:`, `Date:`, `Slug:`) at the
 * top, then an optional H1 (`# Title`), then body content.
 *
 * The optional `Slug:` header overrides the auto-derived slug — useful when the
 * title contains em-dashes or other characters that produce an undesirable slug.
 *
 * @param {string} filePath  - absolute path to the .md or .txt source file
 * @param {import('node:fs').Stats} fileStat  - fs.stat result for mtime fallback
 * @returns {{ tags: string[], date: string, usedMtimeFallback: boolean,
 *             title: string|null, hasH1: boolean, body: string,
 *             slugOverride: string|null }}
 */
function parseBlotPost(filePath, fileStat) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n')

  // Extract the leading Tags:/Date:/Slug: header lines (contiguous block from top)
  const headerLines = []
  let bodyStartIdx = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('Tags:') || line.startsWith('Date:') || line.startsWith('Slug:')) {
      headerLines.push(line)
      bodyStartIdx = i + 1
    } else if (line.trim() === '' && i === bodyStartIdx) {
      // Allow a single blank separator after headers
      bodyStartIdx = i + 1
    } else {
      break
    }
  }

  // Parse tags: [] when no Tags: line; else split and trim
  const tagsLine = headerLines.find((l) => l.startsWith('Tags:'))
  let tags = []
  if (tagsLine) {
    tags = tagsLine
      .replace(/^Tags:\s*/, '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }

  // Parse Slug: override (optional — overrides auto-derived slug)
  const slugLine = headerLines.find((l) => l.startsWith('Slug:'))
  const slugOverride = slugLine ? slugLine.replace(/^Slug:\s*/, '').trim() || null : null

  // Parse date via shared helper (mtime fallback for the 20 dateless posts)
  const { date, usedMtimeFallback } = parseBlotDate(headerLines, fileStat.mtime)

  // Remaining lines (body + H1)
  const remainingLines = lines.slice(bodyStartIdx)

  // Find H1 — first line starting with '# '
  let title = null
  let hasH1 = false
  let h1LineIdx = -1

  for (let i = 0; i < remainingLines.length; i++) {
    if (remainingLines[i].startsWith('# ')) {
      title = remainingLines[i].replace(/^#\s+/, '').trim()
      hasH1 = true
      h1LineIdx = i
      break
    }
  }

  // Build body: remaining lines minus the H1 line, trim leading/trailing blanks
  const bodyLines = remainingLines.filter((_, i) => i !== h1LineIdx)
  // Trim leading blank lines
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') {
    bodyLines.shift()
  }
  // Trim trailing blank lines
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
    bodyLines.pop()
  }
  const body = bodyLines.join('\n')

  return { tags, date, usedMtimeFallback, title, hasH1, body, slugOverride }
}

// ---------------------------------------------------------------------------
// cleanBlotBody — strip blot-specific div wrappers, collapse excess blank lines
// ---------------------------------------------------------------------------

/**
 * Remove blot-specific HTML wrapper lines from the post body.
 *
 * Strips lines that are opening or closing div tags (any class), keeping the
 * inner content. This handles:
 *   <div class="wide">, <div class="caption">, <div class="spacer8">,
 *   <div class="spacer12">, <div class="center-image">, etc. (Pitfall 7)
 *
 * A safe implementation: remove lines that are solely a div tag (opening or
 * closing) with no additional meaningful content. Inner content (images,
 * text, links) is preserved.
 *
 * Also collapses 3+ consecutive blank lines to 2.
 *
 * @param {string} body
 * @returns {string}
 */
function cleanBlotBody(body) {
  const lines = body.split('\n')
  const cleaned = []

  for (let line of lines) {
    const trimmed = line.trim()

    // Drop lines that are purely an opening div tag: <div class="...">
    // (with nothing else on the line)
    if (/^<div(\s[^>]*)?>$/.test(trimmed)) {
      continue
    }

    // Drop lines that are purely a closing div tag: </div>
    if (/^<\/div>$/.test(trimmed)) {
      continue
    }

    // Handle single-line self-contained divs: <div class="...">content</div>
    // Strip the opening and closing tags, keep the inner content (or drop if empty)
    const singleLineMatch = trimmed.match(/^<div(\s[^>]*)?>(.+?)<\/div>$/)
    if (singleLineMatch) {
      const inner = singleLineMatch[2].trim()
      if (inner) {
        cleaned.push(inner)
      }
      // else it's an empty div — drop entirely
      continue
    }

    // Handle empty self-contained divs: <div class="..."></div>
    if (/^<div(\s[^>]*)?>(<\/div>)?$/.test(trimmed)) {
      continue
    }

    cleaned.push(line)
  }

  // Collapse 3+ consecutive blank lines to 2
  const result = []
  let blankCount = 0
  for (const line of cleaned) {
    if (line.trim() === '') {
      blankCount++
      if (blankCount <= 2) {
        result.push(line)
      }
    } else {
      blankCount = 0
      result.push(line)
    }
  }

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// rewriteBlotImagePaths — rewrite /img/ references to /images/imported/blot/
// ---------------------------------------------------------------------------

/**
 * Rewrite both blot image styles from /img/ to /images/imported/blot/.
 *
 * Style 1 (inline):    ![alt](/img/file.jpg)
 * Style 2 (reference): [image-1]: /img/file.jpg
 *
 * Returns the rewritten body and a Set of referenced image filenames (basenames)
 * so they can be copied to BLOT_IMG_DEST.
 *
 * @param {string} body
 * @returns {{ body: string, imageFiles: Set<string> }}
 */
function rewriteBlotImagePaths(body) {
  /** @type {Set<string>} */
  const imageFiles = new Set()

  // Style 1: inline image — ![alt](/img/file)
  body = body.replace(/!\[([^\]]*)\]\(\/img\/([^)]+)\)/g, (m, alt, file) => {
    imageFiles.add(file)
    return `![${alt}](/images/imported/blot/${file})`
  })

  // Style 2: reference-style link definition — [image-N]: /img/file
  body = body.replace(/^(\[[^\]]+\]):\s*\/img\/(\S+)/gm, (m, ref, file) => {
    imageFiles.add(file)
    return `${ref}: /images/imported/blot/${file}`
  })

  return { body, imageFiles }
}

// ---------------------------------------------------------------------------
// detectBlotType — D-04 heuristic type classification
// ---------------------------------------------------------------------------

/**
 * Detect post type following D-04 heuristics exactly.
 *
 * Priority order:
 * 1. First non-empty body line is a bare URL → 'link'
 * 2. hasH1 && wordCount >= WORD_COUNT_THRESHOLD → 'article'
 * 3. !hasH1 && wordCount < WORD_COUNT_THRESHOLD → 'note'
 * 4. else → 'article' (fallback)
 *
 * @param {{ hasH1: boolean, body: string }} params
 * @returns {'article' | 'note' | 'link'}
 */
function detectBlotType({ hasH1, body }) {
  // Check first non-empty body line for bare URL
  const firstNonEmpty = body.split('\n').find((l) => l.trim() !== '')
  if (firstNonEmpty && /^https?:\/\/\S+$/.test(firstNonEmpty.trim())) {
    return 'link'
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length

  if (!hasH1 && wordCount < WORD_COUNT_THRESHOLD) {
    return 'note'
  }

  // Covers: hasH1 + >= 150 words → article; AND fallback for everything else
  return 'article'
}

// ---------------------------------------------------------------------------
// deriveBlotSlug — filename → slug via github-slugger
// ---------------------------------------------------------------------------

/**
 * Derive a URL-safe slug from the post title (preferred) or filename.
 *
 * Uses a fresh GithubSlugger per call to avoid cross-call disambiguation
 * suffixes — we handle cross-file collisions explicitly via the registry.
 *
 * @param {string} filename   - e.g. "AI-generated Design Systems.md"
 * @param {string|null} title - e.g. "AI-generated Design Systems"
 * @returns {string}          - e.g. "ai-generated-design-systems"
 * @throws {Error} if the resulting slug is empty or invalid
 */
function deriveBlotSlug(filename, title) {
  const input = title && title.trim()
    ? title.trim()
    : filename.replace(/\.(md|txt)$/i, '')

  const slug = new GithubSlugger().slug(input)

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(
      `Could not derive a valid slug from filename "${filename}" (input: "${input}"). ` +
        `Slug must contain only [a-z0-9-] characters.`
    )
  }

  return slug
}

// ---------------------------------------------------------------------------
// printDryRunTable — format and print the pre-approval table
// ---------------------------------------------------------------------------

/**
 * Print a human-readable table of all parsed posts for approval.
 *
 * @param {Array<{
 *   index: number, filename: string, type: string, date: string,
 *   usedMtimeFallback: boolean, slug: string, title: string|null,
 *   hasConflict: boolean, crossConflict: boolean
 * }>} posts
 */
function printDryRunTable(posts) {
  process.stdout.write('\n')
  process.stdout.write('='.repeat(120) + '\n')
  process.stdout.write('migrate-blot: DRY RUN — no files written yet\n')
  process.stdout.write('='.repeat(120) + '\n')
  process.stdout.write(
    `${'#'.padStart(3)}  ` +
    `${'Filename'.padEnd(42)}  ` +
    `${'Type'.padEnd(8)}  ` +
    `${'Date'.padEnd(23)}  ` +
    `${'Slug'.padEnd(42)}  ` +
    `Title\n`
  )
  process.stdout.write('-'.repeat(120) + '\n')

  for (const p of posts) {
    const num = String(p.index).padStart(3, '0')
    const filename = p.filename.padEnd(42)
    const type = p.type.padEnd(8)
    const dateStr = p.usedMtimeFallback
      ? `${p.date} (mtime fallback)`.padEnd(23)
      : p.date.padEnd(23)
    const conflict = p.crossConflict ? ' [CROSS-CONFLICT]' : p.hasConflict ? ' [CONFLICT]' : ''
    const slug = (p.slug + conflict).padEnd(42)
    const title = p.title ? `"${p.title}"` : '—'

    process.stdout.write(
      `[${num}]  ${filename}  ${type}  ${dateStr}  ${slug}  ${title}\n`
    )
  }

  process.stdout.write('='.repeat(120) + '\n')
  process.stdout.write(`Total: ${posts.length} posts\n`)
  const mtimeCount = posts.filter((p) => p.usedMtimeFallback).length
  if (mtimeCount > 0) {
    process.stdout.write(
      `Note: ${mtimeCount} post(s) use file mtime as date fallback (no Date: header)\n`
    )
  }
  process.stdout.write('\n')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // Check blot/Posts/ exists; graceful exit if not
  if (!fs.existsSync(BLOT_POSTS_DIR)) {
    process.stdout.write(
      `migrate-blot: blot/Posts/ not found at ${BLOT_POSTS_DIR}\n` +
        `Nothing to import. Exiting.\n`
    )
    process.exit(0)
  }

  // List .md and .txt files, sorted alphabetically
  const allEntries = await readdir(BLOT_POSTS_DIR)
  const sourceFiles = allEntries
    .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
    .sort()

  if (sourceFiles.length === 0) {
    process.stdout.write('migrate-blot: No .md or .txt files found in blot/Posts/. Exiting.\n')
    process.exit(0)
  }

  process.stdout.write(`migrate-blot: Found ${sourceFiles.length} source files in blot/Posts/\n`)

  // Load cross-source slug registry if --registry was supplied
  let registryData = null
  const registrySlugs = new Set()
  if (REGISTRY_PATH) {
    try {
      const raw = await readFile(REGISTRY_PATH, 'utf-8')
      registryData = JSON.parse(raw)
      if (Array.isArray(registryData.slugs)) {
        for (const s of registryData.slugs) {
          registrySlugs.add(s)
        }
      }
      process.stdout.write(`migrate-blot: Loaded ${registrySlugs.size} slugs from registry ${REGISTRY_PATH}\n`)
    } catch (err) {
      process.stderr.write(`migrate-blot: Could not load registry at ${REGISTRY_PATH}: ${err.message}\n`)
      process.exit(1)
    }
  }

  // Parse all source files
  /** @type {Array<{
   *   index: number, filename: string, type: string, date: string,
   *   usedMtimeFallback: boolean, slug: string, title: string|null,
   *   hasH1: boolean, body: string, imageFiles: Set<string>,
   *   hasConflict: boolean, crossConflict: boolean
   * }>} */
  const posts = []

  for (let i = 0; i < sourceFiles.length; i++) {
    const filename = sourceFiles[i]
    const filePath = path.join(BLOT_POSTS_DIR, filename)
    const fileStat = fs.statSync(filePath)

    const parsed = parseBlotPost(filePath, fileStat)
    const cleaned = cleanBlotBody(parsed.body)
    const { body, imageFiles } = rewriteBlotImagePaths(cleaned)
    const type = detectBlotType({ hasH1: parsed.hasH1, body })
    // Use Slug: header override if present, otherwise auto-derive from title/filename
    const slug = parsed.slugOverride
      ? parsed.slugOverride
      : deriveBlotSlug(filename, parsed.title)

    posts.push({
      index: i + 1,
      filename,
      type,
      date: parsed.date,
      usedMtimeFallback: parsed.usedMtimeFallback,
      slug,
      title: parsed.title,
      hasH1: parsed.hasH1,
      tags: parsed.tags,
      body,
      imageFiles,
      hasConflict: false,
      crossConflict: false,
    })
  }

  // Within-source slug collision detection (T-08-02-SC)
  const slugBuckets = new Map()
  for (const post of posts) {
    if (!slugBuckets.has(post.slug)) {
      slugBuckets.set(post.slug, [])
    }
    slugBuckets.get(post.slug).push(post)
  }
  let hasAnyConflict = false
  for (const [, bucket] of slugBuckets) {
    if (bucket.length > 1) {
      for (const post of bucket) {
        post.hasConflict = true
      }
      hasAnyConflict = true
    }
  }

  // Cross-source conflict detection
  if (REGISTRY_PATH) {
    for (const post of posts) {
      if (registrySlugs.has(post.slug)) {
        post.crossConflict = true
        hasAnyConflict = true
      }
    }
  }

  // Print dry-run table (always printed, even with --apply)
  printDryRunTable(posts)

  // Abort BEFORE prompting if any conflicts exist (T-08-02-SC)
  if (hasAnyConflict) {
    const conflictSlugs = posts
      .filter((p) => p.hasConflict || p.crossConflict)
      .map((p) => `  ${p.filename} → "${p.slug}" ${p.crossConflict ? '[CROSS-CONFLICT]' : '[CONFLICT]'}`)
      .join('\n')
    process.stderr.write(
      `\nmigrate-blot: Slug conflicts detected — aborting before any write.\n` +
        `Resolve the following conflicts by renaming the source files:\n` +
        `${conflictSlugs}\n`
    )
    process.exit(1)
  }

  // Human approval (skipped in --apply mode)
  if (!APPLY_MODE) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let approved = false
    try {
      const answer = await ask(rl, 'Apply migration? [yes/no]: ')
      approved = ['yes', 'y', 'approve'].includes(answer.trim().toLowerCase())
    } finally {
      rl.close()
    }
    if (!approved) {
      process.stdout.write('Aborted — no files written.\n')
      process.exit(0)
    }
  }

  // Write phase: create image destination dir, copy images, write MDX files
  await mkdir(BLOT_IMG_DEST, { recursive: true })

  let importedCount = 0
  let copiedImages = 0
  let skippedCount = 0
  const newSlugs = []

  for (const post of posts) {
    // Existence guard (T-08-02-OW) — skip if MDX already exists
    const targetPath = path.join(OUTPUT_DIR, `${post.slug}.mdx`)
    if (fs.existsSync(targetPath)) {
      process.stderr.write(
        `migrate-blot: SKIP — file already exists: src/content/writing/${post.slug}.mdx\n`
      )
      skippedCount++
      continue
    }

    // Copy referenced images (warn if source missing — T-08-02-IM)
    for (const imageFile of post.imageFiles) {
      // Use only the BASENAME to prevent any traversal via image filenames
      const basename = path.basename(imageFile)
      const srcPath = path.join(BLOT_IMG_SRC, basename)
      const destPath = path.join(BLOT_IMG_DEST, basename)

      if (!fs.existsSync(srcPath)) {
        process.stderr.write(
          `migrate-blot: WARNING — image not found in blot/img/: ${basename} (referenced in ${post.filename})\n`
        )
        continue
      }

      try {
        await copyFile(srcPath, destPath)
        copiedImages++
      } catch (err) {
        process.stderr.write(
          `migrate-blot: WARNING — failed to copy image ${basename}: ${err.message}\n`
        )
      }
    }

    // Write MDX file via shared helper (handles path traversal guard + existence check)
    try {
      await writeMdxFile({
        slug: post.slug,
        date: post.date,
        type: post.type,
        title: post.hasH1 ? post.title : undefined,
        tags: post.tags,
        body: post.body,
        expectedDir: OUTPUT_DIR,
      })
      process.stdout.write(`migrate-blot: Imported → src/content/writing/${post.slug}.mdx\n`)
      importedCount++
      newSlugs.push(post.slug)
    } catch (err) {
      if (/already exists/i.test(err.message)) {
        process.stderr.write(
          `migrate-blot: SKIP — ${post.slug}.mdx already exists (detected at write time)\n`
        )
        skippedCount++
      } else {
        throw err
      }
    }
  }

  // Update cross-source slug registry if --registry was supplied
  if (REGISTRY_PATH && newSlugs.length > 0) {
    const existing = registryData?.slugs ?? []
    const updated = [...new Set([...existing, ...newSlugs])]
    const fs2 = await import('node:fs/promises')
    await fs2.writeFile(
      REGISTRY_PATH,
      JSON.stringify({ slugs: updated }, null, 2) + '\n',
      'utf-8'
    )
    process.stdout.write(
      `migrate-blot: Registry updated at ${REGISTRY_PATH} (${newSlugs.length} slugs added)\n`
    )
  }

  // Summary
  process.stdout.write(
    `\nmigrate-blot: Done — Imported ${importedCount} posts, copied ${copiedImages} images, ` +
      `${skippedCount} skipped (existing), 0 conflicts.\n`
  )
}

// ---------------------------------------------------------------------------
// Inline self-test runner (synthetic inputs only — does NOT touch real files)
// Run BEFORE main() so --self-test mode exits without starting the real migration.
// ---------------------------------------------------------------------------

if (process.argv.includes('--self-test')) {
  const { strict: assert } = await import('node:assert')
  const os = await import('node:os')

  let passed = 0
  let failed = 0

  function test(name, fn) {
    try {
      fn()
      process.stdout.write(`PASS: ${name}\n`)
      passed++
    } catch (err) {
      process.stderr.write(`FAIL: ${name} — ${err.message}\n`)
      failed++
    }
  }

  // Test 2: header parsing
  test('Test 2 (header parsing): Tags, Date, H1, body, no mtime fallback', () => {
    // Write a synthetic file to a temp location and parse it
    const os2 = os
    const tmpDir = os2.tmpdir()
    const tmpFile = path.join(tmpDir, '__migrate-blot-test2.md')
    const content = 'Tags: a, b, c\nDate: January 28, 2026\n# Title\n\nBody.'
    fs.writeFileSync(tmpFile, content, 'utf-8')
    const stat = fs.statSync(tmpFile)
    const result = parseBlotPost(tmpFile, stat)
    fs.unlinkSync(tmpFile)

    assert.deepStrictEqual(result.tags, ['a', 'b', 'c'], `tags: ${JSON.stringify(result.tags)}`)
    assert.equal(result.date, '2026-01-28', `date: ${result.date}`)
    assert.equal(result.title, 'Title', `title: ${result.title}`)
    assert.equal(result.body, 'Body.', `body: "${result.body}"`)
    assert.equal(result.usedMtimeFallback, false, `usedMtimeFallback: ${result.usedMtimeFallback}`)
  })

  // Test 3: mtime fallback
  test('Test 3 (mtime fallback): no Date: header → usedMtimeFallback true', () => {
    const tmpDir = os.tmpdir()
    const tmpFile = path.join(tmpDir, '__migrate-blot-test3.md')
    const content = 'Tags: Newsletter\n# Title\n\nSome body text here.'
    fs.writeFileSync(tmpFile, content, 'utf-8')
    const stat = fs.statSync(tmpFile)
    const result = parseBlotPost(tmpFile, stat)
    fs.unlinkSync(tmpFile)
    assert.equal(result.usedMtimeFallback, true, `expected mtime fallback`)
    // date should be today's date (or close to it)
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result.date), `date shape: ${result.date}`)
  })

  // Test 4: Tags missing → tags === []
  test('Test 4 (Tags missing): no Tags: line → tags === []', () => {
    const tmpDir = os.tmpdir()
    const tmpFile = path.join(tmpDir, '__migrate-blot-test4.md')
    const content = 'Date: January 28, 2026\n# Title\n\nBody.'
    fs.writeFileSync(tmpFile, content, 'utf-8')
    const stat = fs.statSync(tmpFile)
    const result = parseBlotPost(tmpFile, stat)
    fs.unlinkSync(tmpFile)
    assert.deepStrictEqual(result.tags, [], `expected [], got ${JSON.stringify(result.tags)}`)
  })

  // Test 5: type detection
  test('Test 5a (type: article): hasH1 + body >= 150 words → article', () => {
    const body = 'word '.repeat(160).trim()
    const result = detectBlotType({ hasH1: true, body })
    assert.equal(result, 'article', `expected article, got ${result}`)
  })

  test('Test 5b (type: link): no H1, first body line is bare URL → link', () => {
    const body = 'https://example.com\n\nSome other text.'
    const result = detectBlotType({ hasH1: false, body })
    assert.equal(result, 'link', `expected link, got ${result}`)
  })

  test('Test 5c (type: note): no H1, body < 150 words → note', () => {
    const body = 'Short body text with fewer than 150 words.'
    const result = detectBlotType({ hasH1: false, body })
    assert.equal(result, 'note', `expected note, got ${result}`)
  })

  test('Test 5d (type: article fallback): no H1, body >= 150 words → article', () => {
    const body = 'word '.repeat(160).trim()
    const result = detectBlotType({ hasH1: false, body })
    assert.equal(result, 'article', `expected article (fallback), got ${result}`)
  })

  // Test 6: image path rewrites
  test('Test 6a (inline image rewrite): ![alt](/img/file.jpg) → /images/imported/blot/', () => {
    const body = '![a cat](/img/cat.jpg)'
    const { body: out, imageFiles } = rewriteBlotImagePaths(body)
    assert.ok(out.includes('![a cat](/images/imported/blot/cat.jpg)'), `inline rewrite: ${out}`)
    assert.ok(imageFiles.has('cat.jpg'), `imageFiles missing cat.jpg`)
  })

  test('Test 6b (reference image rewrite): [image-1]: /img/file.jpg → /images/imported/blot/', () => {
    const body = '[image-1]: /img/oda-backpack.jpg'
    const { body: out, imageFiles } = rewriteBlotImagePaths(body)
    assert.ok(
      out.includes('[image-1]: /images/imported/blot/oda-backpack.jpg'),
      `reference rewrite: ${out}`
    )
    assert.ok(imageFiles.has('oda-backpack.jpg'), `imageFiles missing oda-backpack.jpg`)
  })

  test('Test 6c (both styles): body with both styles has both rewritten', () => {
    const body = '![alt](/img/a.jpg)\n\n![][image-1]\n\n[image-1]: /img/b.jpg'
    const { body: out, imageFiles } = rewriteBlotImagePaths(body)
    assert.ok(out.includes('/images/imported/blot/a.jpg'), `inline not rewritten: ${out}`)
    assert.ok(out.includes('/images/imported/blot/b.jpg'), `reference not rewritten: ${out}`)
    assert.ok(imageFiles.has('a.jpg'), 'missing a.jpg')
    assert.ok(imageFiles.has('b.jpg'), 'missing b.jpg')
  })

  // Test 7: div wrapper stripping
  test('Test 7a (div strip: wide): <div class="wide"> and </div> removed, inner survives', () => {
    const body = '<div class="wide">\n![alt](/img/x.jpg)\n</div>'
    const out = cleanBlotBody(body)
    assert.ok(!out.includes('<div'), `div tag should be removed: ${out}`)
    assert.ok(!out.includes('</div'), `closing div should be removed: ${out}`)
    assert.ok(out.includes('![alt](/img/x.jpg)'), `inner content should survive: ${out}`)
  })

  test('Test 7b (div strip: caption)', () => {
    const body = '<div class="caption">Caption text</div>'
    const out = cleanBlotBody(body)
    assert.ok(!out.includes('<div'), `div tag should be removed: ${out}`)
    assert.ok(out.includes('Caption text'), `inner content should survive: ${out}`)
  })

  test('Test 7c (div strip: spacer8)', () => {
    const body = 'Before\n<div class="spacer8"></div>\nAfter'
    const out = cleanBlotBody(body)
    assert.ok(!out.includes('spacer8'), `spacer div should be removed: ${out}`)
    assert.ok(out.includes('Before'), `content before survives: ${out}`)
    assert.ok(out.includes('After'), `content after survives: ${out}`)
  })

  test('Test 7d (div strip: spacer12)', () => {
    const body = 'Before\n<div class="spacer12"></div>\nAfter'
    const out = cleanBlotBody(body)
    assert.ok(!out.includes('spacer12'), `spacer12 div should be removed: ${out}`)
  })

  test('Test 7e (div strip: center-image)', () => {
    const body = '<div class="center-image">\n![][image-1]\n</div>'
    const out = cleanBlotBody(body)
    assert.ok(!out.includes('<div'), `div tag should be removed: ${out}`)
    assert.ok(out.includes('![][image-1]'), `inner image survives: ${out}`)
  })

  // Test 8: header strip — body must not contain Tags:, Date:, or H1 lines
  test('Test 8 (header strip): Tags:, Date:, # Title not in body', () => {
    const tmpDir = os.tmpdir()
    const tmpFile = path.join(tmpDir, '__migrate-blot-test8.md')
    const content = 'Tags: Foo\nDate: January 1, 2025\n# My Post Title\n\nBody text here.'
    fs.writeFileSync(tmpFile, content, 'utf-8')
    const stat = fs.statSync(tmpFile)
    const result = parseBlotPost(tmpFile, stat)
    fs.unlinkSync(tmpFile)
    assert.ok(!result.body.includes('Tags:'), `body should not contain Tags: — "${result.body}"`)
    assert.ok(!result.body.includes('Date:'), `body should not contain Date: — "${result.body}"`)
    assert.ok(!result.body.includes('# My Post Title'), `body should not contain H1 — "${result.body}"`)
  })

  // Test 9: slug derivation
  test('Test 9 (slug): "AI-generated Design Systems.md" → valid slug', () => {
    const slug = deriveBlotSlug('AI-generated Design Systems.md', 'AI-generated Design Systems')
    assert.ok(/^[a-z0-9-]+$/.test(slug), `slug invalid: "${slug}"`)
    assert.equal(slug, 'ai-generated-design-systems', `expected ai-generated-design-systems, got ${slug}`)
  })

  test('Test 9b (slug): empty/whitespace title falls back to filename', () => {
    const slug = deriveBlotSlug('My Great Post.md', null)
    assert.ok(/^[a-z0-9-]+$/.test(slug), `slug invalid: "${slug}"`)
  })

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
  process.exit(0)
} else {
  // Normal execution: run the migration
  main().catch((err) => {
    process.stderr.write(`migrate-blot: unexpected error — ${err.message}\n`)
    process.exit(1)
  })
}
