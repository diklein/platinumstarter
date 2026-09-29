#!/usr/bin/env node
/**
 * scripts/import/feed.mjs: any RSS 2.0 or Atom feed → MDX. The universal fallback.
 *
 * A file path reads offline; --url fetches over the network. RSS bodies prefer
 * <content:encoded> over <description>; Atom bodies prefer <content> over <summary>.
 * A Blogger Atom export is an Atom feed with kind categories: comments, settings, and
 * templates are skipped, pages are skipped, and <app:draft> entries unless --drafts.
 *
 * Feeds are usually truncated to the newest 10 to 25 posts and often carry summaries
 * instead of full bodies; the importer says so and flags items that look cut off.
 *
 * Usage:
 *   node scripts/import/feed.mjs --src feed.xml [--dry-run] [--fetch-media] [--force]
 *   node scripts/import/feed.mjs --url https://example.com/feed.xml
 */
import {
  countWords,
  escapeMdxText,
  readSourceEntries,
  runImporter,
  slugify,
  stripHtml,
  toIsoDate,
  xmlBlocks,
  xmlElements,
  xmlText,
} from '../migration-utils.mjs'

const HELP = `
feed: import an RSS 2.0 or Atom feed (any platform that publishes one)

  node scripts/import/feed.mjs --src <feed.xml> [options]
  node scripts/import/feed.mjs --url <https://…/feed.xml> [options]

  --src <path>       a saved feed file (offline)
  --url <url>        fetch the feed over the network instead
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include Blogger draft entries
  --fetch-media      download the images posts reference (offline otherwise)
  --force            rewrite posts this importer already wrote
`

const TRUNCATED = /(\[…\]|\[\.\.\.\]|…|\.\.\.|read more|continue reading|keep reading)\s*$/i

async function loadFeed(opts) {
  if (opts.url) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(opts.url, {
        signal: ctrl.signal,
        headers: {
          'user-agent': 'platinum-import/1.0',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${opts.url}`)
      return await res.text()
    } finally {
      clearTimeout(timer)
    }
  }
  const entries = await readSourceEntries(opts.src)
  const entry = entries.find((e) => /\.(xml|rss|atom|feed)$/i.test(e.name)) || entries[0]
  if (!entry) throw new Error('no feed file in the source')
  return entry.read().toString('utf-8')
}

function slugFromLink(link) {
  try {
    const seg = new URL(link).pathname.split('/').filter(Boolean).pop() || ''
    return slugify(decodeURIComponent(seg).replace(/\.(html?|php|aspx?)$/i, ''))
  } catch {
    return ''
  }
}

function truncationNote(full, fallback) {
  if (full) return null
  const text = stripHtml(fallback)
  if (TRUNCATED.test(text) || countWords(text) < 60) {
    return 'the feed carried only a summary for this post (no full body); check the original'
  }
  return null
}

/** RSS 2.0 (and RSS 1.0 / RDF, which uses the same <item>). */
export function parseRss(xml) {
  return xmlBlocks(xml, 'item').map((item) => {
    const content = xmlText(item, 'content:encoded')
    const description = xmlText(item, 'description')
    const image =
      xmlElements(item, 'enclosure').find((e) => /^image\//.test(e.attrs.type || ''))?.attrs.url ||
      xmlElements(item, 'media:content').find((e) => /^image\//.test(e.attrs.type || '') || e.attrs.medium === 'image')?.attrs.url ||
      xmlElements(item, 'media:thumbnail')[0]?.attrs.url ||
      ''
    const link = xmlText(item, 'link') || xmlElements(item, 'link')[0]?.attrs.href || ''
    const summary = content ? stripHtml(description) : ''
    const notes = []
    const t = truncationNote(Boolean(content), description)
    if (t) notes.push(t)
    return {
      id: xmlText(item, 'guid') || link,
      kind: 'post',
      draft: false,
      title: stripHtml(xmlText(item, 'title')),
      date: toIsoDate(xmlText(item, 'pubDate') || xmlText(item, 'dc:date') || xmlText(item, 'dc:created')),
      slug: slugFromLink(link),
      tags: xmlElements(item, 'category').map((c) => c.text).filter(Boolean),
      description: summary.length <= 300 ? summary : '',
      image,
      html: content || description,
      notes,
    }
  })
}

/** Atom 1.0, Blogger's export dialect included. */
export function parseAtom(xml) {
  return xmlBlocks(xml, 'entry').map((entry) => {
    const categories = xmlElements(entry, 'category')
    const kindTerm = categories.find((c) => /schemas\.google\.com\/g\/2005#kind/.test(c.attrs.scheme || ''))?.attrs.term || ''
    let kind = 'post'
    if (kindTerm) {
      if (/#page$/.test(kindTerm)) kind = 'page'
      else if (!/#post$/.test(kindTerm)) kind = 'other'
    }
    const draft = /<app:draft>\s*yes\s*<\/app:draft>/i.test(entry)
    const links = xmlElements(entry, 'link')
    const alt = links.find((l) => (l.attrs.rel || 'alternate') === 'alternate' && (!l.attrs.type || /html/.test(l.attrs.type))) || links[0]
    const link = alt?.attrs.href || ''

    const asHtml = (tag) => {
      const open = entry.match(new RegExp(`<${tag}\\b[^>]*>`))
      if (!open) return ''
      const type = open[0].match(/\btype=["']([^"']+)["']/)?.[1] || 'text'
      if (type === 'xhtml') return xmlText(entry, tag, { raw: true }).replace(/^<div[^>]*>([\s\S]*)<\/div>$/, '$1')
      const value = xmlText(entry, tag)
      if (type === 'html' || /html/.test(type)) return value
      return value ? `<p>${escapeMdxText(value).replace(/\n\s*\n/g, '</p><p>')}</p>` : ''
    }
    const content = asHtml('content')
    const summary = asHtml('summary')
    const notes = []
    const t = truncationNote(Boolean(content), summary)
    if (t) notes.push(t)
    const tags = categories
      .filter((c) => !/schemas\.google\.com\/g\/2005#kind/.test(c.attrs.scheme || ''))
      .map((c) => c.attrs.term || c.attrs.label || c.text)
      .filter(Boolean)
    return {
      id: xmlText(entry, 'id') || link,
      kind,
      draft,
      title: stripHtml(xmlText(entry, 'title')),
      date: toIsoDate(xmlText(entry, 'published') || xmlText(entry, 'updated')),
      slug: slugFromLink(link),
      tags,
      description: content ? stripHtml(summary).slice(0, 300) : '',
      image: xmlElements(entry, 'media:thumbnail')[0]?.attrs.url || '',
      html: content || summary,
      notes,
    }
  })
}

async function collect(opts, ctx) {
  let xml = await loadFeed(opts)
  // Some tools write Atom with a namespace prefix on every element (`<ns0:feed
  // xmlns:ns0="http://www.w3.org/2005/Atom">`, Google's Blogger converter among them). The
  // prefix is dropped so the tag-name parsing below sees plain Atom.
  const prefixed = xml.match(/<([A-Za-z_][\w.-]*):feed\b[^>]*\bxmlns:\1=["']http:\/\/www\.w3\.org\/2005\/Atom["']/)
  if (prefixed) xml = xml.replace(new RegExp(`<(/?)${prefixed[1]}:`, 'g'), '<$1')
  const head = xml.slice(0, 4000)
  const isAtom = /<feed[\s>]/i.test(head) && !/<rss[\s>]/i.test(head)
  const records = isAtom ? parseAtom(xml) : parseRss(xml)
  ctx.log(`${isAtom ? 'Atom' : 'RSS'} feed, ${records.length} entries`)
  ctx.note('feeds usually carry only the newest 10 to 25 posts; this is not a full archive')
  return records
}

runImporter({ source: 'feed', argv: process.argv.slice(2), help: HELP, collect }).catch((err) => {
  process.stderr.write(`feed: ${err.message}\n`)
  process.exit(1)
})
