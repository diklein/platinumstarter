/**
 * Shared helper module for the three migration scripts (migrate-blot.mjs,
 * migrate-tumblr.mjs) and the six template importers
 * under scripts/import/ (wordpress, ghost, substack, medium, markdown, feed),
 * which share the runner, the WXR parser, and the HTML-to-Markdown converter
 * defined in the second half of this file. See docs/import.md.
 *
 * Supports: IMPORT-01, IMPORT-02, IMPORT-03, IMPORT-04
 * Security:  T-08-01-PT (path traversal guard), T-08-01-OW (overwrite prevention),
 *            T-08-01-SI (title sanitization), D-20 (cross-source slug registry)
 *
 * Usage: import { ask, createSlugRegistry, assertSafeWritePath,
 *                  parseBlotDate, htmlToMarkdown, writeMdxFile }
 *          from './migration-utils.mjs'
 *
 * This file also doubles as a test runner when invoked directly:
 *   node scripts/migration-utils.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseFragment, serialize } from 'parse5'
import GithubSlugger from 'github-slugger'

// ---------------------------------------------------------------------------
// ask (D-12, readline helper — mirrors new-post.mjs lines 28–30)
// ---------------------------------------------------------------------------

/**
 * Wrap rl.question in a Promise so callers can use async/await.
 * Callers are responsible for trimming the returned value where needed.
 *
 * @param {import('node:readline').Interface} rl
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

// ---------------------------------------------------------------------------
// createSlugRegistry (D-20 — cross-source slug disambiguation)
// ---------------------------------------------------------------------------

/**
 * Create a cross-source slug registry.
 *
 * Returns an object with:
 *   register(rawSlug, sourceSuffix) → string  — registers the slug and returns
 *     the (potentially disambiguated) final slug. First registration of a slug
 *     returns rawSlug unchanged; subsequent collisions append -<sourceSuffix>,
 *     then -<sourceSuffix>-2, -<sourceSuffix>-3, etc.
 *   has(slug) → boolean  — true if the slug is already in the registry.
 *   all() → Set<string>  — all registered slugs.
 *
 * Supports: D-20 (cross-source slug conflict prevention)
 *
 * @returns {{ register: (rawSlug: string, sourceSuffix: string) => string,
 *             has: (slug: string) => boolean,
 *             all: () => Set<string> }}
 */
export function createSlugRegistry() {
  /** @type {Set<string>} */
  const registered = new Set()

  return {
    register(rawSlug, sourceSuffix) {
      if (!registered.has(rawSlug)) {
        registered.add(rawSlug)
        return rawSlug
      }
      // First suffix attempt
      let candidate = `${rawSlug}-${sourceSuffix}`
      if (!registered.has(candidate)) {
        registered.add(candidate)
        return candidate
      }
      // Numeric disambiguation
      let n = 2
      while (registered.has(`${candidate}-${n}`)) {
        n++
      }
      const final = `${candidate}-${n}`
      registered.add(final)
      return final
    },

    has(slug) {
      return registered.has(slug)
    },

    all() {
      return new Set(registered)
    },
  }
}

// ---------------------------------------------------------------------------
// assertSafeWritePath (T-08-01-PT — path traversal guard)
// ---------------------------------------------------------------------------

/**
 * Validate slug and compute a safe absolute write path within expectedDir.
 *
 * Steps:
 *   1. Validate slug matches /^[a-z0-9-]+$/ (T-08-01-PT, mirrors new-post.mjs lines 56–63)
 *   2. Join with expectedDir and resolve to absolute path
 *   3. Assert the resolved path starts with path.resolve(expectedDir) + path.sep
 *      (prevents path traversal like ../etc/passwd)
 *
 * @param {string} slug   — must be [a-z0-9-] only
 * @param {string} expectedDir  — absolute path to the allowed directory
 * @returns {string} resolved absolute path (slug + '.mdx' under expectedDir)
 * @throws {Error} if slug is invalid or path escapes expectedDir
 */
export function assertSafeWritePath(slug, expectedDir) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": must contain only [a-z0-9-] characters.`
    )
  }

  const filename = `${slug}.mdx`
  const joined = path.join(expectedDir, filename)
  const resolved = path.resolve(joined)
  const allowedPrefix = path.resolve(expectedDir) + path.sep

  if (!resolved.startsWith(allowedPrefix)) {
    throw new Error(
      `Path traversal detected: resolved path "${resolved}" is outside the expected directory "${expectedDir}".`
    )
  }

  return resolved
}

// ---------------------------------------------------------------------------
// parseBlotDate (IMPORT-01 — Blot Date header parsing with ordinal stripping)
// ---------------------------------------------------------------------------

/**
 * Parse a Blot-style `Date:` header line into an ISO 8601 date string.
 *
 * Blot dates look like:
 *   "Date: January 28, 2026"
 *   "Date: September 9th, 2020"
 *
 * Ordinal suffixes (st, nd, rd, th) are stripped before parsing.
 * When no Date: header is found AND mtimeFallback is provided, the fallback
 * date is returned with usedMtimeFallback = true.
 * When neither is available, throws.
 *
 * Supports: IMPORT-01, Pitfall 1 (20 blot posts without a Date header),
 *           Pitfall 4 (ordinal timestamp parsing)
 *
 * @param {string[]} headerLines  — all header lines from the top of a blot file
 * @param {Date|undefined} [mtimeFallback]  — file modification time as fallback
 * @returns {{ date: string, usedMtimeFallback: boolean }}
 * @throws {Error} if no date can be determined
 */
export function parseBlotDate(headerLines, mtimeFallback) {
  const dateLine = headerLines.find((l) => l.startsWith('Date:'))

  if (dateLine) {
    const rawDate = dateLine.replace(/^Date:\s*/, '').trim()
    // Strip ordinal suffixes: "9th" → "9", "1st" → "1", "22nd" → "22"
    const cleaned = rawDate.replace(/(\d+)(st|nd|rd|th)\b/, '$1')
    const parsed = new Date(cleaned)
    if (!isNaN(parsed.getTime())) {
      return { date: parsed.toISOString().slice(0, 10), usedMtimeFallback: false }
    }
  }

  if (mtimeFallback instanceof Date && !isNaN(mtimeFallback.getTime())) {
    return {
      date: mtimeFallback.toISOString().slice(0, 10),
      usedMtimeFallback: true,
    }
  }

  throw new Error(
    `Could not determine date from header lines and no valid mtimeFallback provided.`
  )
}

// ---------------------------------------------------------------------------
// htmlToMarkdown (IMPORT-02, IMPORT-03 — parse5-based HTML-to-Markdown converter)
// ---------------------------------------------------------------------------

/**
 * Convert an HTML fragment string to Markdown using parse5.
 *
 * parse5 handles full HTML entity decoding (&amp; → &, &#8220; → ", etc.)
 * automatically during parsing.
 *
 * Supported tags: #text, #comment, p, strong, b, em, i, a, img, blockquote,
 *   h1, h2, h3, ul, ol, li, br, div (strip wrapper per Pitfall 7), and a
 *   fallthrough that returns inner text.
 *
 * Post-processing: trims result and collapses 3+ consecutive newlines to 2.
 *
 * Supports: IMPORT-02 (Squarespace), IMPORT-03 (Tumblr), Pattern 5, Pitfall 7
 *
 * @param {string} htmlFragment
 * @returns {string}
 */
/** A figure caption as the plain text an image title can hold: links and emphasis to words. */
function plainCaption(md) {
  return (md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fixes every importer's markdown needs, applied outside fenced code:
 *   - `<script>` elements go (a widget embed in a Ghost markdown card, a gist on Medium);
 *     MDX would treat them as JSX and the reader gets nothing either way.
 *   - A hard break at the end of a block (`<br>` before `</p>`) would print a literal
 *     backslash; the break is dropped.
 *   - Headings are demoted one level when the body uses `#`: the page renders the title as
 *     the only h1, and the site's posts use h2 and h3 (Substack's editor writes h1 for
 *     "Heading 1").
 * Returns the markdown and a list of notes for the run's log.
 */
/** `![alt](src)` and `![alt](src "title")`: group 1 is the src. */
export const IMAGE_REF_RE = /!\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"(?:[^"\\]|\\.)*")?\)/g

export function polishMarkdown(md) {
  const notes = []
  const parts = md.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m)
  const prose = parts.filter((_, i) => i % 2 === 0)
  const demote = prose.some((p) => /^# /m.test(p))
  let scripts = 0
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part
    let p = part.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<script\b[^>]*\/>/gi, () => { scripts++; return '' })
    // A hard break with nothing before it on the line (`> \`, `   \` inside a list item: a
    // <br> that opened a block or doubled another) is a break from nothing to nothing.
    p = p.replace(/^([ \t]*(?:>[ ]?)*)\\[ \t]*\n/gm, '$1\n')
    // A run of them (`<br><br></p>`) is one block end.
    p = p.replace(/(?:\\[ \t]*\n)+(?=[ \t]*\n|$)/g, '\n').replace(/(?:\\[ \t]*\n?)+$/, '')
    if (demote) p = p.replace(/^(#{1,5}) /gm, '#$1 ')
    return p
  })
  if (scripts) notes.push(`${scripts} <script> element${scripts === 1 ? '' : 's'} dropped (nothing a static page could run)`)
  if (demote) notes.push('headings demoted one level: the body used h1, which is the title on this site')
  return { markdown: out.join(''), notes }
}

export function htmlToMarkdown(htmlFragment) {
  const doc = parseFragment(htmlFragment)
  const raw = convertNodes(doc.childNodes, { depth: 0 })
  // Trim trailing whitespace per line (an all-space line between two blocks would otherwise
  // defeat the newline collapse below), then collapse 3+ consecutive newlines to exactly 2.
  return raw
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}

/** Block-level tags whose own output already carries paragraph breaks. */
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'figure',
  'hr', 'table', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'dl', 'details', 'iframe', 'video', 'audio', 'img', 'li', 'tr', 'figcaption',
])

/**
 * @param {import('parse5').ChildNode[]} nodes
 * @param {{ depth: number, pre?: boolean }} ctx
 * @returns {string}
 */
function convertNodes(nodes, ctx) {
  return (nodes || []).reduce((acc, node) => acc + convertNode(node, ctx), '')
}

/** Raw text of a node and its descendants, whitespace untouched (for pre/code). */
function textContent(node) {
  if (node.nodeName === '#text') return node.value
  if (node.nodeName === '#comment') return ''
  if (node.nodeName === 'br') return '\n'
  const kids = node.nodeName === 'template' ? node.content?.childNodes : node.childNodes
  return (kids || []).map(textContent).join('')
}

function findDescendant(node, name) {
  for (const child of node.childNodes || []) {
    if (child.nodeName === name) return child
    const deep = findDescendant(child, name)
    if (deep) return deep
  }
  return null
}

function attrOf(node, name) {
  return (node.attrs || []).find((a) => a.name === name)?.value || ''
}

/**
 * Wrap inline content in a marker, hoisting edge whitespace outside the markers so
 * `<strong> bold </strong>` becomes ` **bold** ` rather than the invalid `** bold **`.
 */
function wrapInline(mark, inner, close = mark) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m || !m[2]) return inner
  return m[1] + mark + m[2] + close + m[3]
}

/** Text that is safe as MDX prose: braces and tag-openers would otherwise be parsed as JSX. */
export function escapeMdxText(text) {
  // Every `<` in prose: MDX reads `<` as the start of JSX unless it is followed by
  // whitespace, and `x <= y` in a sentence fails the compile ("Unexpected character `=`").
  return text.replace(/[{}]/g, '\\$&').replace(/<(?!\s)/g, '\\<')
}

/**
 * @param {import('parse5').ChildNode} node
 * @param {{ depth: number, pre?: boolean }} ctx
 * @returns {string}
 */
function convertNode(node, ctx) {
  if (node.nodeName === '#text') {
    if (ctx.pre) return node.value
    // Source HTML is often pretty-printed: newlines and runs of spaces inside a paragraph
    // are one space in the rendered page, so they are one space here too.
    return escapeMdxText(node.value.replace(/\s+/g, ' '))
  }
  if (node.nodeName === '#comment') return ''
  if (node.nodeName === 'template') return convertNodes(node.content?.childNodes, ctx)

  const attr = (name) => attrOf(node, name)

  switch (node.nodeName) {
    case 'script':
    case 'style':
    case 'noscript':
    case 'head':
    case 'source':
    case 'track':
    case 'param':
    case 'svg':
      return ''
    case 'pre': {
      const codeChild = findDescendant(node, 'code')
      const classes = `${attr('class')} ${codeChild ? attrOf(codeChild, 'class') : ''}`
      const lang =
        classes.match(/(?:language|lang|brush|highlight)[-:_ ]([A-Za-z0-9#+_-]+)/)?.[1] ||
        attr('data-lang') || attr('data-language') || attr('lang') || ''
      const code = textContent(node).replace(/^\n+|\s+$/g, '')
      const fence = code.includes('```') ? '~~~~' : '```'
      return `\n\n${fence}${lang.toLowerCase()}\n${code}\n${fence}\n\n`
    }
    case 'code': {
      if (ctx.pre) return textContent(node)
      const code = textContent(node).replace(/\s+/g, ' ')
      if (!code.trim()) return ''
      const ticks = code.includes('`') ? '``' : '`'
      return wrapInline(ticks, code)
    }
  }

  const inner = convertNodes(node.childNodes || [], ctx)

  switch (node.nodeName) {
    case 'p': {
      const text = inner.trim()
      return text ? '\n\n' + text + '\n\n' : ''
    }
    // Markdown has no superscript or subscript; the inline tag is MDX-legal and the site
    // styles it (footnote numbers from Substack, chemical formulas, ordinals).
    case 'sup':
    case 'sub': {
      const text = inner.trim()
      return text ? `<${node.nodeName}>${text}</${node.nodeName}>` : ''
    }
    case 'strong':
    case 'b':
      return wrapInline('**', inner)
    case 'em':
    case 'i':
      return wrapInline('_', inner)
    case 'del':
    case 's':
    case 'strike':
      return wrapInline('~~', inner)
    case 'a': {
      const href = attr('href')
      const text = inner.trim()
      if (!href) return inner
      if (!text) return href
      // An image linked to itself (Substack's "click to enlarge", a CMS's full-size link)
      // is one image, not a link: the site's lightbox already enlarges.
      const img = text.match(/^!\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)$/)
      if (img && (img[1] === href || mediaBasename(img[1]) === mediaBasename(href))) return text
      return '[' + inner + '](' + href + ')'
    }
    case 'img': {
      // Alt text is plain text: a tag that reached an attribute (autop paragraphing a
      // newline inside alt="…", a CMS that stored markup there) is not part of it.
      const alt = attr('alt').replace(/<[^>]*>/g, ' ').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim()
      const src = attr('src') || attr('data-src') || attr('data-original') || attr('data-lazy-src')
      if (!src) return ''
      return alt ? `![${alt}](${src})` : `![](${src})`
    }
    case 'figure': {
      // Image + caption: the caption becomes the paragraph after the image (the site's own
      // caption convention) and doubles as the alt text when the image has none.
      const img = findDescendant(node, 'img')
      const caption = findDescendant(node, 'figcaption')
      const captionText = caption ? convertNodes(caption.childNodes, ctx).trim() : ''
      if (!img) {
        // Embed or quote figures: their children already converted; caption follows.
        const body = convertNodes(
          (node.childNodes || []).filter((n) => n.nodeName !== 'figcaption'), ctx
        ).trim()
        return body ? `\n\n${body}\n\n${captionText ? captionText + '\n\n' : ''}` : ''
      }
      const src = attrOf(img, 'src') || attrOf(img, 'data-src') || attrOf(img, 'data-original')
      if (!src) return captionText ? `\n\n${captionText}\n\n` : ''
      const alt = (attrOf(img, 'alt') || captionText).replace(/<[^>]*>/g, ' ').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim()
      const link = findDescendant(node, 'a')
      const href = link && !findDescendant(link, 'figcaption') ? attrOf(link, 'href') : ''
      // The site's caption convention is the image title: `![alt](src "|caption")`. The
      // leading pipe says "caption, not a layout keyword" (src/components/mdx/img.tsx). A
      // paragraph after the image would render as body text, not as a caption. Captions are
      // plain text there, so inline links and emphasis are reduced to their words.
      const captionTitle = plainCaption(captionText)
      const image = `![${alt}](${src}${captionTitle ? ` "|${captionTitle.replace(/"/g, '\\"')}"` : ''})`
      const wrapped = href && href !== src && !/^https?:\/\/[^/]*(?:medium|substack)/.test(href) ? `[${image}](${href})` : image
      return `\n\n${wrapped}\n\n`
    }
    case 'figcaption':
      return '\n\n' + inner.trim() + '\n\n'
    case 'blockquote': {
      const body = inner.trim().replace(/\n{3,}/g, '\n\n')
      if (!body) return ''
      return '\n\n' + body.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n') + '\n\n'
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = inner.trim().replace(/\n+/g, ' ')
      return text ? `\n\n${'#'.repeat(Number(node.nodeName[1]))} ${text}\n\n` : ''
    }
    case 'ul':
    case 'ol': {
      const ordered = node.nodeName === 'ol'
      const start = Number(attr('start')) || 1
      const items = (node.childNodes || []).filter((n) => n.nodeName === 'li')
      if (items.length === 0) return inner
      const lines = items.map((li, i) => {
        const marker = ordered ? `${start + i}. ` : '- '
        const pad = ' '.repeat(marker.length)
        const body = convertNodes(li.childNodes, { ...ctx, depth: ctx.depth + 1 })
          .replace(/[ \t]+\n/g, '\n')
          .trim()
          .replace(/\n{3,}/g, '\n\n')
        return marker + body.split('\n').map((l, j) => (j === 0 ? l : l ? pad + l : '')).join('\n')
      })
      return '\n\n' + lines.join('\n') + '\n\n'
    }
    case 'li':
      // A stray li outside any list keeps the old behaviour.
      return '- ' + inner.trim() + '\n'
    case 'dt':
      return '\n\n**' + inner.trim() + '**\n\n'
    case 'dd':
      return '\n\n' + inner.trim() + '\n\n'
    case 'hr':
      return '\n\n---\n\n'
    case 'br':
      return '\\\n'
    case 'table': {
      const rows = []
      const walk = (n) => {
        for (const child of n.childNodes || []) {
          if (child.nodeName === 'tr') rows.push(child)
          else if (['thead', 'tbody', 'tfoot'].includes(child.nodeName)) walk(child)
        }
      }
      walk(node)
      if (rows.length === 0) return inner
      const cells = rows.map((tr) =>
        (tr.childNodes || [])
          .filter((c) => c.nodeName === 'td' || c.nodeName === 'th')
          .map((c) => convertNodes(c.childNodes, ctx).replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|'))
      )
      const width = Math.max(...cells.map((r) => r.length))
      const pad = (r) => [...r, ...Array(width - r.length).fill('')]
      const line = (r) => '| ' + pad(r).join(' | ') + ' |'
      const [head, ...body] = cells
      return '\n\n' + [line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n') + '\n\n'
    }
    case 'iframe':
    case 'embed': {
      const src = attr('src')
      return src ? `\n\n${src}\n\n` : ''
    }
    case 'video':
    case 'audio': {
      const source = findDescendant(node, 'source')
      const src = attr('src') || (source ? attrOf(source, 'src') : '')
      return src ? `\n\n${src}\n\n` : inner
    }
    case 'div':
    case 'section':
    case 'article':
    case 'header':
    case 'footer':
    case 'main':
    case 'aside':
    case 'nav':
    case 'details':
    case 'summary':
    case 'dl': {
      // Strip the wrapper, keep the children (Pitfall 7: blot custom divs). A wrapper whose
      // children are all inline gets its own paragraph so div-soup does not glue into one line.
      const hasBlockChild = (node.childNodes || []).some((n) => BLOCK_TAGS.has(n.nodeName))
      if (hasBlockChild || !inner.trim()) return inner
      return '\n\n' + inner.trim() + '\n\n'
    }
    default:
      return inner
  }
}

// ---------------------------------------------------------------------------
// writeMdxFile (T-08-01-OW, T-08-01-SI — central write helper)
// ---------------------------------------------------------------------------

/**
 * Write a frontmatter-prefixed MDX file to disk.
 *
 * Steps:
 *   1. assertSafeWritePath(slug, expectedDir) — path traversal guard
 *   2. fs.existsSync check — throw if file already exists (no silent overwrites)
 *   3. Build frontmatter string following new-post.mjs lines 96–103 pattern
 *   4. await fs.promises.writeFile(filepath, frontmatter + body.trim() + '\n')
 *   5. Return relative path under src/content/writing/
 *
 * Frontmatter rules:
 *   - date always quoted: date: "YYYY-MM-DD"
 *   - title escaped (newlines → spaces, " → \") — omitted when empty/null/undefined
 *   - tags as JSON array: tags: ["a","b"] or tags: []
 *
 * Supports: T-08-01-OW (overwrite prevention), T-08-01-SI (title sanitization),
 *           Pattern 7 (output frontmatter format)
 *
 * @param {{ slug: string, date: string, type: string, title?: string,
 *            tags?: string[], body: string, expectedDir: string }} opts
 * @returns {Promise<string>} relative path written
 */
export async function writeMdxFile({ slug, date, type, title, tags, body, expectedDir }) {
  // 1. Path traversal guard
  const filepath = assertSafeWritePath(slug, expectedDir)

  // 2. Existence check — prevent overwriting hand-written posts
  if (fs.existsSync(filepath)) {
    throw new Error(
      `File already exists: ${filepath}\n` +
        `Delete the existing file or choose a different slug before re-running.`
    )
  }

  // 3. Build frontmatter (Pattern 7)
  const safeTitle =
    title && title.trim()
      ? title.replace(/[\r\n]/g, ' ').replace(/"/g, '\\"')
      : null

  const tagsArray = Array.isArray(tags) && tags.length > 0 ? tags : []
  const tagsJson = JSON.stringify(tagsArray)

  const titleLine = safeTitle !== null ? `title: "${safeTitle}"\n` : ''

  const frontmatter =
    `---\n` +
    `type: ${type}\n` +
    `date: "${date}"\n` +
    `slug: ${slug}\n` +
    titleLine +
    `tags: ${tagsJson}\n` +
    `---\n\n`

  // 4. Write file
  await fs.promises.writeFile(filepath, frontmatter + body.trim() + '\n', 'utf-8')

  // 5. Return relative path
  const rel = path.relative(process.cwd(), filepath)
  return rel
}

// ===========================================================================
// Shared pieces for the scripts/import/<source>.mjs importers (wordpress, ghost,
// substack, medium, markdown, feed). Everything below is format-agnostic; each
// importer only knows how to turn its export into the post records runImporter
// consumes.
// ===========================================================================

// ---------------------------------------------------------------------------
// Small primitives: slugs, dates, text
// ---------------------------------------------------------------------------

/**
 * A URL slug the site accepts (/^[a-z0-9-]+$/): github-slugger for the unicode
 * folding, then anything left that is not [a-z0-9-] is dropped and dashes collapse.
 *
 * @param {string} input
 * @returns {string} '' when nothing survives
 */
export function slugify(input) {
  const base = new GithubSlugger().slug(String(input || ''))
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Any date string a platform export might carry → "YYYY-MM-DD", or null.
 * Handles ISO 8601, RFC 2822 (pubDate), MySQL "2015-11-17 02:20:54", and the
 * "Month D, YYYY" prose form Medium prints in its footer.
 *
 * @param {string|number|Date|undefined|null} value
 * @returns {string|null}
 */
export function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  const s = String(value).trim()
  if (/^0000-00-00/.test(s)) return null
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/)
  // A date-only string is a calendar date, not an instant: keep it as written so a
  // post dated 2015-11-17 does not slip to the 16th in a western timezone.
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const d = new Date(s.replace(/(\d+)(st|nd|rd|th)\b/, '$1'))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Decode the XML/HTML entities an export might carry in scalar fields.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * HTML → plain text on one line (for descriptions and titles).
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Word count of a Markdown body, ignoring image lines and fenced code. */
export function countWords(markdown) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * The post type the site's feed expects, from the converted body.
 *   photo:   an image and nothing else worth reading (under 20 words)
 *   link:    the body opens on a bare URL or is a single link paragraph
 *   note:    short (under 150 words) with no headings
 *   article: everything else
 *
 * @param {string} markdown
 * @returns {'article'|'photo'|'note'|'link'}
 */
export function detectPostType(markdown) {
  const body = String(markdown || '').trim()
  const words = countWords(body)
  const hasImage = /!\[[^\]]*\]\([^)]*\)/.test(body)
  const hasHeading = /^#{1,6}\s/m.test(body)
  const first = body.split('\n').find((l) => l.trim() !== '')?.trim() || ''
  if (hasImage && words < 20 && !hasHeading) return 'photo'
  if (/^https?:\/\/\S+$/.test(first) || (/^\[[^\]]+\]\([^)]+\)$/.test(first) && words < 40)) return 'link'
  if (words < 150 && !hasHeading) return 'note'
  return 'article'
}

// ---------------------------------------------------------------------------
// transformHtml: prune or replace elements before conversion (platform cruft)
// ---------------------------------------------------------------------------

/**
 * Walk an HTML fragment and let the visitor drop or replace elements. The visitor
 * receives each element (parse5 node) plus helpers and returns:
 *   undefined        keep the node and descend into it
 *   'remove'         drop the node and its subtree
 *   { html: string } replace the node with the parsed fragment
 *   'skip'           keep the node, do not descend
 *
 * @param {string} html
 * @param {(node: any, h: { cls: (n: any) => string[], attr: (n: any, name: string) => string,
 *          setAttr: (n: any, name: string, value: string) => void, text: (n: any) => string,
 *          find: (n: any, name: string) => any }) => undefined|'remove'|'skip'|{ html: string }} visitor
 * @returns {string}
 */
export function transformHtml(html, visitor) {
  const doc = parseFragment(String(html || ''))
  const helpers = {
    cls: (n) => attrOf(n, 'class').split(/\s+/).filter(Boolean),
    attr: attrOf,
    setAttr: (n, name, value) => {
      const a = (n.attrs || []).find((x) => x.name === name)
      if (a) a.value = value
      else (n.attrs ||= []).push({ name, value })
    },
    text: (n) => textContent(n).replace(/\s+/g, ' ').trim(),
    find: findDescendant,
  }
  const walk = (parent) => {
    for (const child of [...(parent.childNodes || [])]) {
      if (!child.tagName) continue
      const action = visitor(child, helpers)
      if (action === 'remove') {
        parent.childNodes.splice(parent.childNodes.indexOf(child), 1)
        continue
      }
      if (action && typeof action === 'object' && 'html' in action) {
        const frag = parseFragment(action.html)
        const idx = parent.childNodes.indexOf(child)
        for (const n of frag.childNodes) n.parentNode = parent
        parent.childNodes.splice(idx, 1, ...frag.childNodes)
        continue
      }
      if (action === 'skip') continue
      walk(child)
    }
  }
  walk(doc)
  return serialize(doc)
}

// ---------------------------------------------------------------------------
// XML helpers (regex-based, matching the verified shape of platform exports;
// no XML dependency)
// ---------------------------------------------------------------------------

/**
 * Every `<tag …>…</tag>` block in an XML string (non-nested tags such as item/entry).
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]} inner XML of each block
 */
export function xmlBlocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  return [...String(xml).matchAll(re)].map((m) => m[1])
}

/**
 * Text of the first `<tag>` inside a block: CDATA sections are unwrapped, entities
 * in the rest are decoded. '' when the tag is absent.
 * @param {string} block
 * @param {string} tag
 * @param {{ raw?: boolean }} [opts] raw: keep entities (xhtml content that is already markup)
 * @returns {string}
 */
export function xmlText(block, tag, opts = {}) {
  const m = String(block).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))
  if (!m) return ''
  return unwrapXmlValue(m[1], opts.raw)
}

/** All `<tag …>` opening tags in a block, as { attrs, text } records. */
export function xmlElements(block, tag) {
  const out = []
  const re = new RegExp(`<${tag}((?:\\s[^>]*)?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')
  for (const m of String(block).matchAll(re)) {
    const attrs = {}
    for (const a of (m[1] || '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g)) {
      attrs[a[1] || a[3]] = decodeEntities(a[2] ?? a[4] ?? '')
    }
    out.push({ attrs, text: unwrapXmlValue(m[2] || '') })
  }
  return out
}

function unwrapXmlValue(raw, keepEntities = false) {
  let out = ''
  let last = 0
  for (const m of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += keepEntities ? raw.slice(last, m.index) : decodeEntities(raw.slice(last, m.index))
    out += m[1]
    last = m.index + m[0].length
  }
  const tail = raw.slice(last)
  out += keepEntities ? tail : decodeEntities(tail)
  return out.trim()
}

// ---------------------------------------------------------------------------
// parseWxr: WordPress eXtended RSS (WordPress, Squarespace, Posthaven exports)
// ---------------------------------------------------------------------------

/**
 * Parse a WXR export into plain records. One record per <item>, every post type
 * (post, page, attachment, nav_menu_item, …) so callers can route them.
 *
 * @param {string} xml
 * @returns {{ title: string, link: string, items: Array<{
 *   id: string, title: string, link: string, guid: string, creator: string,
 *   pubDate: string, postDate: string, postDateGmt: string, html: string, excerpt: string,
 *   postName: string, postType: string, status: string, parent: string,
 *   attachmentUrl: string, categories: string[], tags: string[],
 *   meta: Record<string, string> }> }}
 */
export function parseWxr(xml) {
  const channel = xmlBlocks(xml, 'channel')[0] ?? xml
  const head = channel.split(/<item[\s>]/)[0]
  const items = xmlBlocks(xml, 'item').map((item) => {
    const meta = {}
    for (const block of xmlBlocks(item, 'wp:postmeta')) {
      const key = xmlText(block, 'wp:meta_key')
      if (key) meta[key] = xmlText(block, 'wp:meta_value')
    }
    const cats = xmlElements(item, 'category')
    const byDomain = (domain) =>
      cats.filter((c) => (c.attrs.domain || 'category') === domain).map((c) => c.attrs.nicename || slugify(c.text)).filter(Boolean)
    return {
      id: xmlText(item, 'wp:post_id'),
      title: xmlText(item, 'title'),
      link: xmlText(item, 'link'),
      guid: xmlText(item, 'guid'),
      creator: xmlText(item, 'dc:creator'),
      pubDate: xmlText(item, 'pubDate'),
      postDate: xmlText(item, 'wp:post_date'),
      postDateGmt: xmlText(item, 'wp:post_date_gmt'),
      html: xmlText(item, 'content:encoded'),
      excerpt: xmlText(item, 'excerpt:encoded'),
      postName: xmlText(item, 'wp:post_name'),
      postType: xmlText(item, 'wp:post_type'),
      status: xmlText(item, 'wp:status'),
      parent: xmlText(item, 'wp:post_parent'),
      menuOrder: Number(xmlText(item, 'wp:menu_order')) || 0,
      attachmentUrl: xmlText(item, 'wp:attachment_url'),
      categories: byDomain('category'),
      tags: byDomain('post_tag'),
      meta,
    }
  })
  return { title: xmlText(head, 'title'), link: xmlText(head, 'link'), items }
}

// ---------------------------------------------------------------------------
// parseCsv: RFC 4180 (quoted fields, embedded newlines, doubled quotes)
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @returns {Array<Record<string, string>>} one object per row, keyed by the header row
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ''))
  if (!header) return []
  const keys = header.map((h) => h.trim())
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
}

// ---------------------------------------------------------------------------
// readSourceEntries: one shape for "a folder", "a zip", or "a single file"
// ---------------------------------------------------------------------------

/**
 * @param {string} src  path to a folder, a .zip, or a single file
 * @returns {Promise<Array<{ name: string, read: () => Buffer, mtime: Date|null }>>}
 *   name is the path inside the source with forward slashes (a single file is its basename)
 */
export async function readSourceEntries(src) {
  const abs = path.resolve(src)
  if (!fs.existsSync(abs)) throw new Error(`source not found: ${abs}`)
  const st = fs.statSync(abs)
  if (st.isDirectory()) {
    const out = []
    const walk = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (ent.name === '.DS_Store' || ent.name === '.git' || ent.name === 'node_modules') continue
        const full = path.join(dir, ent.name)
        const name = rel ? `${rel}/${ent.name}` : ent.name
        if (ent.isDirectory()) walk(full, name)
        else out.push({ name, read: () => fs.readFileSync(full), mtime: fs.statSync(full).mtime, path: full })
      }
    }
    walk(abs, '')
    return out
  }
  if (/\.zip$/i.test(abs)) {
    const { createRequire } = await import('node:module')
    const AdmZip = createRequire(import.meta.url)('adm-zip')
    const zip = new AdmZip(abs)
    return zip
      .getEntries()
      .filter((e) => !e.isDirectory && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.entryName))
      .map((e) => ({ name: e.entryName.replace(/\\/g, '/'), read: () => e.getData(), mtime: e.header?.time ?? null }))
  }
  return [{ name: path.basename(abs), read: () => fs.readFileSync(abs), mtime: st.mtime, path: abs }]
}

// ---------------------------------------------------------------------------
// Import CLI: arguments, site.config sources, and the runner every importer uses
// ---------------------------------------------------------------------------

/**
 * Parse the flags shared by every importer plus any importer-specific booleans.
 *
 * @param {string[]} argv
 * @param {{ flags?: string[], values?: string[] }} [extra]  extra boolean flags / value flags
 * @returns {Record<string, string|boolean|null>}
 */
export function parseImportArgs(argv, extra = {}) {
  const booleans = new Set(['dry-run', 'force', 'drafts', 'fetch-media', 'help', ...(extra.flags || [])])
  const values = new Set(['src', 'out', 'images', 'url', ...(extra.values || [])])
  const opts = { src: null, out: null, images: null, url: null }
  for (const b of booleans) opts[b] = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { if (!opts.src) opts.src = a; continue }
    const [name, inline] = a.slice(2).split('=', 2)
    if (booleans.has(name)) opts[name] = true
    else if (values.has(name)) opts[name] = inline ?? argv[++i] ?? null
    else throw new Error(`unknown flag --${name}`)
  }
  return opts
}

/**
 * The content folders from the repo's site.config.ts (imported natively; Node 24
 * strips the types), with the schema defaults when the file cannot be loaded.
 *
 * @returns {Promise<{ writing: string, images: string }>}
 */
export async function loadSiteSources() {
  const defaults = { writing: 'src/content/writing', images: 'public/images' }
  try {
    // The same silence scripts/check-conventions.mjs applies: Node warns that site.config.ts
    // has no package "type" every time it is imported natively.
    process.removeAllListeners('warning')
    const mod = await import('../site.config.ts')
    const sources = mod.default?.sources ?? {}
    return { writing: sources.writing || defaults.writing, images: sources.images || defaults.images }
  } catch {
    return defaults
  }
}

/**
 * Frontmatter in the exact shape src/lib/posts.ts reads (type, date, slug, title,
 * description, tags) plus the `imported` provenance block.
 */
export function buildFrontmatter({ type, date, slug, title, description, tags, imported }) {
  const q = (s) => `"${String(s).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  let fm = `---\ntype: ${type}\ndate: "${date}"\nslug: ${slug}\n`
  if (title && title.trim()) fm += `title: ${q(title.trim())}\n`
  if (description && description.trim()) fm += `description: ${q(description.trim())}\n`
  fm += `tags: ${JSON.stringify(Array.isArray(tags) ? tags : [])}\n`
  if (imported) fm += `imported: { source: ${q(imported.source)}, id: ${q(imported.id)} }\n`
  return fm + '---\n\n'
}

/** Read the provenance of every MDX file already in the output folder. */
function scanExisting(outDir) {
  const bySlug = new Map()
  if (!fs.existsSync(outDir)) return bySlug
  for (const f of fs.readdirSync(outDir)) {
    if (!f.endsWith('.mdx')) continue
    const head = fs.readFileSync(path.join(outDir, f), 'utf-8').slice(0, 4000)
    const m = head.match(/^imported:\s*\{\s*source:\s*"([^"]*)",\s*id:\s*"((?:[^"\\]|\\.)*)"\s*\}/m)
    bySlug.set(f.slice(0, -4), m ? { source: m[1], id: m[2].replace(/\\"/g, '"') } : null)
  }
  return bySlug
}

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|avif|svg|heic|mp4|webm|mov|m4v|mp3|m4a|pdf)$/i

/** A safe local basename for a media reference (URL or path). */
export function mediaBasename(ref) {
  let name = ref
  try {
    const u = new URL(ref)
    name = u.pathname
    // CDN fetch proxies (Substack, some WordPress CDNs) carry the origin URL in the path.
    const proxied = decodeURIComponent(name).match(/https?:\/\/[^\s]+$/)
    if (proxied) name = new URL(proxied[0]).pathname
  } catch { /* not a URL: a relative or absolute file path */ }
  name = decodeURIComponent(name.split('?')[0].split('#')[0])
  name = path.posix.basename(name.replace(/\\/g, '/'))
  name = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return name || 'media'
}

/**
 * Download one media file (http/https only, no private hosts, 15s timeout, 20MB cap).
 * @returns {Promise<string|null>} error message, or null on success
 */
export async function fetchMediaFile(url, dest) {
  let u
  try { u = new URL(url) } catch { return 'not a URL' }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return `unsupported protocol ${u.protocol}`
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
    return 'refusing to fetch from a private host'
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'platinum-import/1.0' } })
    if (!res.ok) return `HTTP ${res.status}`
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 20 * 1024 * 1024) return `too large (${buf.length} bytes)`
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.writeFile(dest, buf)
    return null
  } catch (err) {
    return err.name === 'AbortError' ? 'timed out' : err.message
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The runner every importer hands its records to.
 *
 * Each record: {
 *   id: string                       original id or URL (provenance; idempotency key)
 *   kind: 'post'|'page'|'attachment'|'other'   only 'post' is written
 *   draft?: boolean                  skipped unless --drafts
 *   title?: string
 *   date: string|null                YYYY-MM-DD (null = skipped with a warning)
 *   slug?: string                    preferred slug (sanitized here; falls back to the title)
 *   tags?: string[]
 *   description?: string
 *   image?: string                   featured image (URL or path); becomes the body's first image
 *   html?: string                    body as HTML (converted here), or
 *   markdown?: string                body already in Markdown
 *   resolveLocal?: (ref) => string|null   absolute path of a bundled media file for a relative ref
 *   notes?: string[]                 anything lossy the importer wants surfaced
 * }
 *
 * @param {{ source: string, argv: string[], help: string,
 *           flags?: string[], values?: string[],
 *           collect: (opts: Record<string, any>, ctx: { warn: (s: string) => void, note: (s: string) => void }) => Promise<object[]> }} spec
 * @returns {Promise<{ written: number, skipped: number }>}
 */
export async function runImporter({ source, argv, help, flags, values, collect }) {
  let opts
  try {
    opts = parseImportArgs(argv, { flags, values })
  } catch (err) {
    process.stderr.write(`${source}: ${err.message}\n${help}\n`)
    process.exit(2)
  }
  if (opts.help || (!opts.src && !opts.url)) {
    process.stdout.write(help.trim() + '\n')
    process.exit(opts.help ? 0 : 2)
  }

  const sources = await loadSiteSources()
  const outDir = path.resolve(opts.out || sources.writing)
  const imagesDir = path.resolve(opts.images || path.posix.join(sources.images, 'writing'))
  // The path the browser sees: everything after public/ (or the folder itself when it is
  // not under public/, which next/image would not serve anyway).
  const publicRoot = path.resolve('public')
  const webRoot = imagesDir.startsWith(publicRoot + path.sep)
    ? '/' + path.relative(publicRoot, imagesDir).split(path.sep).join('/')
    : '/' + path.relative(process.cwd(), imagesDir).split(path.sep).join('/')

  const warnings = []
  const notes = []
  const ctx = {
    warn: (s) => { warnings.push(s); process.stderr.write(`${source}: ${s}\n`) },
    note: (s) => { notes.push(s) },
    log: (s) => process.stdout.write(`${source}: ${s}\n`),
  }

  ctx.log(`reading ${opts.url || opts.src}`)
  const records = await collect(opts, ctx)
  ctx.log(`${records.length} items in the export`)

  const existing = scanExisting(outDir)
  const taken = new Set(existing.keys())
  const plan = []
  const skippedKinds = {}
  const mediaToFetch = []
  let mediaCopied = 0
  let mediaFetched = 0
  // `](from)`, `](<from>)`, and `](from "|caption")` all become `](to …)`.
  const rewriteImage = (md, from, to) =>
    md.replace(new RegExp(`\\]\\(<?${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?(?=\\)|\\s+")`, 'g'), `](${to}`)

  for (const rec of records) {
    if (rec.kind !== 'post') { skippedKinds[rec.kind] = (skippedKinds[rec.kind] || 0) + 1; continue }
    if (rec.draft && !opts.drafts) { skippedKinds.draft = (skippedKinds.draft || 0) + 1; continue }
    const label = rec.title || rec.slug || rec.id
    if (!rec.date) { ctx.warn(`skipping "${label}": no usable date`); continue }
    const id = String(rec.id)

    // Idempotency: the same source+id already on disk is this post. Skip it, or replace it
    // in place under --force. Anything else that holds the slug forces a numeric suffix.
    let slug = null
    let action = 'write'
    for (const [s, prov] of existing) {
      if (prov && prov.source === source && prov.id === id) { slug = s; action = opts.force ? 'overwrite' : 'skip'; break }
    }
    if (!slug) {
      const base = slugify(rec.slug || '') || slugify(rec.title || '') || slugify(`${source}-${id}`)
      slug = base
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
      taken.add(slug)
    }

    let body = rec.markdown !== undefined ? String(rec.markdown) : htmlToMarkdown(rec.html || '')
    body = body.replace(/[ \t]+\n/g, '\n').trim().replace(/\n{3,}/g, '\n\n')
    const polished = polishMarkdown(body)
    body = polished.markdown.trim().replace(/\n{3,}/g, '\n\n')
    if (polished.notes.length && Array.isArray(rec.notes)) rec.notes.push(...polished.notes)
    if (rec.image && !body.includes(`](${rec.image})`) && !body.includes(`](${rec.image} "`)) {
      body = `![${(rec.title || '').replace(/[\[\]]/g, '')}](${rec.image})\n\n${body}`.trim()
    }

    // Media: every image reference becomes <images>/<slug>/<basename>. Bundled files are
    // copied; remote ones are fetched under --fetch-media, otherwise listed. An image may
    // carry a title (`![alt](src "|caption")`, the site's caption form).
    const refs = [...new Set([...body.matchAll(IMAGE_REF_RE)].map((m) => m[1]))]
    const media = []
    const used = new Set()
    for (const ref of refs) {
      const isRemote = /^https?:\/\//i.test(ref)
      const local = !isRemote && rec.resolveLocal ? rec.resolveLocal(ref) : null
      if (!isRemote && !local) continue
      if (isRemote && !MEDIA_EXT.test(mediaBasename(ref)) && !/\/image\//.test(ref)) {
        // A remote URL without a media extension (an og:image proxy, a tracking pixel): leave it.
        continue
      }
      let base = mediaBasename(ref)
      if (used.has(base)) {
        const ext = path.extname(base)
        for (let n = 2; used.has(base); n++) base = `${path.basename(base, ext)}-${n}${ext}`
      }
      used.add(base)
      const dest = path.join(imagesDir, slug, base)
      const web = `${webRoot}/${slug}/${base}`
      media.push({ ref, dest, web, local, remote: isRemote })
    }

    const type = rec.type || detectPostType(body)
    plan.push({ rec, slug, action, type, body, media, label })
  }

  // Report the plan
  const width = Math.max(4, ...plan.map((p) => p.slug.length))
  for (const p of plan) {
    const verb = opts['dry-run'] ? (p.action === 'skip' ? 'skip ' : 'would') : p.action === 'skip' ? 'skip ' : p.action === 'overwrite' ? 'force' : 'write'
    const extra = p.action === 'skip' ? '(already imported)' : p.media.length ? `(${p.media.length} media)` : ''
    console.log(`  ${verb}  ${p.rec.date}  ${p.slug.padEnd(width)}  [${p.type}]  ${p.rec.title ? JSON.stringify(p.rec.title) : '(untitled)'} ${extra}`)
  }

  // Write
  let written = 0
  let skipped = 0
  for (const p of plan) {
    if (p.action === 'skip') { skipped++; continue }
    let body = p.body
    for (const m of p.media) {
      if (opts['dry-run']) { if (m.remote) mediaToFetch.push(m.ref); continue }
      if (m.local) {
        if (!fs.existsSync(m.dest)) {
          await fs.promises.mkdir(path.dirname(m.dest), { recursive: true })
          await fs.promises.copyFile(m.local, m.dest)
          mediaCopied++
        }
        body = rewriteImage(body, m.ref, m.web)
      } else if (opts['fetch-media']) {
        if (fs.existsSync(m.dest)) { body = rewriteImage(body, m.ref, m.web); continue }
        const err = await fetchMediaFile(m.ref, m.dest)
        if (err) ctx.warn(`${p.slug}: could not fetch ${m.ref} (${err}); the post keeps the remote URL`)
        else { mediaFetched++; body = rewriteImage(body, m.ref, m.web) }
      } else {
        mediaToFetch.push(m.ref)
        body = rewriteImage(body, m.ref, m.web)
      }
    }
    if (opts['dry-run']) continue
    const filepath = assertSafeWritePath(p.slug, outDir)
    const fm = buildFrontmatter({
      type: p.type,
      date: p.rec.date,
      slug: p.slug,
      title: p.rec.title,
      description: p.rec.description,
      tags: [...new Set((p.rec.tags || []).map((t) => slugify(t)).filter(Boolean))],
      imported: { source, id: String(p.rec.id) },
    })
    await fs.promises.mkdir(outDir, { recursive: true })
    await fs.promises.writeFile(filepath, fm + body.trim() + '\n', 'utf-8')
    for (const n of p.rec.notes || []) notes.push(`${p.slug}: ${n}`)
    written++
  }

  // Summary
  const parts = []
  if (opts['dry-run']) parts.push(`${plan.length - skipped} would be written to ${path.relative(process.cwd(), outDir) || '.'}`)
  else parts.push(`${written} written to ${path.relative(process.cwd(), outDir) || '.'}`)
  if (skipped) parts.push(`${skipped} already imported (use --force to rewrite)`)
  for (const [k, n] of Object.entries(skippedKinds)) parts.push(`${n} ${k}${n === 1 ? '' : 's'} skipped${k === 'draft' ? ' (use --drafts to include)' : ''}`)
  if (mediaCopied) parts.push(`${mediaCopied} media files copied`)
  if (mediaFetched) parts.push(`${mediaFetched} media files fetched`)
  console.log(`${source}: ${parts.join('; ')}`)
  const uniqueFetch = [...new Set(mediaToFetch)]
  if (uniqueFetch.length) {
    console.log(
      `${source}: ${uniqueFetch.length} remote media file${uniqueFetch.length === 1 ? '' : 's'} referenced. ` +
        `Posts point at ${webRoot}/<slug>/; run again with --fetch-media${opts['dry-run'] ? '' : ' --force'} to download them:`
    )
    for (const u of uniqueFetch) console.log(`    ${u}`)
  }
  for (const n of notes) console.log(`${source}: note: ${n}`)
  if (warnings.length) console.log(`${source}: ${warnings.length} warning${warnings.length === 1 ? '' : 's'} above`)
  return { written, skipped }
}

// ---------------------------------------------------------------------------
// Inline test runner (no external test framework — node:assert/strict only)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const { strict: assert } = await import('node:assert')
  const { createInterface } = await import('node:readline')
  const os = await import('node:os')

  let passed = 0
  let failed = 0

  function test(name, fn) {
    try {
      fn()
      console.log(`PASS: ${name}`)
      passed++
    } catch (err) {
      console.error(`FAIL: ${name} — ${err.message}`)
      failed++
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn()
      console.log(`PASS: ${name}`)
      passed++
    } catch (err) {
      console.error(`FAIL: ${name} — ${err.message}`)
      failed++
    }
  }

  // Test 1: ask() — returns a Promise that resolves with user input
  await testAsync('Test 1 (ask): returns Promise resolving with user input', async () => {
    const { Readable } = await import('node:stream')
    const input = Readable.from(['hello world\n'])
    const rl = createInterface({ input, output: process.stdout, terminal: false })
    const result = await ask(rl, 'q: ')
    rl.close()
    assert.equal(result, 'hello world')
  })

  // Test 2: createSlugRegistry / assertUniqueSlug
  test('Test 2 (createSlugRegistry): first call returns slug, second suffixes, third increments', () => {
    const registry = createSlugRegistry()
    const r1 = registry.register('same', 'blot')
    const r2 = registry.register('same', 'blot')
    const r3 = registry.register('same', 'blot')
    assert.equal(r1, 'same', `expected 'same', got '${r1}'`)
    assert.equal(r2, 'same-blot', `expected 'same-blot', got '${r2}'`)
    assert.equal(r3, 'same-blot-2', `expected 'same-blot-2', got '${r3}'`)
    assert.ok(registry.has('same'))
    assert.ok(registry.has('same-blot'))
    assert.ok(!registry.has('other'))
    const all = registry.all()
    assert.ok(all instanceof Set)
    assert.equal(all.size, 3)
  })

  // Test 3: assertSafeWritePath
  test('Test 3 (assertSafeWritePath): valid slug returns absolute path; invalid throws', () => {
    const tmpDir = os.tmpdir()
    const result = assertSafeWritePath('valid-slug', tmpDir)
    assert.ok(result.startsWith(path.resolve(tmpDir) + path.sep), `path should start with tmpDir: ${result}`)
    assert.ok(result.endsWith('valid-slug.mdx'), `path should end with slug.mdx: ${result}`)

    // slug with path traversal
    assert.throws(() => assertSafeWritePath('../etc/passwd', tmpDir), /Invalid slug|path traversal/i)
    // slug with slash
    assert.throws(() => assertSafeWritePath('a/b', tmpDir), /Invalid slug/i)
    // empty slug
    assert.throws(() => assertSafeWritePath('', tmpDir), /Invalid slug/i)
    // slug with dots only
    assert.throws(() => assertSafeWritePath('..', tmpDir), /Invalid slug/i)
  })

  // Test 4: parseBlotDate
  test('Test 4 (parseBlotDate): parses standard date, ordinal date, and mtime fallback', () => {
    // Standard date
    const r1 = parseBlotDate(['Date: January 28, 2026'])
    assert.equal(r1.date, '2026-01-28', `expected 2026-01-28, got ${r1.date}`)
    assert.equal(r1.usedMtimeFallback, false)

    // Ordinal date
    const r2 = parseBlotDate(['Date: September 9th, 2020'])
    assert.equal(r2.date, '2020-09-09', `expected 2020-09-09, got ${r2.date}`)
    assert.equal(r2.usedMtimeFallback, false)

    // Mtime fallback
    const mtime = new Date('2019-03-15T00:00:00Z')
    const r3 = parseBlotDate([], mtime)
    assert.equal(r3.date, '2019-03-15', `expected 2019-03-15, got ${r3.date}`)
    assert.equal(r3.usedMtimeFallback, true)

    // No date + no fallback → throws
    assert.throws(() => parseBlotDate([]), /Could not determine date/)
  })

  // Test 5: htmlToMarkdown
  test('Test 5 (htmlToMarkdown): converts tags and decodes entities correctly', () => {
    // p + strong
    const r1 = htmlToMarkdown('<p>Hello <strong>world</strong></p>')
    assert.ok(r1.includes('Hello **world**'), `Expected bold: ${r1}`)

    // img with alt
    const r2 = htmlToMarkdown('<img src="x.jpg" alt="a"/>')
    assert.equal(r2.trim(), '![a](x.jpg)', `Expected img with alt: ${r2}`)

    // img without alt
    const r2b = htmlToMarkdown('<img src="y.jpg"/>')
    assert.ok(r2b.includes('![](y.jpg)'), `Expected img without alt: ${r2b}`)

    // a
    const r3 = htmlToMarkdown('<a href="https://example.com">link</a>')
    assert.ok(r3.includes('[link](https://example.com)'), `Expected link: ${r3}`)

    // div strips wrapper
    const r4 = htmlToMarkdown('<div class="caption">inner</div>')
    assert.ok(r4.includes('inner'), `Expected inner: ${r4}`)
    assert.ok(!r4.includes('<div'), `Should not contain div tag: ${r4}`)

    // blockquote
    const r5 = htmlToMarkdown('<blockquote><p>q</p></blockquote>')
    assert.ok(r5.includes('> q'), `Expected blockquote: ${r5}`)

    // entity decoding
    const r6 = htmlToMarkdown('<p>a &amp; b</p>')
    assert.ok(r6.includes('a & b'), `Expected entity decoded: ${r6}`)

    // numeric entity
    const r7 = htmlToMarkdown('<p>&#8220;quoted&#8221;</p>')
    assert.ok(r7.includes('“') || r7.includes('"'), `Expected decoded quote: ${r7}`)
  })

  // Test 6: writeMdxFile
  await testAsync('Test 6 (writeMdxFile): writes frontmatter+body; throws on conflict; throws on path traversal', async () => {
    const tmpDir = os.tmpdir()

    // Write a new file
    const rel = await writeMdxFile({
      slug: 'test-write-tmp-util',
      date: '2025-01-01',
      type: 'note',
      title: 'Test "Title"',
      tags: ['a', 'b'],
      body: 'Hello world',
      expectedDir: tmpDir,
    })
    assert.ok(rel.includes('test-write-tmp-util.mdx'), `rel path wrong: ${rel}`)

    const written = fs.readFileSync(path.join(tmpDir, 'test-write-tmp-util.mdx'), 'utf-8')
    assert.ok(written.includes('date: "2025-01-01"'), `date not quoted: ${written}`)
    assert.ok(written.includes('title: "Test \\"Title\\""'), `title not escaped: ${written}`)
    assert.ok(written.includes('tags: ["a","b"]'), `tags wrong: ${written}`)
    assert.ok(written.includes('Hello world'), `body missing: ${written}`)

    // Throws if file exists
    await assert.rejects(
      () => writeMdxFile({ slug: 'test-write-tmp-util', date: '2025-01-01', type: 'note', body: '', expectedDir: tmpDir }),
      /already exists/i
    )

    // Clean up
    fs.unlinkSync(path.join(tmpDir, 'test-write-tmp-util.mdx'))

    // Title omitted when empty
    await writeMdxFile({
      slug: 'test-write-tmp-notitle',
      date: '2025-02-01',
      type: 'link',
      title: '',
      tags: [],
      body: 'just a link',
      expectedDir: tmpDir,
    })
    const noTitle = fs.readFileSync(path.join(tmpDir, 'test-write-tmp-notitle.mdx'), 'utf-8')
    assert.ok(!noTitle.includes('title:'), `title line should be absent for empty title: ${noTitle}`)
    assert.ok(noTitle.includes('tags: []'), `empty tags array: ${noTitle}`)
    fs.unlinkSync(path.join(tmpDir, 'test-write-tmp-notitle.mdx'))

    // Path traversal throws via assertSafeWritePath (invalid slug with ..)
    await assert.rejects(
      () => writeMdxFile({ slug: '../etc-passwd', date: '2025-01-01', type: 'note', body: '', expectedDir: tmpDir }),
      /path traversal|outside|invalid slug/i
    )
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  process.exit(0)
}
