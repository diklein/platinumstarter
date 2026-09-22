#!/usr/bin/env node
/**
 * scripts/import/substack.mjs: a Substack export zip → MDX.
 *
 * The zip carries posts.csv (post_id, post_date, is_published, type, title, subtitle,
 * audience, podcast_url, ...) and posts/<post_id>.html per post. The subtitle becomes the
 * description; unpublished rows are skipped unless --drafts; a paywall marker in the HTML
 * becomes an MDX comment and a note; subscribe widgets and share buttons are stripped.
 *
 * Usage:
 *   node scripts/import/substack.mjs --src export.zip [--dry-run] [--drafts] [--fetch-media] [--force]
 */
import {
  htmlToMarkdown,
  parseCsv,
  readSourceEntries,
  runImporter,
  toIsoDate,
  transformHtml,
} from '../migration-utils.mjs'

const HELP = `
substack: import a Substack export

  node scripts/import/substack.mjs --src <export.zip | unzipped folder> [options]

  --src <path>       the export zip (Settings → Exports → New export) or its unzipped folder
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include unpublished posts
  --fetch-media      download the images posts reference (offline otherwise)
  --force            rewrite posts this importer already wrote
`

const PAYWALL = 'SUBSTACK-PAYWALL-MARKER'
const STRIP = new Set([
  'subscription-widget-wrap', 'subscription-widget', 'subscribe-widget', 'button-wrapper',
  'captioned-button-wrap', 'share-dialog', 'community-subscribe', 'comments-button', 'poll-embed',
  'image-link-expand', 'digest-post-embed', 'install-substack-app-embed',
])

/** Substack's editor HTML, reduced to what the reader saw. */
export function cleanSubstackHtml(html, note) {
  let footnotesNoted = false
  return transformHtml(html, (node, h) => {
    const cls = h.cls(node)
    if (cls.some((c) => STRIP.has(c))) {
      if (cls.includes('poll-embed')) note('a poll was dropped (polls do not export)')
      return 'remove'
    }
    if (cls.some((c) => /paywall/.test(c)) || h.attr(node, 'data-component-name') === 'PaywallToDOM') {
      return { html: `<p>${PAYWALL}</p>` }
    }
    if (node.tagName === 'a' && cls.includes('image-link')) {
      // The link is the original upload; the img is a resized webp derivative.
      const img = h.find(node, 'img')
      const href = h.attr(node, 'href')
      if (img && href) h.setAttr(img, 'src', href)
      return undefined
    }
    if (node.tagName === 'div' && cls.includes('embedded-post')) {
      const link = h.find(node, 'a')
      const url = link ? h.attr(link, 'href') : ''
      return url ? { html: `<p><a href="${url}">${h.text(node) || url}</a></p>` } : 'remove'
    }
    if (node.tagName === 'div' && cls.includes('tweet')) {
      // A tweet embed: the whole card is chrome (avatar, counts, two links). Substack keeps the
      // tweet's own data in data-attrs, so the reader gets a quote, who said it, and the link.
      let d = {}
      try { d = JSON.parse(h.attr(node, 'data-attrs') || '{}') } catch { /* fall back to the text */ }
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      // full_text carries Substack's own markup for mentions (<span class="tweet-fake-link">)
      // and entities; the words are all the quote needs.
      const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      const text = esc(plain(d.full_text || h.text(node) || '').trim()).replace(/\n+/g, '<br>')
      const url = d.url || h.attr(h.find(node, 'a'), 'href') || ''
      const who = d.name ? `${esc(d.name)}${d.username ? ` (@${esc(d.username)})` : ''}` : d.username ? `@${esc(d.username)}` : ''
      const photos = (Array.isArray(d.photos) ? d.photos : []).map((p) => (typeof p === 'string' ? p : p?.url)).filter(Boolean)
      if (!text && !url) return 'remove'
      const source = url ? `<a href="${url}">${who || 'on X'}</a>` : who
      return { html: `<blockquote><p>${text}</p>${source ? `<p>${source}</p>` : ''}</blockquote>${photos.map((p) => `<figure><img src="${p}" alt=""></figure>`).join('')}` }
    }
    if (node.tagName === 'div' && cls.includes('native-video-embed')) {
      note('a native video was dropped (Substack does not export video files)')
      return 'remove'
    }
    if (node.tagName === 'div' && cls.includes('pullquote')) {
      return { html: `<blockquote><p>${h.text(node)}</p></blockquote>` }
    }
    if (node.tagName === 'div' && cls.includes('youtube-wrap')) {
      const id = h.attr(node, 'data-attrs').match(/"videoId"\s*:\s*"([^"]+)"/)?.[1]
      const iframe = h.find(node, 'iframe')
      const src = id ? `https://www.youtube.com/watch?v=${id}` : iframe ? h.attr(iframe, 'src') : ''
      return src ? { html: `<p>${src}</p>` } : 'remove'
    }
    if (node.tagName === 'span' && cls.includes('footnote-hovercard-target')) {
      const a = h.find(node, 'a')
      return { html: a ? `<sup>${h.text(a)}</sup>` : '' }
    }
    if (node.tagName === 'a' && /^#footnote-/.test(h.attr(node, 'href') || '')) {
      // The export carries the reference numbers and not the footnotes themselves (2025
      // exports, checked): the number stays as a superscript so the sentence still reads, and
      // the run says the notes need to be brought over by hand.
      if (!footnotesNoted) note('footnote numbers kept as superscripts; Substack does not export the footnotes themselves, add them by hand from the live post')
      footnotesNoted = true
      return { html: `<sup>${h.text(node)}</sup>` }
    }
    return undefined
  })
}

async function collect(opts, ctx) {
  const entries = await readSourceEntries(opts.src)
  const csvEntry = entries.find((e) => /(^|\/)posts\.csv$/i.test(e.name))
  if (!csvEntry) throw new Error('posts.csv not found in the export')
  const rows = parseCsv(csvEntry.read().toString('utf-8'))
  ctx.log(`${rows.length} rows in posts.csv`)

  return rows.map((row) => {
    const id = row.post_id || ''
    const file = entries.find(
      (e) => /\.html$/i.test(e.name) && (e.name.endsWith(`/posts/${id}.html`) || e.name === `posts/${id}.html` || e.name.endsWith(`/${id}.html`))
    )
    const notes = []
    const type = (row.type || 'newsletter').toLowerCase()
    let kind = 'other'
    if (type === 'newsletter' || type === 'podcast' || type === 'video') kind = 'post'
    else if (type === 'page') kind = 'page'
    if (kind === 'post' && !file) {
      ctx.warn(`no posts/${id}.html for "${row.title}"; skipped`)
      kind = 'other'
    }
    let markdown
    if (kind === 'post') {
      const html = cleanSubstackHtml(file.read().toString('utf-8'), (n) => notes.push(n))
      markdown = htmlToMarkdown(html)
      if (markdown.includes(PAYWALL)) {
        notes.push('the post had a paywall; everything below the marker was paid-only on Substack')
        markdown = markdown.replace(new RegExp(`\\\\?${PAYWALL}`, 'g'), '{/* Substack paywall: everything below was paid-only */}')
      }
      if (row.podcast_url) {
        markdown = `${row.podcast_url}\n\n${markdown}`.trim()
        notes.push('podcast episode: the audio URL is the first line of the body')
      }
      if (row.audience && row.audience !== 'everyone') notes.push(`audience was "${row.audience}" on Substack (paid post)`)
    }
    return {
      id,
      kind,
      draft: String(row.is_published).toLowerCase() !== 'true',
      title: row.title,
      date: toIsoDate(row.post_date),
      slug: id.includes('.') ? id.slice(id.indexOf('.') + 1) : '',
      tags: [],
      description: row.subtitle || '',
      markdown,
      notes,
    }
  })
}

runImporter({ source: 'substack', argv: process.argv.slice(2), help: HELP, collect }).catch((err) => {
  process.stderr.write(`substack: ${err.message}\n`)
  process.exit(1)
})
