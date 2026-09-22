#!/usr/bin/env node
/**
 * IMPORT-03: Tumblr selective-import migration script.
 *
 * Reads Tumblr/posts.zip in-memory via adm-zip, filters out reblogs (D-06),
 * groups remaining original posts by year, presents a numbered selection list,
 * and — on user selection — writes MDX files to src/content/writing/ and copies
 * referenced images from Tumblr/media/ to public/images/imported/tumblr/.
 *
 * Implements: IMPORT-03
 * Decisions: D-02, D-05, D-06, D-07, D-08, D-12, D-20
 * Security: T-08-03-PT (slug/path guard), T-08-03-IM (image copy guard),
 *           T-08-03-MP (.mp4 filter), T-08-03-RB (reblog filter),
 *           T-08-03-ZS (zip slip prevention), T-08-03-OW (existence guard)
 *
 * Usage:
 *   npm run migrate-tumblr                        # interactive
 *   npm run migrate-tumblr -- --self-test         # unit test runner (offline)
 *   npm run migrate-tumblr -- --apply --select all
 *   npm run migrate-tumblr -- --apply --select "2011-2013"
 *   npm run migrate-tumblr -- --apply --select "1,3,5"
 *   npm run migrate-tumblr -- --apply --select "2014"
 *   npm run migrate-tumblr -- --registry /path/to/slug-registry.json
 */

import { createInterface } from 'node:readline'
import fs from 'node:fs'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {
  ask,
  createSlugRegistry,
  htmlToMarkdown,
  polishMarkdown,
  writeMdxFile,
} from './migration-utils.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZIP_PATH = path.join(process.cwd(), 'Tumblr', 'posts.zip')
const MEDIA_SRC = path.join(process.cwd(), 'Tumblr', 'media')
const MEDIA_DEST = path.join(process.cwd(), 'public', 'images', 'imported', 'tumblr')
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'content', 'writing')
const WORD_COUNT_THRESHOLD = 150

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const SELF_TEST = args.includes('--self-test')

function getArgValue(flag) {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const SELECT_SPEC = getArgValue('--select')
const REGISTRY_PATH = getArgValue('--registry')

// ---------------------------------------------------------------------------
// Reblog detector (D-06 + RESEARCH.md Pattern 3 reblog heuristic)
// ---------------------------------------------------------------------------

/**
 * Detect whether an HTML string represents a Tumblr reblog.
 *
 * A reblog contains `<a href="http[s]://[username].tumblr.com/post/...">username</a>:`
 * immediately followed by `<blockquote`. The trailing colon after the closing `</a>`
 * is the key marker that distinguishes a reblog attribution from a plain link.
 *
 * @param {string} rawHtml
 * @returns {boolean}
 */
function isReblog(rawHtml) {
  const REBLOG_PATTERN =
    /<a\s+href="https?:\/\/[a-z0-9-]+\.tumblr\.com\/post\/[^"]+">[^<]+<\/a>:\s*<blockquote/i
  return REBLOG_PATTERN.test(rawHtml)
}

// ---------------------------------------------------------------------------
// Footer extractor (D-12)
// ---------------------------------------------------------------------------

/**
 * Extract the footer block from raw Tumblr post HTML.
 *
 * Returns:
 *   - date: ISO 8601 date string (YYYY-MM-DD) or null if unparseable
 *   - tags: array of tag strings (trimmed)
 *   - htmlMinusFooter: the HTML with the entire footer div removed
 *
 * @param {string} rawHtml
 * @returns {{ date: string|null, tags: string[], htmlMinusFooter: string }}
 */
function extractFooter(rawHtml) {
  // Match the footer div (lazy inner match)
  const footerMatch = rawHtml.match(/<div\s+id="footer">([\s\S]*?)<\/div>/i)

  let date = null
  let tags = []
  let htmlMinusFooter = rawHtml

  if (footerMatch) {
    const footerBlock = footerMatch[0]
    const footerInner = footerMatch[1]

    // Extract timestamp
    const tsMatch = footerInner.match(/<span\s+id="timestamp">([\s\S]*?)<\/span>/i)
    if (tsMatch) {
      date = parseTumblrTimestamp(tsMatch[1])
    }

    // Extract tags: all <span class="tag">...</span>
    const tagRegex = /<span\s+class="tag">([\s\S]*?)<\/span>/gi
    let tagMatch
    while ((tagMatch = tagRegex.exec(footerInner)) !== null) {
      const tag = tagMatch[1].trim()
      if (tag) tags.push(tag)
    }

    // Remove footer block from HTML
    htmlMinusFooter = rawHtml.replace(footerBlock, '')
  }

  return { date, tags, htmlMinusFooter }
}

// ---------------------------------------------------------------------------
// Timestamp parser (Pitfall 4 — ordinal suffix stripping)
// ---------------------------------------------------------------------------

/**
 * Parse a Tumblr natural-language timestamp to ISO 8601 date (YYYY-MM-DD).
 *
 * Tumblr timestamps look like: " September 15th, 2011 2:57pm "
 * The ordinal suffix (th/st/nd/rd) causes Date.parse() to return NaN —
 * strip it first.
 *
 * @param {string} raw  — raw timestamp string from <span id="timestamp">
 * @returns {string|null}  — "YYYY-MM-DD" or null on failure
 */
function parseTumblrTimestamp(raw) {
  if (!raw || !raw.trim()) return null
  // Strip ordinal suffix (Pitfall 4): "15th" → "15", "1st" → "1", etc.
  let cleaned = raw.trim().replace(/(\d+)(st|nd|rd|th)\b/, '$1')
  // Normalize am/pm: "2:57pm" → "2:57 pm" (JS Date parser needs the space)
  cleaned = cleaned.replace(/(\d)(am|pm)\b/i, '$1 $2')
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }
  return null
}

// ---------------------------------------------------------------------------
// Media reference extractor (D-08)
// ---------------------------------------------------------------------------

/**
 * Extract all media references (src and href) from raw Tumblr HTML.
 * Buckets results into images (non-.mp4) and videos (.mp4).
 * Only matches the relative ../../media/ path pattern.
 *
 * @param {string} rawHtml
 * @returns {{ images: string[], videos: string[] }}
 */
function extractMediaRefs(rawHtml) {
  const mediaPattern = /(?:src|href)="\.\.\/\.\.\/media\/([^"]+)"/gi
  const images = new Set()
  const videos = new Set()

  let match
  while ((match = mediaPattern.exec(rawHtml)) !== null) {
    const filename = match[1]
    if (filename.toLowerCase().endsWith('.mp4')) {
      videos.add(filename)
    } else {
      images.add(filename)
    }
  }

  return { images: [...images], videos: [...videos] }
}

// ---------------------------------------------------------------------------
// Type detector (D-05)
// ---------------------------------------------------------------------------

/**
 * Detect the post type based on cleaned HTML content.
 *
 * Rules (D-05):
 *   - Contains <img> tag → "photo"
 *   - No <img>, word count < WORD_COUNT_THRESHOLD → "note"
 *   - No <img>, word count >= WORD_COUNT_THRESHOLD → "article"
 *
 * Image src rewriting is applied BEFORE this call so we work on cleaned HTML.
 *
 * @param {string} cleanedHtml  — HTML with footer and mp4 refs already removed
 * @returns {'photo'|'note'|'article'}
 */
function detectTumblrType(cleanedHtml) {
  if (/<img\b/i.test(cleanedHtml)) return 'photo'

  const wordCount = cleanedHtml
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

  return wordCount < WORD_COUNT_THRESHOLD ? 'note' : 'article'
}

// ---------------------------------------------------------------------------
// Body cleaner: rewrite media src and strip mp4 img tags (D-07, D-08)
//
// APPROACH: src attribute rewriting is applied to raw HTML before calling
// htmlToMarkdown. This ensures the parse5 img converter sees the final
// /images/imported/tumblr/<file> paths in the src attribute.
// ---------------------------------------------------------------------------

/**
 * Rewrite image src paths from ../../media/<file> → /images/imported/tumblr/<file>
 * for non-.mp4 files. Strip <img> tags whose src points to .mp4 (defensive).
 *
 * @param {string} html  — HTML with footer already removed
 * @returns {string}
 */
/**
 * A body whose markup arrived entity-encoded (`&lt;p&gt;Quote&lt;/p&gt;`, as quote and chat
 * posts sometimes do in a real export) is decoded once, so the tags are tags again. A body
 * with real tags is left alone: a stray `&lt;` in prose stays text.
 */
function decodeEncodedMarkup(html) {
  // Any encoded tag with attributes or a closing pair is markup, not prose about markup
  // ("answer" posts encode the asker's link; quote posts encode whole paragraphs).
  const encodedTags = (html.match(/&lt;(?:a href=|\/?(?:p|br|em|strong|b|i|blockquote|ul|ol|li|h[1-6])&gt;)/gi) || []).length
  if (encodedTags === 0) return html
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function rewriteMediaSrc(html) {
  // Strip <img> tags pointing at .mp4 (defensive — Tumblr rarely does this)
  let result = html.replace(/<img\s[^>]*src="[^"]*\.mp4"[^>]*\/?>/gi, '')

  // Rewrite ../../media/<file> src attributes (non-mp4) to /images/imported/tumblr/<file>
  result = result.replace(
    /src="\.\.\/\.\.\/media\/([^"]+)"/gi,
    (match, filename) => {
      if (filename.toLowerCase().endsWith('.mp4')) return '' // strip mp4 src entirely
      return `src="/images/imported/tumblr/${filename}"`
    }
  )

  // Strip href="../../media/*.mp4" links (defensive)
  result = result.replace(/href="\.\.\/\.\.\/media\/[^"]*\.mp4"/gi, 'href=""')

  return result
}

// ---------------------------------------------------------------------------
// Selection parser
// ---------------------------------------------------------------------------

/**
 * Parse a selection specification string into a Set of indices (0-based).
 *
 * Supported formats:
 *   "all"            → all posts
 *   "2011-2013"      → all posts in years 2011, 2012, 2013
 *   "2014"           → all posts in year 2014
 *   "1,3,5"          → posts at 1-based indices 1, 3, 5 (shown to user)
 *   ""               → empty set (cancel)
 *
 * @param {string} spec
 * @param {Record<string, Array>} byYear   — { year: [post, ...] }
 * @param {Array} indexMap                 — flat ordered array of posts (index 0 = user sees [1])
 * @returns {Set<number>}  — 0-based indices into indexMap
 */
function parseSelection(spec, byYear, indexMap) {
  const trimmed = spec.trim()
  if (!trimmed) return new Set()

  if (trimmed.toLowerCase() === 'all') {
    return new Set(indexMap.map((_, i) => i))
  }

  // Year range: "2011-2013"
  const yearRangeMatch = trimmed.match(/^(\d{4})-(\d{4})$/)
  if (yearRangeMatch) {
    const startYear = parseInt(yearRangeMatch[1], 10)
    const endYear = parseInt(yearRangeMatch[2], 10)
    const result = new Set()
    indexMap.forEach((post, i) => {
      const y = parseInt(post.date.slice(0, 4), 10)
      if (y >= startYear && y <= endYear) result.add(i)
    })
    return result
  }

  // Single year: "2014"
  const singleYearMatch = trimmed.match(/^(\d{4})$/)
  if (singleYearMatch) {
    const year = trimmed
    const result = new Set()
    indexMap.forEach((post, i) => {
      if (post.date.slice(0, 4) === year) result.add(i)
    })
    return result
  }

  // Comma-separated 1-based indices: "1,3,5"
  const result = new Set()
  for (const part of trimmed.split(',')) {
    const n = parseInt(part.trim(), 10)
    if (!isNaN(n) && n >= 1 && n <= indexMap.length) {
      result.add(n - 1) // convert to 0-based
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Cross-source registry helpers (D-20)
// ---------------------------------------------------------------------------

/**
 * Load a JSON slug registry from disk (if --registry path provided).
 * Returns the parsed object or empty object on failure.
 *
 * @param {string|null} registryPath
 * @returns {Record<string, true>}
 */
function loadRegistry(registryPath) {
  if (!registryPath) return {}
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Write the registry object back to disk.
 *
 * @param {string|null} registryPath
 * @param {Record<string, true>} registry
 */
function saveRegistry(registryPath, registry) {
  if (!registryPath) return
  try {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
  } catch (err) {
    process.stderr.write(`migrate-tumblr: warning — could not save registry: ${err.message}\n`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ----------------------------------------------------------------
  // Vacuous-pass guard
  // ----------------------------------------------------------------
  if (!fs.existsSync(ZIP_PATH)) {
    process.stderr.write(`migrate-tumblr: Tumblr/posts.zip not found at ${ZIP_PATH}\n`)
    process.exit(1)
  }

  // ----------------------------------------------------------------
  // Read zip entries
  // ----------------------------------------------------------------
  const zip = new AdmZip(ZIP_PATH)
  const htmlEntries = zip
    .getEntries()
    .filter(
      (e) => e.entryName.startsWith('html/') && e.entryName.endsWith('.html')
    )

  let reblogCount = 0
  let videoOnlyCount = 0
  let noDateCount = 0
  const selectable = []

  for (const entry of htmlEntries) {
    const rawHtml = entry.getData().toString('utf-8')
    const postId = path.basename(entry.name, '.html')

    // Filter 1: skip reblogs (D-06)
    if (isReblog(rawHtml)) {
      reblogCount++
      continue
    }

    // Extract footer (timestamp + tags) and get HTML minus footer
    const { date, tags, htmlMinusFooter } = extractFooter(rawHtml)

    // Filter 2: skip posts with no parseable date
    if (!date) {
      noDateCount++
      process.stderr.write(
        `migrate-tumblr: skipping ${postId} — unparseable timestamp\n`
      )
      continue
    }

    // Extract media references from original HTML (before footer removal)
    const { images, videos } = extractMediaRefs(rawHtml)

    // Filter 3: skip video-only posts (D-08)
    if (images.length === 0 && videos.length > 0) {
      videoOnlyCount++
      continue
    }

    // Build cleaned HTML (footer removed, src paths rewritten). Quote and chat posts in a
    // real export can carry their body entity-encoded (`&lt;p&gt;` in the text), which
    // would come out as literal "<p>" on the page; one decode pass restores the markup.
    const cleanedHtml = decodeEncodedMarkup(rewriteMediaSrc(htmlMinusFooter))

    // Detect type (D-05)
    let type = detectTumblrType(cleanedHtml)

    // Convert to Markdown. A text post's title arrives as the body's first h1; it belongs in
    // the frontmatter (the page renders it), and a titled post is an article, not a note.
    let body = htmlToMarkdown(cleanedHtml).trim()
    let title
    const lead = body.match(/^# (.+)\n+/)
    if (lead) {
      title = lead[1].trim()
      body = body.slice(lead[0].length)
      if (type === 'note') type = 'article'
    }
    body = polishMarkdown(body).markdown.trim()

    // Slug: tumblr-<postId> (RESEARCH.md Code Examples)
    const slug = `tumblr-${postId}`

    selectable.push({ slug, postId, date, type, tags, title, body, images })
  }

  // Sort selectable by date ascending
  selectable.sort((a, b) => a.date.localeCompare(b.date))

  // ----------------------------------------------------------------
  // Group by year
  // ----------------------------------------------------------------
  /** @type {Record<string, typeof selectable>} */
  const byYear = {}
  for (const post of selectable) {
    const year = post.date.slice(0, 4)
    byYear[year] = byYear[year] || []
    byYear[year].push(post)
  }

  const totalOriginal = selectable.length
  process.stdout.write(
    `\nFound ${totalOriginal} original posts (skipped ${reblogCount} reblogs, ` +
      `${videoOnlyCount} video-only, ${noDateCount} missing-date). Grouping by year:\n`
  )

  // Build flat index map for selection
  const indexMap = []
  for (const year of Object.keys(byYear).sort()) {
    process.stdout.write(`\n${year}:\n`)
    for (const post of byYear[year]) {
      const idx = indexMap.length + 1
      const preview = post.body.replace(/\n/g, ' ').slice(0, 60)
      process.stdout.write(`  [${idx}] ${post.date} — ${preview}\n`)
      indexMap.push(post)
    }
  }

  // ----------------------------------------------------------------
  // Selection: --select flag (non-interactive) or interactive prompt
  // ----------------------------------------------------------------
  let selectedIndices

  if (SELECT_SPEC !== null) {
    selectedIndices = parseSelection(SELECT_SPEC, byYear, indexMap)
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const rawSelection = await ask(
      rl,
      '\nEnter numbers (e.g. 1,3,5), year ranges (2011-2013), single year (2014), or \'all\' (or blank to cancel): '
    )
    rl.close()
    selectedIndices = parseSelection(rawSelection, byYear, indexMap)
  }

  if (selectedIndices.size === 0) {
    process.stdout.write('Aborted — no files written.\n')
    process.exit(0)
  }

  // ----------------------------------------------------------------
  // Load cross-source registry (D-20)
  // ----------------------------------------------------------------
  const diskRegistry = loadRegistry(REGISTRY_PATH)
  const slugReg = createSlugRegistry()

  // Pre-seed registry from disk
  for (const slug of Object.keys(diskRegistry)) {
    slugReg.register(slug, 'tumblr')
  }

  // ----------------------------------------------------------------
  // Write selected posts
  // ----------------------------------------------------------------
  await mkdir(MEDIA_DEST, { recursive: true })

  let writtenCount = 0
  let skippedCount = 0
  let imagesCopied = 0

  for (const idx of [...selectedIndices].sort((a, b) => a - b)) {
    const post = indexMap[idx]
    if (!post) continue

    // Cross-source slug registration (D-20)
    const finalSlug = slugReg.register(post.slug, 'tumblr')

    // Existence guard (T-08-03-OW): skip if already written
    const existingPath = path.join(OUTPUT_DIR, `${finalSlug}.mdx`)
    if (fs.existsSync(existingPath)) {
      process.stderr.write(
        `migrate-tumblr: skipping ${finalSlug} — file already exists\n`
      )
      skippedCount++
      continue
    }

    // Copy images (D-07, T-08-03-IM)
    for (const imageFile of post.images) {
      // Security: only use basename — never allow path traversal via zip entry (T-08-03-IM)
      const safeBasename = path.basename(imageFile)
      const srcPath = path.join(MEDIA_SRC, safeBasename)
      const destPath = path.join(MEDIA_DEST, safeBasename)

      if (!fs.existsSync(srcPath)) {
        process.stderr.write(
          `migrate-tumblr: warning — source image not found: ${srcPath}\n`
        )
        continue
      }

      if (!fs.existsSync(destPath)) {
        try {
          await copyFile(srcPath, destPath)
          imagesCopied++
        } catch (err) {
          process.stderr.write(
            `migrate-tumblr: warning — could not copy ${safeBasename}: ${err.message}\n`
          )
        }
      }
    }

    // Write MDX file (T-08-03-PT, T-08-03-OW via writeMdxFile)
    try {
      const rel = await writeMdxFile({
        slug: finalSlug,
        date: post.date,
        type: post.type,
        title: post.title,
        tags: post.tags,
        body: post.body,
        expectedDir: OUTPUT_DIR,
      })
      process.stdout.write(`Created: ${rel}\n`)
      writtenCount++
    } catch (err) {
      process.stderr.write(
        `migrate-tumblr: error writing ${finalSlug}: ${err.message}\n`
      )
    }
  }

  // ----------------------------------------------------------------
  // Save updated cross-source registry (D-20)
  // ----------------------------------------------------------------
  if (REGISTRY_PATH) {
    const updatedRegistry = {}
    for (const slug of slugReg.all()) {
      updatedRegistry[slug] = true
    }
    saveRegistry(REGISTRY_PATH, updatedRegistry)
  }

  // ----------------------------------------------------------------
  // Status summary
  // ----------------------------------------------------------------
  process.stdout.write(
    `\nDone. Written: ${writtenCount}, skipped (existing): ${skippedCount}, ` +
      `images copied: ${imagesCopied}.\n`
  )
}

// ---------------------------------------------------------------------------
// Inline self-test runner (--self-test)
// Covers behaviors 2, 3, 5, 6, 7, 8, 10 against synthetic in-memory inputs.
// Behaviors 1, 11, 14 require the real zip/filesystem — exercised by Plan 05.
// ---------------------------------------------------------------------------

if (SELF_TEST) {
  const { strict: assert } = await import('node:assert')

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

  // ---------------------------------------------------------------------------
  // Test 2: Reblog detection
  // ---------------------------------------------------------------------------
  test('Test 2a (isReblog): http reblog pattern → true', () => {
    const reblogHtml =
      '<div class="caption"><p><a href="http://randallb.tumblr.com/post/10249550013">randallb</a>: <blockquote><p>body</p></blockquote></div>'
    assert.ok(isReblog(reblogHtml), 'expected isReblog to return true')
  })

  test('Test 2b (isReblog): https reblog pattern → true', () => {
    const reblogHtml =
      '<a href="https://someuser.tumblr.com/post/123456">someuser</a>: <blockquote>'
    assert.ok(isReblog(reblogHtml), 'expected isReblog to return true for https')
  })

  test('Test 2c (isReblog): plain text with tumblr link but no blockquote → false', () => {
    const normalHtml =
      '<p>Check out <a href="http://randallb.tumblr.com/post/123">this post</a>.</p>'
    assert.ok(!isReblog(normalHtml), 'expected isReblog to return false for plain link')
  })

  test('Test 2d (isReblog): no tumblr link at all → false', () => {
    const normalHtml = '<p>Wine tasting in Healdsburg.</p>'
    assert.ok(!isReblog(normalHtml), 'expected isReblog to return false for normal post')
  })

  // ---------------------------------------------------------------------------
  // Test 3: Timestamp parsing (ordinal suffix — Pitfall 4)
  // ---------------------------------------------------------------------------
  test('Test 3a (parseTumblrTimestamp): September 15th, 2011 → 2011-09-15', () => {
    const result = parseTumblrTimestamp(' September 15th, 2011 2:57pm ')
    assert.equal(result, '2011-09-15', `expected 2011-09-15, got ${result}`)
  })

  test('Test 3b (parseTumblrTimestamp): April 25th, 2009 → 2009-04-25', () => {
    const result = parseTumblrTimestamp(' April 25th, 2009 12:10pm ')
    assert.equal(result, '2009-04-25', `expected 2009-04-25, got ${result}`)
  })

  test('Test 3c (parseTumblrTimestamp): 1st → stripped correctly', () => {
    const result = parseTumblrTimestamp('January 1st, 2012 10:00am')
    assert.equal(result, '2012-01-01', `expected 2012-01-01, got ${result}`)
  })

  test('Test 3d (parseTumblrTimestamp): empty → null', () => {
    const result = parseTumblrTimestamp('   ')
    assert.equal(result, null, `expected null for empty input, got ${result}`)
  })

  test('Test 3e (parseTumblrTimestamp): unparseable → null', () => {
    const result = parseTumblrTimestamp('not a date at all')
    assert.equal(result, null, `expected null for invalid date, got ${result}`)
  })

  // ---------------------------------------------------------------------------
  // Test 5: Type detection (D-05)
  // ---------------------------------------------------------------------------
  test('Test 5a (detectTumblrType): body with <img> → photo', () => {
    const html = '<p><img src="/images/imported/tumblr/foo.jpg"/></p><p>Caption here.</p>'
    assert.equal(detectTumblrType(html), 'photo')
  })

  test('Test 5b (detectTumblrType): short text-only → note', () => {
    const html = '<p>Wine tasting in Healdsburg for the day. Sweet.</p>'
    assert.equal(detectTumblrType(html), 'note')
  })

  test('Test 5c (detectTumblrType): long text-only ≥150 words → article', () => {
    // Generate > 150 words
    const wordList = Array(160).fill('word').join(' ')
    const html = `<p>${wordList}</p>`
    assert.equal(detectTumblrType(html), 'article')
  })

  test('Test 5d (detectTumblrType): exactly 149 words → note', () => {
    const wordList = Array(149).fill('word').join(' ')
    const html = `<p>${wordList}</p>`
    assert.equal(detectTumblrType(html), 'note')
  })

  // ---------------------------------------------------------------------------
  // Test 6: Media filter for .mp4 (D-08)
  // ---------------------------------------------------------------------------
  test('Test 6a (extractMediaRefs): img → images, mp4 → videos', () => {
    const html =
      '<img src="../../media/photo.jpg"/><a href="../../media/clip.mp4">video</a>'
    const { images, videos } = extractMediaRefs(html)
    assert.ok(images.includes('photo.jpg'), `expected photo.jpg in images: ${images}`)
    assert.ok(videos.includes('clip.mp4'), `expected clip.mp4 in videos: ${videos}`)
    assert.ok(!images.includes('clip.mp4'), 'mp4 should not appear in images')
  })

  test('Test 6b (extractMediaRefs): src mp4 → videos bucket', () => {
    const html = '<img src="../../media/video.mp4"/>'
    const { images, videos } = extractMediaRefs(html)
    assert.ok(videos.includes('video.mp4'), `expected video.mp4 in videos: ${videos}`)
    assert.equal(images.length, 0, `images should be empty: ${images}`)
  })

  test('Test 6c (rewriteMediaSrc): strips mp4 img tags', () => {
    const html = '<img src="../../media/video.mp4"/><img src="../../media/photo.jpg"/>'
    const cleaned = rewriteMediaSrc(html)
    assert.ok(!cleaned.includes('.mp4'), `mp4 img should be stripped: ${cleaned}`)
    assert.ok(cleaned.includes('/images/imported/tumblr/photo.jpg'), `jpg should be rewritten: ${cleaned}`)
  })

  // ---------------------------------------------------------------------------
  // Test 7: Image path rewrite (D-07, D-12)
  // ---------------------------------------------------------------------------
  test('Test 7 (rewriteMediaSrc + htmlToMarkdown): ../../media/file.jpg → /images/imported/tumblr/file.jpg in markdown', () => {
    const html = '<p><img src="../../media/file.jpg"/></p>'
    const cleaned = rewriteMediaSrc(html)
    const markdown = htmlToMarkdown(cleaned)
    assert.ok(
      markdown.includes('![](/images/imported/tumblr/file.jpg)'),
      `expected rewritten path in markdown, got: ${markdown}`
    )
    assert.ok(!markdown.includes('../../media/'), `should not contain original path: ${markdown}`)
  })

  // ---------------------------------------------------------------------------
  // Test 8: Tag extraction
  // ---------------------------------------------------------------------------
  test('Test 8 (extractFooter): tags extracted from footer span.tag elements', () => {
    const html = `<body>
      <p>Some post content.</p>
      <div id="footer">
        <span id="timestamp"> September 15th, 2011 2:57pm </span>
        <span class="tag">apple</span>
        <span class="tag">apple tv</span>
      </div>
    </body>`
    const { tags, date, htmlMinusFooter } = extractFooter(html)
    assert.deepEqual(tags, ['apple', 'apple tv'], `expected ['apple','apple tv'], got ${JSON.stringify(tags)}`)
    assert.equal(date, '2011-09-15', `expected date 2011-09-15, got ${date}`)
    assert.ok(!htmlMinusFooter.includes('id="footer"'), 'footer should be removed from htmlMinusFooter')
  })

  test('Test 8b (extractFooter): no tags → empty array', () => {
    const html = `<body>
      <p>Just text.</p>
      <div id="footer">
        <span id="timestamp"> April 25th, 2009 12:10pm </span>
      </div>
    </body>`
    const { tags } = extractFooter(html)
    assert.deepEqual(tags, [], `expected empty tags, got ${JSON.stringify(tags)}`)
  })

  // ---------------------------------------------------------------------------
  // Test 9: Footer stripping (content of Test 8 covers this too — explicit check)
  // ---------------------------------------------------------------------------
  test('Test 9 (footer stripping): markdown body does not contain timestamp or tag spans', () => {
    const html = `<body>
      <p>Wine tasting in Healdsburg.</p>
      <div id="footer">
        <span id="timestamp"> April 25th, 2009 12:10pm </span>
        <span class="tag">wine</span>
      </div>
    </body>`
    const { htmlMinusFooter } = extractFooter(html)
    const cleaned = rewriteMediaSrc(htmlMinusFooter)
    const markdown = htmlToMarkdown(cleaned)
    assert.ok(!markdown.includes('April 25th'), `timestamp should not appear in markdown: ${markdown}`)
    assert.ok(!markdown.includes('class="tag"'), `tag spans should not appear in markdown: ${markdown}`)
    assert.ok(markdown.includes('Wine tasting'), `post body should appear in markdown: ${markdown}`)
  })

  // ---------------------------------------------------------------------------
  // Test 10: Slug derivation
  // ---------------------------------------------------------------------------
  test('Test 10 (slug derivation): html/10252308677.html → tumblr-10252308677', () => {
    const entryName = 'html/10252308677.html'
    const postId = path.basename(entryName, '.html')
    const slug = `tumblr-${postId}`
    assert.equal(slug, 'tumblr-10252308677', `got: ${slug}`)
    assert.ok(/^[a-z0-9-]+$/.test(slug), `slug must be [a-z0-9-]+: ${slug}`)
  })

  test('Test 10b (slug derivation): html/100073596.html → tumblr-100073596', () => {
    const entryName = 'html/100073596.html'
    const postId = path.basename(entryName, '.html')
    const slug = `tumblr-${postId}`
    assert.equal(slug, 'tumblr-100073596', `got: ${slug}`)
    assert.ok(/^[a-z0-9-]+$/.test(slug), `slug must be [a-z0-9-]+: ${slug}`)
  })

  // ---------------------------------------------------------------------------
  // Test: parseSelection
  // ---------------------------------------------------------------------------
  test('Test (parseSelection): "all" selects all posts', () => {
    const mockByYear = { '2011': [{ date: '2011-09-15' }, { date: '2011-10-01' }] }
    const mockIndexMap = [{ date: '2011-09-15' }, { date: '2011-10-01' }]
    const result = parseSelection('all', mockByYear, mockIndexMap)
    assert.equal(result.size, 2)
    assert.ok(result.has(0))
    assert.ok(result.has(1))
  })

  test('Test (parseSelection): "1,3" selects indices 0 and 2 (1-based → 0-based)', () => {
    const mockIndexMap = [
      { date: '2011-09-15' },
      { date: '2011-10-01' },
      { date: '2012-01-01' },
    ]
    const result = parseSelection('1,3', {}, mockIndexMap)
    assert.equal(result.size, 2)
    assert.ok(result.has(0))
    assert.ok(result.has(2))
    assert.ok(!result.has(1))
  })

  test('Test (parseSelection): "2011-2012" selects posts in that year range', () => {
    const mockIndexMap = [
      { date: '2010-05-01' },
      { date: '2011-09-15' },
      { date: '2012-03-01' },
      { date: '2013-01-01' },
    ]
    const result = parseSelection('2011-2012', {}, mockIndexMap)
    assert.equal(result.size, 2)
    assert.ok(!result.has(0)) // 2010 excluded
    assert.ok(result.has(1))  // 2011 included
    assert.ok(result.has(2))  // 2012 included
    assert.ok(!result.has(3)) // 2013 excluded
  })

  test('Test (parseSelection): "2014" selects only posts in 2014', () => {
    const mockIndexMap = [
      { date: '2013-12-31' },
      { date: '2014-03-01' },
      { date: '2014-11-15' },
      { date: '2015-01-01' },
    ]
    const result = parseSelection('2014', {}, mockIndexMap)
    assert.equal(result.size, 2)
    assert.ok(!result.has(0))
    assert.ok(result.has(1))
    assert.ok(result.has(2))
    assert.ok(!result.has(3))
  })

  test('Test (parseSelection): blank → empty set (cancel)', () => {
    const result = parseSelection('', {}, [{ date: '2011-01-01' }])
    assert.equal(result.size, 0)
  })

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (!SELF_TEST) {
  main().catch((err) => {
    process.stderr.write(`migrate-tumblr: unexpected error — ${err.message}\n`)
    process.exit(1)
  })
}
