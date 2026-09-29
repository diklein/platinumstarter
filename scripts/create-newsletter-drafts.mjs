#!/usr/bin/env node
/**
 * create-newsletter-drafts.mjs — Weekly digest. Collects every /writing post published
 * since the last run and creates ONE combined Buttondown DRAFT (each post as a titled
 * link + excerpt). It NEVER sends: the request forces status:"draft" (Buttondown sends
 * immediately if status is omitted). You review and send the digest yourself.
 *
 * Runs on a Saturday-morning schedule (see .github/workflows/newsletter-draft.yml).
 * Already-digested slugs are tracked in scripts/newsletter-emailed.json so a post is
 * only ever included once; a run with no new posts creates nothing.
 *
 * Modes:
 *   node scripts/create-newsletter-drafts.mjs            draft a digest of new posts
 *   node scripts/create-newsletter-drafts.mjs --dry-run  list what would be included
 *   node scripts/create-newsletter-drafts.mjs --seed      record ALL current posts as
 *                                                          already-digested (no draft)
 *
 * Usage: BUTTONDOWN_API_KEY=xxx node scripts/create-newsletter-drafts.mjs
 */

import { readFile, writeFile, readdir } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev convenience: load .env.local (holds BUTTONDOWN_API_KEY) if not already in env.
try {
  for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* no .env.local — rely on the real environment */ }

const API_KEY = process.env.BUTTONDOWN_API_KEY
const DRY_RUN = process.argv.includes('--dry-run')
const SEED = process.argv.includes('--seed')
// The digest links need the live origin: SITE_URL in the environment (the workflow sets it),
// else identity.url from site.config.ts (imported natively; Node 24 strips the types).
process.removeAllListeners('warning')
const SITE = (process.env.SITE_URL ?? (await import('../site.config.ts')).default?.identity?.url ?? '').replace(/\/$/, '')
if (!SITE) {
  console.error('create-newsletter-drafts: no site URL. Set SITE_URL in the environment or identity.url in site.config.ts.')
  process.exit(1)
}
const WRITING_DIR = path.resolve(__dirname, '../src/content/writing')
const STATE_PATH = path.resolve(__dirname, 'newsletter-emailed.json')

/** Minimal YAML-frontmatter reader for the single-line fields we need. */
function frontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { data: {}, content: raw }
  const data = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/)
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return { data, content: m[2] }
}

function excerptFrom(content) {
  for (const para of content.split(/\n\n+/)) {
    const t = para.trim()
    if (!t || /^[#!>]|^---|^\[[^\]]+\]:/.test(t)) continue
    const clean = t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (clean) return clean.length > 280 ? clean.slice(0, 280).replace(/\s\S*$/, '') + '…' : clean
  }
  return ''
}

async function articlePosts() {
  const files = (await readdir(WRITING_DIR)).filter((f) => f.endsWith('.mdx'))
  const posts = []
  for (const f of files) {
    const { data, content } = frontmatter(await readFile(path.join(WRITING_DIR, f), 'utf-8'))
    if (data.type !== 'article' || !data.slug || !data.title) continue
    posts.push({ slug: data.slug, title: data.title, date: data.date || '', excerpt: data.description || excerptFrom(content) })
  }
  return posts
}

async function writeState(slugs) {
  await writeFile(STATE_PATH, JSON.stringify([...slugs].sort(), null, 2) + '\n')
}

/** Build the combined digest: each post as a titled link + excerpt + read-more. */
function buildDigest(posts) {
  const subject = posts.length === 1
    ? posts[0].title
    : `${posts[0].title} & ${posts.length - 1} more`
  const body = posts
    .map((p) => `## [${p.title}](${SITE}/writing/${p.slug})\n\n${p.excerpt}\n\n[Read the full post →](${SITE}/writing/${p.slug})`)
    .join('\n\n---\n\n')
  return { subject, body }
}

/** One draft for the whole batch. */
async function createDigestDraft(posts) {
  const { subject, body } = buildDigest(posts)
  const res = await fetch('https://api.buttondown.com/v1/emails', {
    method: 'POST',
    headers: { Authorization: `Token ${API_KEY}`, 'Content-Type': 'application/json' },
    // status:"draft" is REQUIRED — omitting it makes Buttondown send to all subscribers.
    body: JSON.stringify({ subject, body, status: 'draft' }),
  })
  if (!res.ok) {
    console.error(`  ✗ Buttondown digest draft failed: ${res.status} ${await res.text()}`)
    return false
  }
  console.log(`  ✓ Digest draft created: "${subject}" (${posts.length} post${posts.length === 1 ? '' : 's'})`)
  return true
}

async function main() {
  // Seed: mark every current article as already-emailed so only FUTURE posts get drafts.
  if (SEED) {
    const slugs = (await articlePosts()).map((p) => p.slug)
    await writeState(slugs)
    console.log(`Seeded ${path.basename(STATE_PATH)} with ${slugs.length} existing posts (no drafts sent).`)
    return
  }

  // Safety: without the state file we'd draft every existing post. Refuse instead.
  if (!existsSync(STATE_PATH)) {
    console.error(`Refusing to run: ${path.basename(STATE_PATH)} is missing. Run with --seed first.`)
    process.exit(1)
  }
  if (!API_KEY && !DRY_RUN) {
    console.error('BUTTONDOWN_API_KEY not set.')
    process.exit(1)
  }

  const emailed = new Set(JSON.parse(await readFile(STATE_PATH, 'utf-8')))
  const fresh = (await articlePosts())
    .filter((p) => !emailed.has(p.slug))
    .sort((a, b) => b.date.localeCompare(a.date)) // newest first in the digest

  if (fresh.length === 0) {
    console.log('No new posts since the last digest.')
    return
  }
  console.log(`${fresh.length} new post(s) for this digest${DRY_RUN ? ' (dry run)' : ''}:`)
  for (const p of fresh) console.log(`  • "${p.title}" (${p.slug})`)

  if (DRY_RUN) {
    const { subject, body } = buildDigest(fresh)
    console.log(`\n── draft preview ──\nSubject: ${subject}\n\n${body}\n───────────────────`)
    return
  }

  // One combined draft; mark all included posts as digested only if it succeeded.
  if (await createDigestDraft(fresh)) {
    for (const p of fresh) emailed.add(p.slug)
    await writeState(emailed)
    console.log(`Updated ${path.basename(STATE_PATH)} (${emailed.size} slugs).`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
