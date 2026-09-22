#!/usr/bin/env node
/**
 * scripts/import/wordpress.mjs: a WordPress WXR export (WordPress eXtended RSS) → MDX.
 *
 * Squarespace and Posthaven export the same format, so this is the parser those ride on.
 * Posts are written; pages, attachments, menus, and revisions are counted and skipped.
 * Drafts (any status but publish) are skipped unless --drafts.
 *
 * Usage:
 *   node scripts/import/wordpress.mjs --src export.xml [--dry-run] [--drafts] [--fetch-media]
 *                                     [--force] [--out DIR] [--images DIR]
 */
import {
  parseWxr,
  readSourceEntries,
  runImporter,
  stripHtml,
  toIsoDate,
} from '../migration-utils.mjs'

const HELP = `
wordpress: import a WordPress (or Squarespace, Posthaven) WXR export

  node scripts/import/wordpress.mjs --src <export.xml | folder | zip> [options]

  --src <path>       the .xml export (or a folder/zip that contains it)
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include unpublished posts (draft, pending, private, scheduled)
  --fetch-media      download the images posts reference (offline otherwise: paths are
                     rewritten and the URLs listed)
  --force            rewrite posts this importer already wrote
`

const BLOCK_START =
  /^\s*<(?:p|h[1-6]|ul|ol|li|blockquote|pre|figure|figcaption|div|table|thead|tbody|tr|td|th|hr|img|iframe|section|article|header|footer|dl|dt|dd|form|fieldset|video|audio|!--)\b/i

/**
 * The useful half of wpautop: classic-editor bodies keep paragraphs as blank lines with no
 * <p> tags at all. Chunks that already start with a block tag are left alone.
 */
export function wpAutop(html) {
  if (/<p[\s>]/i.test(html)) return html
  // A newline inside a tag (an alt text written on two lines) is not a paragraph break.
  const tagsFlattened = html.replace(/<[^>]+>/g, (tag) => tag.replace(/\s*\n\s*/g, ' '))
  return tagsFlattened
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => (BLOCK_START.test(chunk) ? chunk : `<p>${chunk}</p>`))
    .join('\n')
}

/**
 * The shortcodes worth translating. Anything else stays as literal text, which is what a
 * reader of the exported HTML would see too.
 */
export function translateShortcodes(html, note, gallery = null) {
  let out = html
  out = out.replace(/\[caption\b[^\]]*\]([\s\S]*?)\[\/caption\]/gi, (_, inner) => {
    const img = inner.match(/<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>|<img\b[^>]*>/i)?.[0] || ''
    const caption = (img ? inner.replace(img, '') : inner).trim()
    return `<figure>${img}<figcaption>${caption}</figcaption></figure>`
  })
  out = out.replace(/\[(?:embed|video|audio)\b[^\]]*\]\s*(\S+?)\s*\[\/(?:embed|video|audio)\]/gi, '<p>$1</p>')
  out = out.replace(/\[(?:video|audio)\b[^\]]*?(?:mp4|m4v|webm|ogv|src|mp3|m4a|ogg|wav)="([^"]+)"[^\]]*\]/gi, '<p>$1</p>')
  out = out.replace(/\[(?:code|sourcecode)\b([^\]]*)\]([\s\S]*?)\[\/(?:code|sourcecode)\]/gi, (_, attrs, code) => {
    const lang = attrs.match(/(?:lang|language)\s*=\s*"?([\w#+-]+)/i)?.[1] || ''
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`
  })
  // [gallery] is the WordPress way to show a post's images: `ids="7,9"` names attachments,
  // a bare [gallery] means every attachment uploaded to this post. The export carries the
  // attachments as items of their own (wp:post_parent, wp:menu_order, the caption in
  // excerpt:encoded), so the gallery is rebuilt as one captioned figure per image.
  const shown = new Set()
  out = out.replace(/\[gallery\b([^\]]*)\]/gi, (_, attrs) => {
    const ids = attrs.match(/\bids\s*=\s*["']?([\d,\s]+)/i)?.[1].split(',').map((s) => s.trim()).filter(Boolean)
    let images = []
    if (gallery) {
      if (ids?.length) images = ids.map((id) => gallery.attachments.get(id)).filter(Boolean)
      else images = [...gallery.attachments.values()].filter((a) => a.parent === gallery.postId).sort((a, b) => a.order - b.order || Number(a.id) - Number(b.id))
    }
    if (images.length === 0) {
      note(`a [gallery] shortcode was dropped (${ids?.length ? 'its attachments are not in the export' : 'the post has no attachments of its own'})`)
      return ''
    }
    // The same set twice in one post (a theme demo showing column counts, say) reads as one
    // gallery on a page that has no columns; the repeat is dropped.
    const key = images.map((a) => a.id).join(',')
    if (shown.has(key)) {
      note('a repeated [gallery] with the same images was dropped')
      return ''
    }
    shown.add(key)
    return images
      .map((a) => `<figure><img src="${a.url}" alt="${(a.alt || a.title || '').replace(/"/g, '&quot;')}">${a.caption ? `<figcaption>${a.caption}</figcaption>` : ''}</figure>`)
      .join('\n')
  })
  out = out.replace(/<!--more-->/g, '')
  return out
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

async function collect(opts, ctx) {
  const entries = await readSourceEntries(opts.src)
  const xmlEntry = entries.find((e) => /\.xml$/i.test(e.name)) || entries[0]
  if (!xmlEntry) throw new Error('no .xml file found in the source')
  const { items, title: siteTitle, link: siteLink } = parseWxr(xmlEntry.read().toString('utf-8'))
  if (siteTitle) ctx.log(`site: ${siteTitle}`)
  if (items.length === 0 && /squarespace\.com/i.test(siteLink || '')) {
    ctx.note('the export has no items: Squarespace exports blog posts only, so a site with no blog page (portfolio, gallery, and standard pages) exports empty')
  }

  const attachments = new Map()
  for (const it of items) {
    if (it.postType !== 'attachment') continue
    attachments.set(it.id, {
      id: it.id,
      url: it.attachmentUrl || it.guid,
      parent: it.parent,
      order: it.menuOrder,
      title: it.title,
      alt: it.meta._wp_attachment_image_alt || '',
      caption: stripHtml(it.excerpt),
    })
  }

  return items.map((it) => {
    let kind = 'other'
    if (it.postType === 'post') kind = 'post'
    else if (it.postType === 'page') kind = 'page'
    else if (it.postType === 'attachment') kind = 'attachment'
    if (it.status === 'trash' || it.status === 'auto-draft') kind = 'other'
    const notes = []
    const html = kind === 'post' ? wpAutop(translateShortcodes(it.html, (n) => notes.push(n), { postId: it.id, attachments })) : ''
    const featured = attachments.get(it.meta._thumbnail_id)?.url || ''
    return {
      id: it.id || it.guid || it.link,
      kind,
      draft: it.status !== 'publish',
      title: it.title,
      // wp:post_date is the site's local calendar date (what the author saw); pubDate is
      // an instant in UTC and can land on the previous day.
      date: toIsoDate(it.postDate) || toIsoDate(it.postDateGmt) || toIsoDate(it.pubDate),
      slug: safeDecode(it.postName),
      tags: [...it.categories.filter((c) => c !== 'uncategorized'), ...it.tags],
      description: stripHtml(it.excerpt),
      image: featured,
      html,
      notes,
    }
  })
}

runImporter({ source: 'wordpress', argv: process.argv.slice(2), help: HELP, collect }).catch((err) => {
  process.stderr.write(`wordpress: ${err.message}\n`)
  process.exit(1)
})
