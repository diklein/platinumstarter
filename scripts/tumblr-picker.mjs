#!/usr/bin/env node
/**
 * Serve a browser-based review UI for picking Tumblr posts.
 * Opens http://localhost:3333 — use Y/N keys to include/skip posts.
 * On finish, writes the --select argument to tumblr-selection.txt.
 *
 * Usage: node scripts/tumblr-picker.mjs
 */

import AdmZip from 'adm-zip'
import { createServer } from 'node:http'
import { writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const PORT = 3333
const ZIP_PATH       = path.join(process.cwd(), 'Tumblr', 'posts.zip')
const REGISTRY_PATH  = path.join(process.cwd(),
  '.planning/phases/08-content-migration-from-blog-portfolio-and-link-blog-sources/slug-registry.json')
const SELECTION_PATH = path.join(process.cwd(),
  '.planning/phases/08-content-migration-from-blog-portfolio-and-link-blog-sources/tumblr-selection.txt')

// ---------------------------------------------------------------------------
// Parsing helpers (mirrors migrate-tumblr.mjs so indices match exactly)
// ---------------------------------------------------------------------------

function isReblog(html) {
  return /<a\s+href="https?:\/\/[a-z0-9-]+\.tumblr\.com\/post\/[^"]+">[^<]+<\/a>:\s*<blockquote/i.test(html)
}

function extractFooter(html) {
  const footerMatch = html.match(/<div\s+id="footer">([\s\S]*?)<\/div>/i)
  if (!footerMatch) return { date: null, tags: [] }
  const inner = footerMatch[1]
  const tsMatch = inner.match(/<span\s+id="timestamp">([\s\S]*?)<\/span>/i)
  let date = null
  if (tsMatch) {
    let cleaned = tsMatch[1].trim().replace(/(\d+)(st|nd|rd|th)\b/, '$1')
    cleaned = cleaned.replace(/(\d)(am|pm)\b/i, '$1 $2')
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10)
  }
  const tags = []
  let m
  const tagRe = /<span\s+class="tag">([\s\S]*?)<\/span>/gi
  while ((m = tagRe.exec(inner)) !== null) {
    const t = m[1].trim()
    if (t) tags.push(t)
  }
  return { date, tags }
}

function extractMediaRefs(html) {
  const images = [], videos = []
  const re = /(?:src|href)="\.\.\/\.\.\/media\/([^"]+)"/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const f = m[1]
    if (f.toLowerCase().endsWith('.mp4')) videos.push(f)
    else images.push(f)
  }
  return { images, videos }
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function extractTitle(html) {
  const withoutFooter = html.replace(/<div\s+id="footer">[\s\S]*?<\/div>/i, '')
  const h1 = withoutFooter.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return stripHtml(h1[1]).slice(0, 120)
  const h2 = withoutFooter.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  if (h2) return stripHtml(h2[1]).slice(0, 120)
  return null
}

function extractPreview(html, max = 350) {
  const body = html
    .replace(/<div\s+id="footer">[\s\S]*?<\/div>/i, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
  return stripHtml(body).slice(0, max)
}

// ---------------------------------------------------------------------------
// Load posts — same filter/sort as migrate-tumblr.mjs so indices match
// ---------------------------------------------------------------------------

function loadPosts() {
  if (!existsSync(ZIP_PATH)) throw new Error(`Not found: ${ZIP_PATH}`)

  const zip = new AdmZip(ZIP_PATH)
  const entries = zip.getEntries()
    .filter(e => e.entryName.startsWith('html/') && e.entryName.endsWith('.html'))

  const selectable = []

  for (const entry of entries) {
    const rawHtml = entry.getData().toString('utf-8')
    const postId  = path.basename(entry.name, '.html')

    if (isReblog(rawHtml)) continue

    const { date, tags } = extractFooter(rawHtml)
    if (!date) continue

    const { images, videos } = extractMediaRefs(rawHtml)
    if (images.length === 0 && videos.length > 0) continue  // video-only

    const title   = extractTitle(rawHtml)
    const preview = extractPreview(rawHtml)
    const year    = date.slice(0, 4)

    selectable.push({ postId, date, year, title, preview, tags, imageCount: images.length })
  }

  // Same sort as migrate-tumblr.mjs
  selectable.sort((a, b) => a.date.localeCompare(b.date))

  // Assign 1-based indices
  return selectable.map((p, i) => ({ ...p, idx: i + 1 }))
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function buildHtml(posts) {
  const data = JSON.stringify(posts)
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tumblr Picker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0c0c0c;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  height:100vh;display:flex;flex-direction:column;overflow:hidden;user-select:none}

/* ── header ── */
#hd{background:#141414;border-bottom:1px solid #222;padding:10px 18px;
  display:flex;align-items:center;gap:16px;flex-shrink:0}
#yr{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  background:#222;color:#666;padding:3px 9px;border-radius:4px;min-width:38px;text-align:center}
#prog-wrap{flex:1;background:#222;height:3px;border-radius:2px}
#prog{background:#22c55e;height:3px;border-radius:2px;transition:width .15s}
#ct{font-size:12px;color:#555}#sel{font-size:12px;color:#22c55e;font-weight:600}

/* ── card ── */
#area{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;min-height:0}
#card{background:#161616;border:2px solid #222;border-radius:14px;padding:24px 28px;
  width:100%;max-width:660px;max-height:100%;overflow-y:auto;transition:border-color .12s,background .12s}
#card.yes{border-color:#22c55e;background:#0a1a0a}
#card.no {border-color:#1e1e1e;background:#111;opacity:.55}
#card.fy {animation:fy .18s ease}
#card.fn {animation:fn .18s ease}
@keyframes fy{0%{border-color:#22c55e;background:#0e2a0e}100%{border-color:#222;background:#161616}}
@keyframes fn{0%{border-color:#ef4444;background:#2a0a0a}100%{border-color:#1e1e1e;background:#111}}

#meta{display:flex;align-items:center;gap:8px;margin-bottom:4px}
#date{font-size:11px;color:#444;font-family:monospace}
#type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  padding:2px 6px;border-radius:3px;background:#1e1e1e;color:#555}
#imgs{font-size:11px;color:#555}
#title{font-size:17px;font-weight:600;line-height:1.35;margin:10px 0 8px;color:#e8e8e8}
#preview{font-size:13px;line-height:1.65;color:#777}
#tags{font-size:11px;color:#3a3a3a;margin-top:10px;line-height:1.6}
#num{font-size:11px;color:#2a2a2a;text-align:right;margin-top:14px}

/* ── footer controls ── */
#ft{background:#0e0e0e;border-top:1px solid #1a1a1a;padding:13px 20px;
  display:flex;align-items:center;justify-content:center;gap:24px;flex-shrink:0;flex-wrap:wrap}
.kh{display:flex;align-items:center;gap:7px;font-size:12px}
.k{background:#1e1e1e;border:1px solid #2e2e2e;border-bottom-width:2px;
  padding:3px 9px;border-radius:5px;font-size:11px;font-weight:600;color:#aaa;font-family:monospace}
.kl{color:#555}.kl.y{color:#22c55e}.kl.n{color:#f87171}
#done{background:#1d4ed8;color:#fff;border:none;padding:7px 18px;border-radius:7px;
  font-size:12px;font-weight:600;cursor:pointer;margin-left:8px}
#done:hover{background:#2563eb}

/* ── result overlay ── */
#result{display:none;position:fixed;inset:0;background:#0c0c0c;
  flex-direction:column;align-items:center;justify-content:center;padding:36px;gap:18px}
#result.show{display:flex}
#result h2{font-size:22px;color:#22c55e}
#result p{color:#666;font-size:13px;text-align:center;max-width:560px}
#cmd{background:#141414;border:1px solid #222;border-radius:10px;padding:18px 22px;
  max-width:680px;width:100%;font-family:monospace;font-size:12px;color:#22c55e;
  white-space:pre-wrap;word-break:break-all;line-height:1.7}
#cp{background:#1d4ed8;color:#fff;border:none;padding:9px 22px;border-radius:7px;
  font-size:13px;font-weight:600;cursor:pointer}
#cp:hover{background:#2563eb}
#sv{font-size:13px;color:#22c55e}
#back{background:#1e1e1e;color:#aaa;border:none;padding:7px 16px;border-radius:7px;font-size:12px;cursor:pointer}
#back:hover{background:#2a2a2a}
</style>
</head>
<body>

<div id="hd">
  <span id="yr">—</span>
  <span id="ct">0 / ${posts.length}</span>
  <div id="prog-wrap"><div id="prog" style="width:0%"></div></div>
  <span id="sel">0 selected</span>
</div>

<div id="area">
  <div id="card">
    <div id="meta">
      <span id="date"></span>
      <span id="type"></span>
      <span id="imgs"></span>
    </div>
    <div id="title"></div>
    <div id="preview"></div>
    <div id="tags"></div>
    <div id="num"></div>
  </div>
</div>

<div id="ft">
  <div class="kh"><span class="k">Y</span><span class="kl y">Include</span></div>
  <div class="kh"><span class="k">N</span><span class="kl n">Skip</span></div>
  <div class="kh"><span class="k">←</span><span class="kl">Back</span></div>
  <div class="kh"><span class="k">→</span><span class="kl">Forward</span></div>
  <div class="kh"><span class="k">U</span><span class="kl">Undo</span></div>
  <button id="done" onclick="finish()">Done →</button>
</div>

<div id="result">
  <h2>✓ Review complete</h2>
  <p id="rsummary"></p>
  <div id="cmd"></div>
  <div style="display:flex;gap:12px;align-items:center">
    <button id="cp" onclick="copyCmd()">Copy command</button>
    <button id="back" onclick="document.getElementById('result').classList.remove('show')">← Back</button>
  </div>
  <span id="sv"></span>
</div>

<script>
const POSTS = ${data}
const SK = 'tumblr-picker-v2-${posts.length}'

let decisions = JSON.parse(localStorage.getItem(SK) || 'null') || Array(POSTS.length).fill(null)
let cursor = 0

// Resume at first unreviewed
for (let i = 0; i < POSTS.length; i++) {
  if (decisions[i] === null) { cursor = i; break }
  if (i === POSTS.length - 1) cursor = i
}

const $  = id => document.getElementById(id)
const save = () => localStorage.setItem(SK, JSON.stringify(decisions))

function render() {
  const p = POSTS[cursor]
  const d = decisions[cursor]
  const card = $('card')

  card.className = d === true ? 'yes' : d === false ? 'no' : ''

  $('date').textContent    = p.date
  $('yr').textContent      = p.year
  $('type').textContent    = p.title ? 'post' : 'note'
  $('imgs').textContent    = p.imageCount > 0 ? '· ' + p.imageCount + ' img' : ''
  $('title').textContent   = p.title || ''
  $('title').style.display = p.title ? 'block' : 'none'
  $('preview').textContent = p.preview
  $('tags').textContent    = p.tags.length ? p.tags.map(t => '#'+t).join(' ') : ''
  $('num').textContent     = '#' + p.idx + ' of ' + POSTS.length

  const reviewed = decisions.filter(d => d !== null).length
  const selected = decisions.filter(d => d === true).length
  $('ct').textContent   = reviewed + ' / ' + POSTS.length
  $('sel').textContent  = selected + ' selected'
  $('prog').style.width = (reviewed / POSTS.length * 100) + '%'
}

function decide(yes) {
  decisions[cursor] = yes
  save()
  const card = $('card')
  card.className = yes ? 'fy' : 'fn'
  setTimeout(() => {
    if (cursor < POSTS.length - 1) cursor++
    render()
  }, 160)
}

function finish() {
  const selected = POSTS.filter((_, i) => decisions[i] === true).map(p => p.idx)
  if (!selected.length) { alert('No posts selected yet — use Y to include posts.'); return }
  const spec = selected.join(',')
  const cmd = 'node scripts/migrate-tumblr.mjs \\\\ --apply \\\\ --select "' + spec + '" \\\\ --registry .planning/phases/08-content-migration-from-blog-portfolio-and-link-blog-sources/slug-registry.json'
  $('rsummary').textContent = selected.length + ' posts selected out of ' + POSTS.length + '.'
  $('cmd').textContent = cmd
  $('result').classList.add('show')

  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected, spec })
  }).then(r => r.json())
    .then(() => { $('sv').textContent = '✓ Saved to tumblr-selection.txt' })
    .catch(() => { $('sv').textContent = '(Copy the command above)' })
}

function copyCmd() {
  navigator.clipboard.writeText($('cmd').textContent)
    .then(() => { $('cp').textContent = 'Copied!'; setTimeout(() => { $('cp').textContent = 'Copy command' }, 1500) })
}

document.addEventListener('keydown', e => {
  if ($('result').classList.contains('show')) {
    if (e.key === 'Escape') $('result').classList.remove('show')
    return
  }
  if (e.key === 'y' || e.key === 'Y')           decide(true)
  else if (e.key === 'n' || e.key === 'N')      decide(false)
  else if (e.key === 'ArrowLeft')               { if (cursor > 0) { cursor--; render() } }
  else if (e.key === 'ArrowRight')              { if (cursor < POSTS.length - 1) { cursor++; render() } }
  else if (e.key === 'u' || e.key === 'U')      { decisions[cursor] = null; save(); render() }
  else if (e.key === 'Enter')                   finish()
})

render()
</script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write('Loading Tumblr posts…\n')
  const posts = loadPosts()
  process.stdout.write(`Found ${posts.length} posts. Starting server on port ${PORT}…\n\n`)

  const html = buildHtml(posts)

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } else if (req.method === 'POST' && req.url === '/save') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const { selected, spec } = JSON.parse(body)
          const cmd = `node scripts/migrate-tumblr.mjs --apply --select "${spec}" --registry ${REGISTRY_PATH}\n`
          writeFileSync(SELECTION_PATH, cmd, 'utf-8')
          process.stdout.write(`\n✓ ${selected.length} posts selected. Saved to tumblr-selection.txt\n`)
          process.stdout.write(`\nRun:\n  node scripts/migrate-tumblr.mjs --apply --select "${spec.slice(0, 60)}${spec.length > 60 ? '…' : ''}" --registry <registry>\n`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`  Open → http://localhost:${PORT}\n\n`)
    process.stdout.write(`  Y / N   include or skip\n`)
    process.stdout.write(`  ← →     navigate\n`)
    process.stdout.write(`  U       undo decision\n`)
    process.stdout.write(`  Enter   done — show command\n\n`)
    process.stdout.write(`  Progress saves to localStorage — safe to reload.\n\n`)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
