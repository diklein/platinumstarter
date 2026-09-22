#!/usr/bin/env node
/**
 * scripts/import/markdown.mjs: a folder of Markdown files → MDX.
 *
 * Jekyll, Hugo, Eleventy, Astro, Bear Blog, Obsidian, Notion (unzipped), Blot (git clone):
 * anything that is Markdown with front matter. Front-matter keys are mapped (date/pubDate/
 * published, title, tags/categories, draft, layout, description, image), Jekyll
 * YYYY-MM-DD-slug.md filenames give the date and slug, Hugo page bundles (index.md plus
 * sibling images) keep their images, the common shortcodes become plain Markdown, and
 * [[wiki-links]] become links when a matching post exists (plain text otherwise).
 *
 * Usage:
 *   node scripts/import/markdown.mjs --src ./content [--dry-run] [--drafts] [--force]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import matter from 'gray-matter'
import { parseCsv, runImporter, slugify, toIsoDate } from '../migration-utils.mjs'

const HELP = `
markdown: import a folder of Markdown files (Jekyll, Hugo, Eleventy, Astro, Obsidian, Notion, Bear, Blot)

  node scripts/import/markdown.mjs --src <folder | zip | posts.csv> [options]

  --src <path>       the folder (a repo, a vault, a content directory), a zip of one
                     (Notion's export), or a Bear Blog posts CSV
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include drafts (draft: true, published: false, _drafts/ folders)
  --fetch-media      download remote images (bundled images are always copied)
  --force            rewrite posts this importer already wrote
`

const MD_EXT = /\.(md|mdx|markdown)$/i
const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|svg|heic)$/i
const SKIP_DIRS = /(^|\/)(\.obsidian|\.trash|\.git|node_modules|_site|_layouts|_includes|layouts|templates|themes|dist|build|\.next|\.vercel)(\/|$)/i
const DATE_KEYS = ['date', 'pubDate', 'pubdate', 'published', 'publishDate', 'publishdate', 'publishedAt', 'published_at', 'datePublished', 'published_date', 'first_published_at', 'created', 'created_at', 'createdAt']
const DESC_KEYS = ['description', 'summary', 'excerpt', 'subtitle', 'tagline', 'meta_description']
const IMAGE_KEYS = ['image', 'cover', 'coverImage', 'cover_image', 'heroImage', 'hero_image', 'hero', 'featured_image', 'featuredImage', 'feature_image', 'thumbnail', 'banner', 'og_image', 'ogImage', 'meta_image']
const TAG_KEYS = ['categories', 'category', 'tags', 'tag', 'keywords', 'all_tags']
const POST_LAYOUTS = /post|article|blog|entry|note|default/i

// ---------------------------------------------------------------------------
// Front matter: YAML (---), TOML (+++), JSON ({), or a Blot/Notion "Key: value" header
// ---------------------------------------------------------------------------

function parseToml(src) {
  const data = {}
  let section = ''
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const sec = line.match(/^\[\[?([^\]]+)\]\]?$/)
    if (sec) { section = sec[1].trim(); continue }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*([\s\S]*)$/)
    if (!kv) continue
    let raw = kv[2].trim()
    // Multi-line arrays and triple-quoted strings
    if (raw.startsWith('[') && !raw.endsWith(']')) {
      while (i + 1 < lines.length && !raw.endsWith(']')) raw += ' ' + lines[++i].trim()
    } else if (raw.startsWith('"""')) {
      let s = raw.slice(3)
      while (!s.endsWith('"""') && i + 1 < lines.length) s += '\n' + lines[++i]
      raw = JSON.stringify(s.replace(/"""$/, '').replace(/^\n/, ''))
    }
    const key = section && section !== 'params' ? `${section}.${kv[1]}` : kv[1]
    data[key] = tomlValue(raw)
    if (section === 'params' && !(kv[1] in data)) data[kv[1]] = data[key]
  }
  return data
}

function tomlValue(raw) {
  if (/^"(.*)"$/s.test(raw)) return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n')
  if (/^'(.*)'$/s.test(raw)) return raw.slice(1, -1)
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^\[/.test(raw)) {
    const inner = raw.replace(/^\[|\]$/g, '')
    return (inner.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^,\s][^,]*/g) || []).map((v) => tomlValue(v.trim())).filter((v) => v !== '')
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

/** Blot and Notion put metadata as "Key: value" lines at the top (Notion after an H1). */
function parseHeaderLines(text) {
  const data = {}
  let body = text
  const h1 = body.match(/^#\s+(.+)\r?\n/)
  if (h1) { data.title = h1[1].trim(); body = body.slice(h1[0].length) }
  const known = /^(title|date|tags|categories|created|published|status|author|link|slug|summary|description|type|layout|draft|image|permalink|url)\s*:\s*(.*)$/i
  const lines = body.split(/\r?\n/)
  let n = 0
  while (n < lines.length) {
    const m = lines[n].match(known)
    if (!m) break
    data[m[1].toLowerCase()] = m[2].trim()
    n++
  }
  if (n === 0 && !h1) return null
  if (n === 0) { data.__h1Only = true; return { data, body } }
  return { data, body: lines.slice(n).join('\n').replace(/^\s*\n/, '') }
}

export function parseFrontMatter(text) {
  const src = String(text).replace(/^\uFEFF/, '')
  if (/^---\r?\n/.test(src)) {
    try {
      const fm = matter(src)
      return { data: fm.data || {}, body: fm.content, had: true }
    } catch {
      const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
      return m ? { data: {}, body: m[2], had: true, broken: true } : { data: {}, body: src, had: false }
    }
  }
  if (/^\+\+\+\r?\n/.test(src)) {
    const m = src.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n?([\s\S]*)$/)
    if (m) return { data: parseToml(m[1]), body: m[2], had: true }
  }
  if (/^\{/.test(src)) {
    const end = src.search(/\r?\n\}\s*\r?\n/)
    if (end !== -1) {
      const close = src.indexOf('}', end)
      try {
        return { data: JSON.parse(src.slice(0, close + 1)), body: src.slice(close + 1).replace(/^\s*\n/, ''), had: true }
      } catch { /* fall through */ }
    }
  }
  const header = parseHeaderLines(src)
  if (header && !header.data.__h1Only) return { data: header.data, body: header.body, had: true }
  return { data: {}, body: src, had: false }
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

const pick = (data, keys) => {
  for (const k of keys) if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k]
  return undefined
}

function tagsOf(data) {
  const out = []
  for (const k of TAG_KEYS) {
    const v = data[k]
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) out.push(...v.map((t) => (typeof t === 'object' && t ? t.name || t.slug || '' : String(t))))
    else if (typeof v === 'string') out.push(...(v.includes(',') ? v.split(',') : v.split(/\s+/)))
  }
  // Eleventy uses `tags: [posts]` to name the collection, not to tag the post.
  return [...new Set(out.map((t) => t.trim()).filter((t) => t && !/^posts?$/i.test(t)))]
}

function imageOf(data) {
  const v = pick(data, IMAGE_KEYS)
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return imageOf({ image: v[0] })
  if (typeof v === 'object') return v.src || v.url || v.path || v.filename || ''
  return ''
}

function descriptionOf(data) {
  const v = pick(data, DESC_KEYS)
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

const stripIds = (s) => s.replace(/\s+[0-9a-f]{32}$/i, '').replace(/-[0-9a-f]{32}$/i, '')
const humanize = (stem) => stripIds(stem).replace(/^\d{4}-\d{2}-\d{2}[-_]/, '').replace(/[-_]+/g, ' ').trim()

// ---------------------------------------------------------------------------
// Body: shortcodes, wiki-links, template leftovers (outside fenced code only)
// ---------------------------------------------------------------------------

function outsideFences(body, fn) {
  return body
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('')
}

function attrsOf(s) {
  const out = {}
  for (const m of String(s).matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g)) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  const positional = String(s).trim().match(/^"?([^\s"]+)"?$/)
  if (positional && Object.keys(out).length === 0) out._ = positional[1]
  return out
}

export function transformBody(body, { resolveRef, note }) {
  let out = String(body)
  const dropped = new Set()

  out = out.replace(/\{%-?\s*raw\s*-?%\}([\s\S]*?)\{%-?\s*endraw\s*-?%\}/g, '$1')

  // Code shortcodes first so their contents are not touched by anything below.
  out = out.replace(/\{%-?\s*highlight\s+(\S+)[^%]*%\}\r?\n?([\s\S]*?)\r?\n?\{%-?\s*endhighlight\s*-?%\}/g, (_, lang, code) => `\`\`\`${lang}\n${code.replace(/\s+$/, '')}\n\`\`\``)
  out = out.replace(/\{\{[<%]\s*highlight\s+(\S+)[^>%]*[>%]\}\}\r?\n?([\s\S]*?)\r?\n?\{\{[<%]\s*\/highlight\s*[>%]\}\}/g, (_, lang, code) => `\`\`\`${lang.replace(/"/g, '')}\n${code.replace(/\s+$/, '')}\n\`\`\``)

  out = outsideFences(out, (text) => {
    let t = text
    // Hugo figure
    t = t.replace(/\{\{[<%]\s*figure\s+([^>%]*?)\s*\/?[>%]\}\}/g, (_, a) => {
      const at = attrsOf(a)
      const src = at.src || at._ || ''
      if (!src) return ''
      const cap = at.caption || at.title || ''
      const alt = (at.alt || cap).replace(/[[\]]/g, '')
      const img = `![${alt}](${src})`
      return `\n\n${at.link ? `[${img}](${at.link})` : img}${cap ? `\n\n${cap}` : ''}\n\n`
    })
    // Hugo embeds that have a canonical URL
    t = t.replace(/\{\{[<%]\s*youtube\s+(?:id=)?"?([\w-]+)"?[^>%]*[>%]\}\}/g, '\n\nhttps://www.youtube.com/watch?v=$1\n\n')
    t = t.replace(/\{\{[<%]\s*vimeo\s+(?:id=)?"?(\d+)"?[^>%]*[>%]\}\}/g, '\n\nhttps://vimeo.com/$1\n\n')
    t = t.replace(/\{\{[<%]\s*tweet\s+([^>%]*?)\s*[>%]\}\}/g, (_, a) => {
      const at = attrsOf(a)
      const id = at.id || at._ || ''
      return id ? `\n\nhttps://twitter.com/${at.user || 'i'}/status/${id}\n\n` : ''
    })
    t = t.replace(/\{\{[<%]\s*gist\s+(\S+)\s+(\S+)[^>%]*[>%]\}\}/g, '\n\nhttps://gist.github.com/$1/$2\n\n')
    // Hugo ref/relref, Jekyll post_url/link
    t = t.replace(/\{\{[<%]\s*(?:rel)?ref\s+"([^"]+)"[^>%]*[>%]\}\}/g, (m, target) => resolveRef(target) || (dropped.add('ref'), target))
    t = t.replace(/\{%-?\s*(?:post_url|link)\s+(\S+?)\s*-?%\}/g, (m, target) => resolveRef(target) || (dropped.add('post_url'), target))
    // Jekyll/Liquid variables and filters
    t = t.replace(/\{\{\s*site\.(?:baseurl|url)\s*\}\}/g, '')
    t = t.replace(/\{\{\s*["']([^"']+)["']\s*\|\s*(?:relative_url|absolute_url)\s*\}\}/g, '$1')
    // Octopress img tag
    t = t.replace(/\{%-?\s*img\s+(?:[\w-]+\s+)?(\S+)(?:\s+\d+\s+\d+)?(?:\s+"([^"]*)")?[^%]*%\}/g, (_, src, title) => `![${title || ''}](${src})`)
    // Everything else Liquid/Hugo is dropped, with the tag name reported once.
    t = t.replace(/\{%-?\s*(\w+)[\s\S]*?-?%\}/g, (_, name) => (dropped.add(name), ''))
    t = t.replace(/\{\{[<%]\s*\/?(\w+)[\s\S]*?[>%]\}\}/g, (_, name) => (dropped.add(name), ''))
    t = t.replace(/\{\{[\s\S]*?\}\}/g, () => (dropped.add('template expression'), ''))
    // Kramdown attribute lists, Obsidian comments, Hugo summary divider
    t = t.replace(/\{:[^}\n]*\}/g, '')
    t = t.replace(/%%[\s\S]*?%%/g, '')
    t = t.replace(/<!--\s*more\s*-->/g, '')
    // Obsidian embeds and wiki-links
    t = t.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (m, target) => {
      const file = target.trim()
      if (IMG_EXT.test(file)) return `![](${file})`
      const link = resolveRef(file)
      return link ? `[${file}](${link})` : file
    })
    t = t.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (m, target, hash, alias) => {
      const label = (alias || target).trim()
      const link = resolveRef(target.trim())
      return link ? `[${label}](${link}${hash || ''})` : label
    })
    // Obsidian callouts
    t = t.replace(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/gm, (_, type, title) => `> **${type[0].toUpperCase()}${type.slice(1).toLowerCase()}${title ? `: ${title}` : ''}**`)
    // MDX/Astro imports and exports: the components do not exist here.
    t = t.replace(/^(?:import|export)\s.+$/gm, () => (dropped.add('MDX import/export'), ''))
    return t
  })

  if (dropped.size) note(`dropped template tags: ${[...dropped].join(', ')}`)
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

function unzipToTemp(zipPath) {
  const AdmZip = createRequire(import.meta.url)('adm-zip')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platinum-import-md-'))
  new AdmZip(zipPath).extractAllTo(dir, true)
  // Notion and others wrap everything in a single top-level folder.
  const top = fs.readdirSync(dir).filter((n) => !n.startsWith('.') && n !== '__MACOSX')
  return top.length === 1 && fs.statSync(path.join(dir, top[0])).isDirectory() ? path.join(dir, top[0]) : dir
}

function walk(root) {
  const files = []
  const visit = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, ent.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (ent.isDirectory()) { if (!SKIP_DIRS.test(rel + '/')) visit(full); continue }
      if (ent.name === '.DS_Store') continue
      files.push({ rel, full })
    }
  }
  visit(root)
  return files
}

function collectCsv(csvPath, ctx) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8'))
  ctx.note('CSV columns were matched by name heuristically (title, slug, content, published date, tags); open the CSV if something is off')
  const get = (row, names) => {
    for (const k of Object.keys(row)) if (names.includes(k.toLowerCase())) return row[k]
    return ''
  }
  return rows.map((row, i) => {
    const content = get(row, ['content', 'body', 'markdown', 'text'])
    const published = get(row, ['publish', 'published', 'is_published']).toLowerCase()
    const isPage = get(row, ['is_page', 'page']).toLowerCase()
    return {
      id: get(row, ['uid', 'id', 'slug']) || `row-${i + 1}`,
      kind: isPage === 'true' ? 'page' : 'post',
      draft: published !== '' && published !== 'true',
      title: get(row, ['title']),
      date: toIsoDate(get(row, ['published_date', 'first_published_at', 'date', 'created', 'created_at'])),
      slug: get(row, ['slug', 'alias']),
      tags: get(row, ['all_tags', 'tags']).split(',').map((t) => t.trim()).filter(Boolean),
      description: get(row, ['meta_description', 'description']),
      image: get(row, ['meta_image', 'image']),
      markdown: content,
      notes: [],
    }
  })
}

async function collect(opts, ctx) {
  let root = path.resolve(opts.src)
  if (!fs.existsSync(root)) throw new Error(`source not found: ${root}`)
  if (fs.statSync(root).isFile()) {
    if (/\.csv$/i.test(root)) return collectCsv(root, ctx)
    if (/\.zip$/i.test(root)) root = unzipToTemp(root)
    else throw new Error('--src must be a folder, a zip, or a CSV')
  }

  const files = walk(root)
  const mdFiles = files.filter((f) => MD_EXT.test(f.rel))
  const byBasename = new Map()
  for (const f of files) {
    const b = path.posix.basename(f.rel).toLowerCase()
    if (!byBasename.has(b)) byBasename.set(b, f.full)
  }
  const hasContentDir = files.some((f) => /^content\//.test(f.rel))

  const records = []
  for (const f of mdFiles) {
    const stat = fs.statSync(f.full)
    const { data, body: rawBody, had, broken } = parseFrontMatter(fs.readFileSync(f.full, 'utf-8'))
    const base = path.posix.basename(f.rel)
    const stem = base.replace(MD_EXT, '')
    const parent = path.posix.basename(path.posix.dirname(f.rel))
    const isBundle = /^index$/i.test(stem) && parent && parent !== '.'
    const nameStem = isBundle ? parent : stem
    const notes = []
    if (broken) notes.push('the front matter did not parse; fields were taken from the body and filename')

    let kind = 'post'
    if (/^(readme|license|licence|changelog|contributing|code_of_conduct)$/i.test(stem)) kind = 'other'
    else if (stem === '_index') kind = 'page'
    else if (['page', 'pages'].includes(String(data.layout || data.type || data.kind || '').toLowerCase()) || data.is_page === true) kind = 'page'
    else if (hasContentDir && /^content\/[^/]+\.(md|mdx|markdown)$/i.test(f.rel)) kind = 'page'

    let dateStr = pick(data, DATE_KEYS)
    let date = toIsoDate(dateStr)
    if (!date) date = toIsoDate(nameStem.match(/^(\d{4}-\d{2}-\d{2})[-_]/)?.[1] || f.rel.match(/(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\//)?.slice(1).join('-') || '')
    if (!date && data.layout && !POST_LAYOUTS.test(String(data.layout))) kind = kind === 'post' ? 'page' : kind
    let usedMtime = false
    if (!date && kind === 'post') { date = toIsoDate(stat.mtime); usedMtime = true }

    let body = rawBody
    let title = typeof data.title === 'string' ? data.title.trim() : ''
    if (!title) {
      const h1 = body.match(/^\s*#\s+(.+)\r?\n/)
      if (h1) { title = h1[1].trim(); body = body.replace(h1[0], '') }
    }
    if (!title && had === false) title = humanize(stem === 'index' ? nameStem : stem)
    if (!title) title = humanize(nameStem)
    title = stripIds(title)

    let slug = typeof data.slug === 'string' ? data.slug : ''
    if (!slug && typeof data.permalink === 'string' && !/[{}]/.test(data.permalink)) slug = data.permalink.replace(/\/+$/, '').split('/').pop() || ''
    if (!slug && typeof data.url === 'string' && !/[{}]/.test(data.url)) slug = data.url.replace(/\/+$/, '').split('/').pop() || ''
    if (!slug) slug = stripIds(nameStem).replace(/^\d{4}-\d{2}-\d{2}[-_]/, '')

    const draft =
      /(^|\/)_?drafts?\//i.test(f.rel) || data.draft === true || data.published === false || data.publish === false ||
      String(data.status || '').toLowerCase() === 'draft'

    records.push({
      id: f.rel,
      kind,
      draft,
      title,
      date,
      slug,
      tags: tagsOf(data),
      description: descriptionOf(data),
      image: imageOf(data),
      _body: body,
      _dir: path.dirname(f.full),
      _nameStem: nameStem,
      _stem: stem,
      notes: usedMtime ? [...notes, 'no date in the front matter or filename; the file modification time was used'] : notes,
    })
  }

  // Wiki-links and refs resolve against the posts that exist in this import.
  const slugByName = new Map()
  for (const r of records) {
    if (r.kind !== 'post') continue
    const s = slugify(r.slug) || slugify(r.title)
    if (!s) continue
    for (const key of [r._nameStem, r._stem, stripIds(r._nameStem), r.title, r.id, r.id.replace(MD_EXT, ''), r.slug]) {
      if (key) slugByName.set(String(key).toLowerCase(), s)
    }
  }
  const resolveRef = (target) => {
    const t = decodeURIComponent(String(target)).replace(/^\.?\//, '').replace(MD_EXT, '').replace(/\/$/, '')
    const candidates = [t, path.posix.basename(t), stripIds(path.posix.basename(t)), t.replace(/^_posts\//, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''), path.posix.basename(t).replace(/^\d{4}-\d{2}-\d{2}-/, '')]
    for (const c of candidates) {
      const s = slugByName.get(c.toLowerCase())
      if (s) return `/writing/${s}`
    }
    return null
  }

  for (const r of records) {
    if (r.kind !== 'post') { delete r._body; continue }
    const note = (n) => r.notes.push(n)
    r.markdown = transformBody(r._body, { resolveRef, note })
    const dir = r._dir
    r.resolveLocal = (ref) => {
      let clean = ref.split('?')[0].split('#')[0]
      try { clean = decodeURIComponent(clean) } catch { /* keep */ }
      const candidates = [
        path.resolve(dir, clean),
        path.join(root, clean.replace(/^\//, '')),
        path.join(root, 'static', clean.replace(/^\//, '')),
        path.join(root, 'public', clean.replace(/^\//, '')),
        path.join(root, 'src', clean.replace(/^\//, '')),
        path.join(root, 'assets', clean.replace(/^\//, '')),
      ]
      for (const c of candidates) {
        if (c.startsWith(root + path.sep) && fs.existsSync(c) && fs.statSync(c).isFile()) return c
      }
      return byBasename.get(path.posix.basename(clean).toLowerCase()) || null
    }
    delete r._body
    delete r._dir
    delete r._nameStem
    delete r._stem
  }
  return records
}

runImporter({ source: 'markdown', argv: process.argv.slice(2), help: HELP, collect }).catch((err) => {
  process.stderr.write(`markdown: ${err.message}\n`)
  process.exit(1)
})
