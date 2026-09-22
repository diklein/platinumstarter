#!/usr/bin/env node
/**
 * scripts/import/ghost.mjs: a Ghost JSON export → MDX.
 *
 * Reads db[0].data.{posts, posts_tags, tags}. Each post's body is rendered from its
 * Lexical document (Ghost 5.x), else its Mobiledoc document (Ghost 1 to 4), else the
 * pre-rendered html field. Pages are skipped; drafts and scheduled posts unless --drafts.
 *
 * Usage:
 *   node scripts/import/ghost.mjs --src export.json [--site-url https://blog.example.com]
 *                                 [--dry-run] [--drafts] [--fetch-media] [--force]
 */
import {
  escapeMdxText,
  htmlToMarkdown,
  readSourceEntries,
  runImporter,
  stripHtml,
  toIsoDate,
} from '../migration-utils.mjs'

const HELP = `
ghost: import a Ghost JSON export

  node scripts/import/ghost.mjs --src <export.json | zip> [options]

  --src <path>       the .json export (Settings → Labs → Export your content) or a zip of it
  --site-url <url>   your Ghost site's URL, to resolve the __GHOST_URL__ placeholder in
                     image paths (without it those images stay unresolved and are listed)
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include draft and scheduled posts
  --fetch-media      download the images posts reference (offline otherwise)
  --force            rewrite posts this importer already wrote
`

// ---------------------------------------------------------------------------
// Shared bits for both document formats
// ---------------------------------------------------------------------------

const MARK = { strong: '**', b: '**', em: '_', i: '_', code: '`', s: '~~', del: '~~', strike: '~~' }

function wrap(mark, text) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  return m && m[2] ? m[1] + mark + m[2] + mark + m[3] : text
}

function caption(html) {
  const md = htmlToMarkdown(html || '').trim()
  return md ? `\n\n${md}` : ''
}

function image(src, alt, cap, href) {
  if (!src) return ''
  const md = `![${(alt || stripHtml(cap) || '').replace(/[[\]]/g, '')}](${src})`
  return (href ? `[${md}](${href})` : md) + caption(cap)
}

function fence(code, language) {
  const body = String(code || '').replace(/\s+$/, '')
  const f = body.includes('```') ? '~~~~' : '```'
  return `${f}${language || ''}\n${body}\n${f}`
}

/** Ghost's cards (Mobiledoc) and custom nodes (Lexical) share payload shapes. */
function renderCard(name, p, note) {
  switch (name) {
    case 'image':
      return image(p.src, p.alt, p.caption, p.href)
    case 'gallery':
      return (p.images || []).map((i) => image(i.src, i.alt, i.caption)).join('\n\n') + caption(p.caption)
    case 'markdown':
      return p.markdown || ''
    case 'html':
      return htmlToMarkdown(p.html || '')
    case 'code':
    case 'codeblock':
      return fence(p.code, p.language) + caption(p.caption)
    case 'embed':
      return (p.url || htmlToMarkdown(p.html || '')) + caption(p.caption)
    case 'bookmark': {
      const url = p.url || p.metadata?.url || ''
      const title = p.metadata?.title || url
      const desc = p.metadata?.description ? `\n\n${stripHtml(p.metadata.description)}` : ''
      return url ? `[${title}](${url})${desc}${caption(p.caption)}` : ''
    }
    case 'hr':
    case 'horizontalrule':
      return '---'
    case 'callout': {
      const text = htmlToMarkdown(p.calloutText || '').split('\n').join('\n> ')
      return `> ${p.calloutEmoji ? p.calloutEmoji + ' ' : ''}${text}`
    }
    case 'toggle':
      return `**${stripHtml(p.header)}**\n\n${htmlToMarkdown(p.content || '')}`
    case 'header':
      return `## ${stripHtml(p.header)}${p.subheader ? `\n\n${stripHtml(p.subheader)}` : ''}`
    case 'button':
      return p.buttonUrl ? `[${p.buttonText || p.buttonUrl}](${p.buttonUrl})` : ''
    case 'paywall':
      note('the post had a paywall; everything below the marker was members-only on Ghost')
      return 'GHOST-PAYWALL-MARKER'
    case 'file':
    case 'audio':
    case 'video':
    case 'product': {
      const src = p.src || p.productUrl || p.url || ''
      note(`a ${name} card became a plain link${src ? '' : ' (no source URL in the export)'}`)
      return src ? `[${p.title || p.fileTitle || p.productTitle || src}](${src})` : ''
    }
    case 'email':
    case 'email-cta':
    case 'signup':
      note(`an email-only ${name} card was dropped`)
      return ''
    default:
      note(`unsupported card "${name}" was dropped`)
      return ''
  }
}

// ---------------------------------------------------------------------------
// Mobiledoc (Ghost 1 to 4)
// ---------------------------------------------------------------------------

export function renderMobiledoc(doc, note) {
  const markups = doc.markups || []
  const atoms = doc.atoms || []
  const cards = doc.cards || []

  const inline = (markers) => {
    let out = ''
    const stack = []
    const open = (idx) => {
      const [tag, attrs = []] = markups[idx] || ['span']
      const href = attrs[attrs.indexOf('href') + 1]
      stack.push({ tag, href })
      out += tag === 'a' ? '[' : MARK[tag] || ''
    }
    const close = () => {
      const m = stack.pop()
      if (!m) return
      out += m.tag === 'a' ? `](${m.href || ''})` : MARK[m.tag] || ''
    }
    for (const marker of markers || []) {
      const [type, opens = [], closeCount = 0, value] = marker
      for (const i of opens) open(i)
      if (type === 0) out += escapeMdxText(String(value ?? ''))
      else if (type === 1) {
        const atom = atoms[value]
        out += atom?.[0] === 'soft-return' ? '\\\n' : escapeMdxText(String(atom?.[1] ?? ''))
      }
      for (let c = 0; c < closeCount; c++) close()
    }
    while (stack.length) close()
    return out
  }

  const blocks = []
  for (const section of doc.sections || []) {
    switch (section[0]) {
      case 1: {
        const [, tag, markers] = section
        const text = inline(markers).trim()
        if (!text) break
        if (/^h[1-6]$/.test(tag)) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`)
        else if (tag === 'blockquote' || tag === 'aside') blocks.push(text.split('\n').map((l) => `> ${l}`).join('\n'))
        else blocks.push(text)
        break
      }
      case 2:
        blocks.push(image(section[1], ''))
        break
      case 3: {
        const [, tag, items] = section
        blocks.push((items || []).map((it, i) => (tag === 'ol' ? `${i + 1}. ` : '- ') + inline(it).trim()).join('\n'))
        break
      }
      case 10: {
        const card = cards[section[1]]
        if (card) blocks.push(renderCard(card[0], card[1] || {}, note))
        break
      }
      default:
        break
    }
  }
  return blocks.filter(Boolean).join('\n\n')
}

// ---------------------------------------------------------------------------
// Lexical (Ghost 5)
// ---------------------------------------------------------------------------

export function renderLexical(root, note) {
  const inline = (children) =>
    (children || [])
      .map((n) => {
        switch (n.type) {
          case 'text':
          case 'extended-text': {
            let t = escapeMdxText(String(n.text ?? ''))
            const f = n.format || 0
            if (f & 16) t = wrap('`', t)
            if (f & 1) t = wrap('**', t)
            if (f & 2) t = wrap('_', t)
            if (f & 4) t = wrap('~~', t)
            return t
          }
          case 'linebreak':
            return '\\\n'
          case 'tab':
            return '\t'
          case 'link':
          case 'autolink':
            return `[${inline(n.children)}](${n.url || ''})`
          default:
            return inline(n.children)
        }
      })
      .join('')

  const list = (n, depth) => {
    const ordered = n.listType === 'number'
    const start = n.start || 1
    return (n.children || [])
      .map((li, i) => {
        const marker = ordered ? `${start + i}. ` : '- '
        const nested = (li.children || []).filter((c) => c.type === 'list')
        const own = (li.children || []).filter((c) => c.type !== 'list')
        const head = (li.checked === true ? '[x] ' : li.checked === false ? '[ ] ' : '') + inline(own).trim()
        const tail = nested.map((c) => list(c, depth + 1)).join('\n')
        const pad = ' '.repeat(marker.length)
        return marker + head + (tail ? '\n' + tail.split('\n').map((l) => pad + l).join('\n') : '')
      })
      .join('\n')
  }

  const block = (n) => {
    switch (n.type) {
      case 'paragraph':
        return inline(n.children).trim()
      case 'heading':
      case 'extended-heading': {
        const level = Number(String(n.tag || 'h2').replace(/\D/g, '')) || 2
        return `${'#'.repeat(level)} ${inline(n.children).trim()}`
      }
      case 'quote':
      case 'extended-quote':
      case 'aside':
        return inline(n.children).trim().split('\n').map((l) => `> ${l}`).join('\n')
      case 'list':
        return list(n, 0)
      case 'code':
        return fence((n.children || []).map((c) => (c.type === 'linebreak' ? '\n' : c.text || '')).join(''), n.language)
      default:
        return renderCard(n.type, n, note)
    }
  }

  return (root?.children || []).map(block).filter(Boolean).join('\n\n')
}

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

function parseDoc(json) {
  if (!json || typeof json !== 'string') return null
  try {
    const doc = JSON.parse(json)
    return doc && typeof doc === 'object' ? doc : null
  } catch {
    return null
  }
}

async function collect(opts, ctx) {
  const entries = await readSourceEntries(opts.src)
  const jsonEntry = entries.find((e) => /\.json$/i.test(e.name)) || entries[0]
  if (!jsonEntry) throw new Error('no .json file found in the source')
  const raw = JSON.parse(jsonEntry.read().toString('utf-8'))
  const data = raw.db?.[0]?.data ?? raw.data ?? raw
  const posts = data.posts || []
  if (!Array.isArray(posts)) throw new Error('no posts array in the export (expected db[0].data.posts)')

  const tagsById = new Map((data.tags || []).map((t) => [t.id, t]))
  const postTags = new Map()
  const links = [...(data.posts_tags || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  for (const pt of links) {
    const t = tagsById.get(pt.tag_id)
    if (!t || t.visibility === 'internal' || String(t.name || '').startsWith('#')) continue
    if (!postTags.has(pt.post_id)) postTags.set(pt.post_id, [])
    postTags.get(pt.post_id).push(t.slug || t.name)
  }

  const siteUrl = (opts['site-url'] || '').replace(/\/+$/, '')
  let placeholders = 0
  const resolveUrl = (s) => {
    if (typeof s !== 'string') return s
    if (s.includes('__GHOST_URL__')) {
      if (siteUrl) return s.split('__GHOST_URL__').join(siteUrl)
      placeholders++
    }
    return s
  }

  const records = posts.map((post) => {
    const notes = []
    const note = (n) => notes.push(n)
    let markdown = null
    let html = null
    const lexical = parseDoc(post.lexical)
    const mobiledoc = parseDoc(post.mobiledoc)
    if (lexical?.root) markdown = renderLexical(lexical.root, note)
    else if (mobiledoc?.sections) markdown = renderMobiledoc(mobiledoc, note)
    else if (post.html) html = post.html
    else markdown = ''
    if (markdown !== null) {
      markdown = resolveUrl(markdown).replace(/GHOST-PAYWALL-MARKER/g, '{/* Ghost paywall: everything below was members-only */}')
    } else {
      html = resolveUrl(html)
    }
    if (post.visibility && post.visibility !== 'public') note(`visibility was "${post.visibility}" on Ghost (members-only post)`)
    const rec = {
      id: post.id || post.uuid || post.slug,
      kind: post.type === 'page' ? 'page' : 'post',
      draft: post.status !== 'published',
      title: post.title,
      date: toIsoDate(post.published_at) || toIsoDate(post.created_at),
      slug: post.slug,
      tags: postTags.get(post.id) || [],
      description: post.custom_excerpt || '',
      image: resolveUrl(post.feature_image || ''),
      notes,
    }
    if (markdown !== null) rec.markdown = markdown
    else rec.html = html
    return rec
  })

  if (placeholders && !siteUrl) {
    ctx.warn(`${placeholders} __GHOST_URL__ placeholder${placeholders === 1 ? '' : 's'} left unresolved; pass --site-url https://your-ghost-site to turn them into fetchable URLs`)
  }
  return records
}

runImporter({
  source: 'ghost',
  argv: process.argv.slice(2),
  help: HELP,
  values: ['site-url'],
  collect,
}).catch((err) => {
  process.stderr.write(`ghost: ${err.message}\n`)
  process.exit(1)
})
