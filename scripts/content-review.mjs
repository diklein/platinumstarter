#!/usr/bin/env node
/**
 * Content Review — static MDX checks for CI.
 *
 * Three checks per file:
 *   A. Images with empty or missing alt text (markdown + <img> tags)
 *   B. Incomplete frontmatter (missing required `title` or `date` fields)
 *   C. Broken relative image references (paths that don't resolve on disk)
 *
 * Usage:
 *   node scripts/content-review.mjs [file1.mdx file2.mdx ...]
 *
 * If no files are passed, scans all .mdx files under src/content/.
 * Always exits 0 (advisory — CI reads the report, not the exit code).
 */

import { readdir, readFile, stat, access } from 'fs/promises'
import { join, dirname, resolve, isAbsolute } from 'path'
import matter from 'gray-matter'
import { intelligenceEnabled } from './lib/ai.mjs'

const CWD = process.cwd()
const CONTENT_DIR = join(CWD, 'src', 'content')
const PUBLIC_DIR = join(CWD, 'public')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lineNumberOf(content, matchIndex) {
  return content.slice(0, matchIndex).split('\n').length
}

async function walkMdxFiles(dir) {
  const files = []
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
      const parentPath = entry.parentPath ?? entry.path ?? dir
      files.push(join(parentPath, entry.name))
    }
  }
  return files
}

async function fileExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function relativePath(absPath) {
  return absPath.startsWith(CWD + '/') ? absPath.slice(CWD.length + 1) : absPath
}

// ---------------------------------------------------------------------------
// Check A — Missing alt text
// ---------------------------------------------------------------------------

async function checkAltText(filePath, content) {
  const issues = []

  // Markdown image syntax: ![alt](src)
  const mdImageRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = mdImageRe.exec(content)) !== null) {
    const alt = match[1]
    if (!alt || !alt.trim()) {
      const line = lineNumberOf(content, match.index)
      issues.push({
        file: relativePath(filePath),
        line,
        snippet: match[0].slice(0, 80),
        message: 'add alt text',
      })
    }
  }

  // HTML <img> tags with empty or missing alt attribute
  const imgTagRe = /<img\b([^>]*)>/gi
  while ((match = imgTagRe.exec(content)) !== null) {
    const attrs = match[1]
    const altMatch = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)
    const hasAlt = altMatch && altMatch[1].trim().length > 0
    const hasAltAttr = /\balt\s*=/i.test(attrs)
    if (!hasAlt) {
      const line = lineNumberOf(content, match.index)
      issues.push({
        file: relativePath(filePath),
        line,
        snippet: match[0].slice(0, 80),
        message: hasAltAttr ? 'alt attribute is empty — add descriptive text' : 'add alt attribute',
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Check B — Incomplete frontmatter
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['title', 'date']

async function checkFrontmatter(filePath, content) {
  const issues = []
  let parsed
  try {
    parsed = matter(content)
  } catch (err) {
    issues.push({
      file: relativePath(filePath),
      message: `frontmatter parse error: ${err.message}`,
    })
    return issues
  }

  const missing = REQUIRED_FIELDS.filter((f) => !parsed.data[f])
  if (missing.length > 0) {
    issues.push({
      file: relativePath(filePath),
      message: `missing: ${missing.join(', ')}`,
    })
  }

  return issues
}

// ---------------------------------------------------------------------------
// Check D — Missing or thin SEO description (articles only)
// ---------------------------------------------------------------------------

async function checkSeoDescription(filePath, content) {
  const issues = []
  let parsed
  try {
    parsed = matter(content)
  } catch {
    return issues
  }

  if (parsed.data.type !== 'article') return issues

  const desc = parsed.data.description
  if (!desc || !desc.trim()) {
    issues.push({
      file: relativePath(filePath),
      message: 'missing `description` frontmatter — run generate-seo to auto-generate',
    })
  } else if (desc.trim().length < 50) {
    issues.push({
      file: relativePath(filePath),
      message: `description too short (${desc.trim().length} chars — aim for 150–160)`,
    })
  } else if (desc.trim().length > 160) {
    issues.push({
      file: relativePath(filePath),
      message: `description too long (${desc.trim().length} chars — trim to 160)`,
    })
  }

  return issues
}

// ---------------------------------------------------------------------------
// Check C — Broken relative image refs
// ---------------------------------------------------------------------------

async function checkImageRefs(filePath, content) {
  const issues = []
  const fileDir = dirname(filePath)

  // Collect all image src values (markdown + img tags)
  const srcs = []

  // Markdown: ![alt](src)
  const mdImageRe = /!\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = mdImageRe.exec(content)) !== null) {
    srcs.push({ src: match[1].split(' ')[0], index: match.index }) // strip optional title
  }

  // HTML img tags
  const imgSrcRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  while ((match = imgSrcRe.exec(content)) !== null) {
    srcs.push({ src: match[1], index: match.index })
  }

  for (const { src, index } of srcs) {
    // Skip absolute URLs
    if (/^https?:\/\//i.test(src) || src.startsWith('//')) continue
    // Skip data URIs
    if (src.startsWith('data:')) continue

    const line = lineNumberOf(content, index)
    let resolved = false

    if (isAbsolute(src)) {
      // Absolute path — check relative to public/
      resolved = await fileExists(join(PUBLIC_DIR, src))
    } else {
      // Relative path — check relative to file location first, then src/content/, then public/
      resolved =
        (await fileExists(resolve(fileDir, src))) ||
        (await fileExists(join(CONTENT_DIR, src))) ||
        (await fileExists(join(PUBLIC_DIR, src)))
    }

    if (!resolved) {
      issues.push({
        file: relativePath(filePath),
        line,
        src,
        message: 'image file not found',
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Check E — Typographic marks (added 2026-08-21 after a 590-line corpus cleanup)
//
// Prose must use curly quotes (‘ ’ “ ”), inch/feet measurements primes (″ ′),
// and code must stay straight-ASCII. Flags, per line of prose (code fences,
// inline code, JSX/HTML tags + attribute lines, imports, and URLs excluded):
//   - straight ' or " (typewriter quotes where curly belong)
//   - a curly ” right after a digit (inch mark typed as a quote — use ″)
//   - wrong-direction curly: an opening “ where a closing ” belongs, and vice versa
//   - curly quotes INSIDE inline code or fences (breaks copy-paste — keep code straight)
// ---------------------------------------------------------------------------

async function checkTypography(filePath, content) {
  const issues = []
  const file = relativePath(filePath)
  const lines = content.split('\n')
  let inFence = false
  let inFm = false
  let fmDone = false
  let inTag = false

  const maskProse = (line) =>
    line
      .replace(/`[^`]*`/g, '')
      .replace(/<[^<>]*>/g, '')
      // image/link target incl. an optional quoted title (which may itself hold links,
      // so on image lines everything from ]( onward is target, not prose)
      .replace(/^(!\[[^\]]*\])\(.*$/, '$1')
      .replace(/\]\([^)]*\)/g, '')
      .replace(/https?:\/\/\S+/g, '')

  const push = (line, message, snippet) =>
    issues.push({ file, line, message, snippet: snippet.trim().slice(0, 80) })

  for (let n = 1; n <= lines.length; n++) {
    const raw = lines[n - 1]
    const s = raw.trim()
    if (s === '---' && !fmDone) {
      if (n === 1) inFm = true
      else if (inFm) { inFm = false; fmDone = true }
      continue
    }
    if (s.startsWith('```')) { inFence = !inFence; continue }

    // Code must stay straight: curly quotes in fences or inline code break copy-paste.
    if (inFence) {
      if (/[‘’“”]/.test(raw)) push(n, 'curly quote inside a code fence — code must use straight quotes', raw)
      continue
    }
    for (const m of raw.matchAll(/`[^`]+`/g)) {
      if (/[‘’“”]/.test(m[0])) push(n, 'curly quote inside inline code — code must use straight quotes', m[0])
    }

    if (inFm) {
      const fm = s.match(/^(?:title|description):\s*"(.*)"\s*$/)
      if (fm && fm[1].includes("'")) push(n, "straight apostrophe in frontmatter title/description — use ’", raw)
      continue
    }
    if (/^\s*(import|export)\b/.test(raw)) continue
    if (inTag) { if (raw.includes('>')) inTag = false; continue }
    if (/<[A-Za-z][\w.]*(\s[^<>]*)?$/.test(s)) { inTag = !s.split('<').pop().includes('>'); continue }
    if (/^\s*[A-Za-z][\w-]*=(\{|"[^"]*"\s*(\/?>)?\s*$)/.test(raw)) continue

    const line = maskProse(raw)
    if (/'/.test(line)) push(n, "straight apostrophe/single quote in prose — use ’ (or ′ for feet)", raw)
    for (const m of line.matchAll(/(\d?)"/g)) {
      if (m[1]) push(n, 'straight quote after a digit — inches take a prime: ″', raw)
      else push(n, 'straight double quote in prose — use “ ”', raw)
    }
    // digits + ” reads as an inch mark ONLY when the number isn't itself quoted (“4”, “#365”)
    if (/(^|[^“#\d])\d+(\.\d+)?\s?”/.test(line)) push(n, 'curly ” used as an inch mark — use the prime ″', raw)
    if (/\w[,.;:!?]?“(\s|$)/.test(line)) push(n, 'opening “ where a closing ” belongs', raw)
    if (/(^|\s)”\S/.test(line)) push(n, 'closing ” where an opening “ belongs', raw)
  }

  return issues
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatSection(title, items, formatItem) {
  const icon = items.length === 0 ? '✓' : '✗'
  const label =
    items.length === 0
      ? `${title}: none found`
      : `${title} (${items.length} issue${items.length === 1 ? '' : 's'})`

  let out = `### ${icon} ${label}\n`
  if (items.length > 0) {
    for (const item of items) {
      out += `- ${formatItem(item)}\n`
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!intelligenceEnabled('review')) {
    console.log('content-review: off (intelligence.review is false in site.config.ts); nothing to do')
    return
  }
  // Resolve file list
  let filePaths = process.argv.slice(2).filter((a) => a.endsWith('.mdx') || a.endsWith('.md'))

  if (filePaths.length === 0) {
    // Check if content dir exists
    try {
      await stat(CONTENT_DIR)
    } catch {
      console.log('## Content Review\n\nNo src/content/ directory found — nothing to check.\n\n---\n**Result: 0 issue(s) found**')
      process.exit(0)
    }
    filePaths = await walkMdxFiles(CONTENT_DIR)
  }

  if (filePaths.length === 0) {
    console.log('## Content Review\n\nNo MDX files found.\n\n---\n**Result: 0 issue(s) found**')
    process.exit(0)
  }

  const altIssues = []
  const fmIssues = []
  const refIssues = []
  const seoIssues = []
  const typoIssues = []

  for (const fp of filePaths) {
    const absPath = isAbsolute(fp) ? fp : resolve(CWD, fp)
    let content
    try {
      content = await readFile(absPath, 'utf-8')
    } catch {
      fmIssues.push({ file: relativePath(absPath), message: 'file not readable' })
      continue
    }

    const [a, b, c, d, e] = await Promise.all([
      checkAltText(absPath, content),
      checkFrontmatter(absPath, content),
      checkImageRefs(absPath, content),
      checkSeoDescription(absPath, content),
      checkTypography(absPath, content),
    ])

    altIssues.push(...a)
    fmIssues.push(...b)
    refIssues.push(...c)
    seoIssues.push(...d)
    typoIssues.push(...e)
  }

  const total = altIssues.length + fmIssues.length + refIssues.length + seoIssues.length + typoIssues.length

  const altSection = formatSection(
    'Missing alt text',
    altIssues,
    (i) => `\`${i.file}\` line ${i.line}: \`${i.snippet}\` — ${i.message}`
  )

  const fmSection = formatSection(
    'Incomplete frontmatter',
    fmIssues,
    (i) => `\`${i.file}\` — ${i.message}`
  )

  const refSection = formatSection(
    'Broken image refs',
    refIssues,
    (i) => `\`${i.file}\` line ${i.line}: \`${i.src}\` — ${i.message}`
  )

  const seoSection = formatSection(
    'SEO description',
    seoIssues,
    (i) => `\`${i.file}\` — ${i.message}`
  )

  const typoSection = formatSection(
    'Typographic marks',
    typoIssues,
    (i) => `\`${i.file}\` line ${i.line}: ${i.message} — \`${i.snippet}\``
  )

  const resultLine =
    total === 0
      ? '**Result: all checks passed**'
      : `**Result: ${total} issue(s) found**`

  const report = [
    '## Content Review',
    '',
    altSection,
    fmSection,
    refSection,
    seoSection,
    typoSection,
    '---',
    resultLine,
  ].join('\n')

  console.log(report)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`content-review: unexpected error — ${err.message}\n`)
  process.exit(0) // advisory — never block CI
})
