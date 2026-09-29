#!/usr/bin/env node
/**
 * scripts/import/medium.mjs: a Medium export zip → MDX.
 *
 * The zip carries posts/<YYYY-MM-DD>_<Title>-<hash>.html for published stories and
 * posts/draft_<Title>-<hash>.html for drafts (skipped unless --drafts). Each file is a
 * full HTML page: <h1 class="p-name"> title, a subtitle section, the body section, and a
 * footer with the publish <time> and the canonical link. The cleanup pass drops the
 * repeated title, Medium's section dividers, and the layout wrappers; link cards become
 * links; embeds become links to Medium's media proxy (the original URL is not exported).
 *
 * Usage:
 *   node scripts/import/medium.mjs --src medium-export.zip [--dry-run] [--drafts] [--fetch-media] [--force]
 */
import path from 'node:path'
import {
  readSourceEntries,
  runImporter,
  slugify,
  stripHtml,
  toIsoDate,
  transformHtml,
} from '../migration-utils.mjs'

const HELP = `
medium: import a Medium export

  node scripts/import/medium.mjs --src <medium-export.zip | unzipped folder> [options]

  --src <path>       the export zip (Settings → Security and apps → Download your information)
  --out <dir>        where the MDX goes (default: site.sources.writing)
  --images <dir>     where media goes (default: site.sources.images + /writing)
  --dry-run          print the plan, write nothing
  --drafts           include posts/draft_*.html
  --fetch-media      download the images posts reference (offline otherwise)
  --force            rewrite posts this importer already wrote
`

/** The fields a Medium export page carries, pulled out before the body is cleaned. */
export function parseMediumPost(name, html, mtime) {
  const base = path.posix.basename(name).replace(/\.html?$/i, '')
  const draft = /^draft_/.test(base)
  const title = stripHtml(
    html.match(/<h1[^>]*class="[^"]*p-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ??
      html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
      ''
  )
  const subtitle = stripHtml(html.match(/<section[^>]*data-field="subtitle"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '')
  const datetime =
    html.match(/<time[^>]*class="[^"]*dt-published[^"]*"[^>]*datetime="([^"]+)"/)?.[1] ||
    html.match(/<time[^>]*datetime="([^"]+)"[^>]*class="[^"]*dt-published[^"]*"/)?.[1] ||
    ''
  const date = toIsoDate(datetime) || toIsoDate(base.match(/^(\d{4}-\d{2}-\d{2})_/)?.[1]) || toIsoDate(mtime)
  const canonical =
    html.match(/<a[^>]*class="[^"]*p-canonical[^"]*"[^>]*href="([^"]+)"/)?.[1] ||
    html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*p-canonical[^"]*"/)?.[1] ||
    ''
  const body =
    html.match(/<section[^>]*data-field="body"[^>]*>([\s\S]*?)<\/section>\s*<footer/)?.[1] ??
    html.match(/<section[^>]*data-field="body"[^>]*>([\s\S]*)<\/section>/)?.[1] ??
    html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ??
    html
  const stem = base.replace(/^(\d{4}-\d{2}-\d{2}_|draft_)/, '').replace(/-+[0-9a-f]{8,}$/i, '')
  return { base, draft, title, subtitle, date, canonical, body, slug: slugify(stem) }
}

/** Medium's div-soup, reduced to what the reader saw. */
export function cleanMediumHtml(body, { title, subtitle }, note) {
  let strippedTitle = false
  let strippedSubtitle = false
  let dividers = 0
  return transformHtml(body, (node, h) => {
    const cls = h.cls(node)
    const tag = node.tagName
    if (!strippedTitle && /^h[1-6]$/.test(tag) && cls.includes('graf--title') && h.text(node) === title) {
      strippedTitle = true
      return 'remove'
    }
    if (!strippedSubtitle && /^h[1-6]$/.test(tag) && cls.includes('graf--subtitle') && (!subtitle || h.text(node) === subtitle)) {
      strippedSubtitle = true
      return 'remove'
    }
    if (tag === 'hr' && cls.includes('section-divider')) {
      dividers++
      return dividers === 1 ? 'remove' : undefined
    }
    if (tag === 'div' && cls.includes('graf--mixtapeEmbed')) {
      const a = h.find(node, 'a')
      const href = a ? h.attr(a, 'href') : ''
      const strong = h.find(node, 'strong')
      const text = strong ? h.text(strong) : h.text(node)
      return href ? { html: `<p><a href="${href}">${text || href}</a></p>` } : 'remove'
    }
    if (tag === 'figure' && cls.includes('graf--iframe')) {
      const iframe = h.find(node, 'iframe')
      const src = iframe ? h.attr(iframe, 'src') : ''
      const cap = h.find(node, 'figcaption')
      note("an embed became a link to Medium's media proxy (the export does not carry the original embed URL)")
      return src ? { html: `<p><a href="${src}">${src}</a></p>${cap ? `<p>${h.text(cap)}</p>` : ''}` } : 'remove'
    }
    if (tag === 'a') {
      const m = h.attr(node, 'href').match(/^https?:\/\/medium\.com\/r\/\?url=(.+)$/)
      if (m) h.setAttr(node, 'href', decodeURIComponent(m[1]))
    }
    return undefined
  })
}

async function collect(opts, ctx) {
  const entries = (await readSourceEntries(opts.src)).filter((e) => /(^|\/)posts\/[^/]+\.html?$/i.test(e.name))
  if (entries.length === 0) throw new Error('no posts/*.html files in the source')
  ctx.note('Medium exports carry no tags; add them by hand where they matter')
  return entries.map((e) => {
    const p = parseMediumPost(e.name, e.read().toString('utf-8'), e.mtime)
    const notes = new Set()
    const html = cleanMediumHtml(p.body, p, (n) => notes.add(n))
    return {
      id: p.canonical || `medium:${p.base}`,
      kind: 'post',
      draft: p.draft,
      title: p.title,
      date: p.date,
      slug: p.slug,
      tags: [],
      description: p.subtitle,
      html,
      notes: [...notes],
    }
  })
}

runImporter({ source: 'medium', argv: process.argv.slice(2), help: HELP, collect }).catch((err) => {
  process.stderr.write(`medium: ${err.message}\n`)
  process.exit(1)
})
