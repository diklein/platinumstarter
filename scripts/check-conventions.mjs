#!/usr/bin/env node
/**
 * Convention tripwires.
 *
 * Every load-bearing rule in CLAUDE.md that used to live as prose (and got missed anyway) is a
 * function here. One check per function, one pass/fail line per check, exit 1 on any failure.
 * docs/conventions.md is the human-readable table; this file is the enforcement.
 *
 *   node scripts/check-conventions.mjs                 run everything
 *   node scripts/check-conventions.mjs --skip identity skip a check (comma-separate for several)
 *   node scripts/check-conventions.mjs --only layout   run one check
 *   node scripts/check-conventions.mjs --fix           apply the trivially safe fixes
 *
 * Check names match on the full id or any hyphen-separated word of it ("identity" matches
 * "no-hardcoded-identity", "layout" matches "page-needs-layout").
 *
 * Node 24 built-ins only. The root site.config.ts is imported natively (Node strips the types);
 * the "module type not specified" warning that import raises is silenced below because the
 * package deliberately has no "type" field.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

process.removeAllListeners('warning')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2)
const FIX = argv.includes('--fix')
const SKIP = new Set()
const ONLY = new Set()
for (let i = 0; i < argv.length; i++) {
  const [flag, inline] = argv[i].split('=')
  if (flag === '--skip' || flag === '--only') {
    const value = inline ?? argv[++i] ?? ''
    for (const name of value.split(',')) if (name.trim()) (flag === '--skip' ? SKIP : ONLY).add(name.trim())
  }
}

function matches(id, names) {
  if (names.has(id)) return true
  for (const word of id.split('-')) if (names.has(word)) return true
  return false
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

/** Every file under `dir` (relative paths, forward slashes), depth first, filtered. */
function walk(dir, keep = () => true, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, keep, out)
    else if (keep(full)) out.push(full.split(sep).join('/'))
  }
  return out
}

function read(file) {
  return readFileSync(file, 'utf8')
}

function isDir(p) {
  return existsSync(p) && statSync(p).isDirectory()
}

/**
 * Blank out comments while keeping every newline, so line numbers survive. Tracks string state
 * so a `//` inside a URL or a quoted string is not mistaken for a comment. Deliberately small:
 * it is a scanner for tripwires, not a parser. Known soft spot: an apostrophe in JSX text opens
 * a "string" until the end of that line, which can only hide a comment on the same line.
 */
function stripComments(src) {
  let out = ''
  let state = 'code'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const d = src[i + 1]
    if (state === 'code') {
      if (c === '/' && d === '/' && src[i - 1] !== ':') { state = 'line'; out += '  '; i++; continue }
      if (c === '/' && d === '*') { state = 'block'; out += '  '; i++; continue }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (c === '`') state = 'tpl'
      out += c
      continue
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c } else out += ' '
      continue
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { state = 'code'; out += '  '; i++ } else out += c === '\n' ? c : ' '
      continue
    }
    // Inside a string literal.
    if (c === '\\') { out += c + (d ?? ''); i++; continue }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code'
    else if (state !== 'tpl' && c === '\n') state = 'code'
    out += c
  }
  return out
}

/** Lines that are nothing but comment, for checks that scan data files line by line. */
function isCommentLine(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('{/*')
}

function snippet(line, max = 96) {
  const t = line.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function pascal(name) {
  return name.replace(/[^A-Za-z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : '')).replace(/^./, (ch) => ch.toUpperCase())
}

/** Result builder shared by every check. */
function result() {
  const r = { failures: [], notes: [], summary: '' }
  r.fail = (line) => r.failures.push(line)
  r.note = (line) => r.notes.push(line)
  return r
}

let configPromise
function loadConfig() {
  configPromise ??= (async () => {
    const [config, schema] = await Promise.all([
      import(resolve(ROOT, 'site.config.ts')),
      import(resolve(ROOT, 'src/lib/site-config-schema.ts')),
    ])
    return { site: config.default, ...schema }
  })()
  return configPromise
}

// ---------------------------------------------------------------------------------------------
// 1. page-needs-layout
// ---------------------------------------------------------------------------------------------

const APP = 'src/app'
const FOOTERLESS_TREES = ['src/app/lab/', 'src/app/api/']
const SITE_LAYOUT_JSX = /<SiteLayout[\s>/]/
const PAGE_FILE = /\/page\.(tsx|jsx|js|mdx)$/
const LAYOUT_NAMES = ['layout.tsx', 'layout.jsx', 'layout.js']

function findLayout(dir) {
  for (const name of LAYOUT_NAMES) {
    const p = join(dir, name).split(sep).join('/')
    if (existsSync(p)) return p
  }
  return null
}

function isPureRedirect(src) {
  const code = stripComments(src)
  const redirects = /\b(?:permanentRedirect|redirect)\s*\(/.test(code)
  const rendersJsx = /(?:return|=>)\s*\(?\s*</.test(code)
  return redirects && !rendersJsx
}

function checkPageNeedsLayout() {
  const r = result()
  const pages = walk(APP, (f) => PAGE_FILE.test(f))
  let allowlisted = 0
  let checked = 0
  let fixed = 0

  for (const page of pages) {
    if (FOOTERLESS_TREES.some((tree) => page.startsWith(tree))) { allowlisted++; continue }
    const src = read(page)
    if (isPureRedirect(src)) { allowlisted++; continue }
    checked++

    // Every layout from the page's own directory up to and including src/app.
    const wrappers = []
    let dir = dirname(page)
    let belowApp = 0
    while (true) {
      const layout = findLayout(dir)
      if (layout && SITE_LAYOUT_JSX.test(stripComments(read(layout)))) {
        wrappers.push(layout)
        if (dir !== APP) belowApp++
      }
      if (dir === APP) break
      dir = dirname(dir)
    }
    const rendersItself = SITE_LAYOUT_JSX.test(stripComments(src))
    if (rendersItself) wrappers.push(page)

    if (wrappers.length > 1) {
      r.fail(`${page}: SiteLayout is rendered ${wrappers.length} times in its ancestry (double footer): ${wrappers.join(', ')}`)
      continue
    }
    if (belowApp === 0 && !rendersItself) {
      const own = findLayout(dirname(page))
      if (FIX && !own) {
        const name = `${pascal(basename(dirname(page)).replace(/[[\]]/g, ''))}Layout`
        const file = join(dirname(page), 'layout.tsx').split(sep).join('/')
        writeFileSync(
          file,
          `import { SiteLayout } from '@/components/layout/site-layout'\n\nexport default function ${name}({ children }: { children: React.ReactNode }) {\n  return <SiteLayout>{children}</SiteLayout>\n}\n`
        )
        fixed++
        r.note(`wrote ${file}`)
        continue
      }
      r.fail(
        own
          ? `${page}: ${own} exists but does not render <SiteLayout> (no footer)`
          : `${page}: no layout.tsx wrapping <SiteLayout> in its directory or any ancestor below src/app (no footer)`
      )
    }
  }

  r.summary = `${checked} pages checked, ${allowlisted} allowlisted (lab, api, redirects)${fixed ? `, ${fixed} layouts written` : ''}`
  return r
}

// ---------------------------------------------------------------------------------------------
// 2. no-raw-img
// ---------------------------------------------------------------------------------------------

const RAW_IMG = /<img(?![A-Za-z0-9_-])/
const RAW_IMG_ESCAPE = /convention:\s*raw-img\b/

function checkNoRawImg() {
  const r = result()
  // /og is exempt (next/og renders raw <img> only); /lab is exempt (a gated sketchbook,
  // never on production, where the performance rule exists to matter).
  const files = walk('src', (f) => /\.(tsx|jsx)$/.test(f) && !f.startsWith('src/app/og/') && !f.startsWith('src/app/lab/'))
  let hits = 0
  for (const file of files) {
    const raw = read(file)
    if (!raw.includes('<img')) continue
    const rawLines = raw.split('\n')
    const lines = stripComments(raw).split('\n')
    lines.forEach((line, i) => {
      if (!RAW_IMG.test(line)) return
      const escaped = RAW_IMG_ESCAPE.test(rawLines[i]) || RAW_IMG_ESCAPE.test(rawLines[i - 1] ?? '')
      if (escaped) return
      hits++
      r.fail(`${file}:${i + 1}  ${snippet(line)}`)
    })
  }
  r.summary = hits ? `${hits} raw <img> outside next/image` : `${files.length} component files, every image goes through next/image`
  return r
}

// ---------------------------------------------------------------------------------------------
// 3. no-client-mdx-components
// ---------------------------------------------------------------------------------------------

const USE_CLIENT = /^\s*['"]use client['"]\s*;?\s*$/m
const IMPORT_FROM = /^\s*import\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm
const RESOLVE_EXT = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']

function resolveImport(fromFile, spec) {
  let base
  if (spec.startsWith('@/')) base = join('src', spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(fromFile), spec)
  else return null
  for (const ext of RESOLVE_EXT) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p.split(sep).join('/')
  }
  return null
}

function checkNoClientMdxComponents() {
  const r = result()
  const file = 'mdx-components.tsx'
  if (!existsSync(file)) { r.summary = 'no mdx-components.tsx at the root'; return r }
  const src = read(file)
  if (USE_CLIENT.test(stripComments(src))) r.fail(`${file}: contains 'use client'`)
  let imports = 0
  let clientImports = 0
  for (const m of stripComments(src).matchAll(IMPORT_FROM)) {
    const target = resolveImport(file, m[1])
    if (!target || !/\.(tsx|ts|jsx|js)$/.test(target)) continue
    imports++
    // Importing an isolated 'use client' file from a server module is the SANCTIONED
    // pattern (CLAUDE.md: "isolate interactive sub-components in their own files"), so
    // this is a note for the reader, never a failure. The failure above is the real rule.
    if (USE_CLIENT.test(stripComments(read(target)))) {
      clientImports++
      r.note(`${file} imports an isolated client component: ${target} (${m[1]})`)
    }
  }
  r.summary = `${imports} local imports walked, ${clientImports} client components`
  return r
}

// ---------------------------------------------------------------------------------------------
// 4. no-em-dashes
// ---------------------------------------------------------------------------------------------

const DASH = /[–—]/
/** A dash standing alone as a glyph (a list bullet, a null placeholder) is not prose. */
const BARE_GLYPH = /(['"`])[–—]\1|>[–—]</
/** Per-line escape for a dash that is a glyph, not prose (the title template used one once; it is a middle dot now). */
const DASH_ESCAPE = /convention:\s*em-dash\b/

function checkNoEmDashes() {
  const r = result()
  // /lab is a gated sketchbook; its copy never ships, so it is exempt like the raw-img rule.
  const files = walk(APP, (f) => /\/(page|layout)\.tsx$/.test(f) && !f.startsWith('src/app/lab/'))
  if (existsSync('src/lib/search-index.ts')) files.push('src/lib/search-index.ts')
  let hits = 0
  let labHits = 0
  for (const file of files) {
    const raw = read(file)
    if (!DASH.test(raw)) continue
    const rawLines = raw.split('\n')
    stripComments(raw).split('\n').forEach((line, i) => {
      if (!DASH.test(line)) return
      if (DASH_ESCAPE.test(rawLines[i] ?? '')) return
      if (BARE_GLYPH.test(line) && !DASH.test(line.replace(BARE_GLYPH, ''))) return
      hits++
      if (file.startsWith('src/app/lab/')) labHits++
      const at = line.search(DASH)
      const start = Math.max(0, at - 40)
      r.fail(`${file}:${i + 1}  ${snippet(line.slice(start, at + 40))}`)
    })
  }
  r.summary = hits
    ? `${hits} em/en dashes in user-facing copy (${labHits} of them under src/app/lab)`
    : `${files.length} files, no em or en dashes in copy`
  return r
}

// ---------------------------------------------------------------------------------------------
// 5. lab-index-registration
// ---------------------------------------------------------------------------------------------

function checkLabIndexRegistration() {
  const r = result()
  const lab = 'src/app/lab'
  if (!isDir(lab)) { r.summary = 'no src/app/lab, skipped'; return r }
  const index = join(lab, 'page.tsx')
  if (!existsSync(index)) { r.fail(`${index} is missing, so no prototype can be registered`); return r }
  const registered = new Set([...read(index).matchAll(/\b(?:route|href):\s*['"]([^'"]+)['"]/g)].map((m) => m[1].replace(/\/$/, '')))

  const routes = []
  for (const entry of readdirSync(lab, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    for (const page of walk(join(lab, entry.name), (f) => PAGE_FILE.test(f))) {
      routes.push('/' + relative(APP, dirname(page)).split(sep).join('/'))
    }
  }
  let missing = 0
  for (const route of routes) {
    if (registered.has(route)) continue
    missing++
    r.fail(`${route} has a page.tsx but no ITEMS entry in ${index}`)
  }
  for (const route of registered) {
    if (route.startsWith('/lab/') && !routes.includes(route)) r.note(`ITEMS lists ${route} but no page.tsx exists there (stale entry)`)
  }
  r.summary = `${routes.length} prototypes, ${missing} unregistered`
  return r
}

// ---------------------------------------------------------------------------------------------
// 6. sources-exist
// ---------------------------------------------------------------------------------------------

async function checkSourcesExist() {
  const r = result()
  const { site } = await loadConfig()
  const keys = ['writing', 'designs', 'images', 'photos']
  let ok = 0
  for (const key of keys) {
    const path = site.sources[key]
    if (!path) { r.fail(`site.sources.${key} is unset`); continue }
    if (isDir(path)) { ok++; continue }
    if (key === 'photos' && site.photos.sources.length > 0) {
      r.note(`site.sources.photos (${path}) is absent, fine while photos.sources supplies the photos`)
      ok++
      continue
    }
    r.fail(`site.sources.${key} points at ${path}, which is not a directory`)
  }
  r.summary = `${ok}/${keys.length} source folders present`
  return r
}

// ---------------------------------------------------------------------------------------------
// 7. module-dirs-consistent
// ---------------------------------------------------------------------------------------------

async function checkModuleDirsConsistent() {
  const r = result()
  const { site, MODULE_IDS, MODULE_META } = await loadConfig()
  let enabled = 0
  let dead = 0
  for (const id of MODULE_IDS) {
    const value = site.modules[id]
    const on = value !== false && value !== undefined
    const dir = MODULE_META[id].dir
    const exists = isDir(dir)
    if (on) {
      enabled++
      if (!exists) r.fail(`module '${id}' is enabled in site.config.ts but ${dir} does not exist`)
    } else if (exists) {
      dead++
      r.note(`module '${id}' is off but ${dir} still exists: dead weight, safe to delete`)
    }
  }
  r.summary = `${enabled}/${MODULE_IDS.length} modules enabled, all present${dead ? `; ${dead} disabled folders still on disk` : ''}`
  return r
}

// ---------------------------------------------------------------------------------------------
// 8. no-hardcoded-identity
// ---------------------------------------------------------------------------------------------

const IDENTITY_SCAN_EXT = /\.(tsx?|jsx?|mjs|cjs|css|json|mdx?|txt|xml|svg)$/
// /lab is the owner's gated sketchbook (never on production); its hits are reported as a NOTE
// count rather than a failure, like the raw-img and em-dash exemptions.
const IDENTITY_LAB = (f) => f.startsWith('src/app/lab/')
const IDENTITY_EXCLUDED = (f) => f.startsWith('src/content/') || /^src\/lib\/site-config[^/]*\.ts$/.test(f)

async function checkNoHardcodedIdentity() {
  const r = result()
  const { site, DEFAULTS } = await loadConfig()

  // The literal strings that make this someone's site. Values equal to the template's own
  // defaults are skipped: "Platinum" appearing in src is the template talking about itself.
  const needles = new Map()
  const add = (label, value) => {
    if (typeof value !== 'string' || value.trim().length < 4) return
    const key = value.trim()
    needles.set(key, needles.has(key) ? 'social handle' : label)
  }
  const defaultValues = new Set([DEFAULTS.identity.name, DEFAULTS.identity.url, DEFAULTS.identity.email].filter(Boolean))
  const host = (url) => { try { return new URL(url).host } catch { return null } }
  if (!defaultValues.has(site.identity.name)) add('identity.name', site.identity.name)
  if (!defaultValues.has(site.identity.url)) add('identity.url host', host(site.identity.url))
  if (!defaultValues.has(site.identity.email)) add('identity.email', site.identity.email)
  for (const [network, value] of Object.entries(site.social)) {
    if (network === 'order' || network === 'rss') continue
    add(`social.${network}`, typeof value === 'string' && /^https?:\/\//.test(value) ? host(value) : value)
  }
  // qa/identity-needles.json (private, stripped at publish) carries the ORIGINAL owner's strings so
  // the tripwire keeps scanning for them after site.config.ts holds the demo identity.
  if (existsSync('qa/identity-needles.json')) {
    for (const n of JSON.parse(read('qa/identity-needles.json'))) add('original owner', n)
  }
  // A name also hides in file names and ids as a slug ("maren-holloway-mark.svg"), so every
  // multi-word needle is searched for in kebab-case too.
  for (const [value, label] of [...needles]) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (slug.includes('-') && slug !== value.toLowerCase()) add(label, slug)
  }
  if (needles.size === 0) {
    r.summary = 'identity is the template default, nothing to scan for'
    return r
  }


  // Longest needle first, so "maren@clayandash.example" is reported as the email, not as the handle
  // inside it. One hit per line.
  const ordered = [...needles].sort((a, b) => b[0].length - a[0].length)
  // src is the site; scripts, the workflows, and the two root config files are where a
  // hardcoded URL or handle hides when the site itself is clean.
  const keep = (f) => IDENTITY_SCAN_EXT.test(f) && !IDENTITY_EXCLUDED(f)
  const files = [
    ...walk('src', keep),
    ...walk('scripts', keep),
    ...walk('.github', (f) => /\.ya?ml$/.test(f)),
    ...['next.config.mjs', 'mdx-components.tsx'].filter((f) => existsSync(f)),
  ]
  const perFile = new Map()
  const perNeedle = new Map()
  let total = 0
  let labHits = 0
  for (const file of files) {
    const raw = read(file)
    const code = /\.(tsx?|jsx?|mjs|cjs|css)$/.test(file) ? stripComments(raw) : raw
    code.split('\n').forEach((line, i) => {
      if (isCommentLine(line)) return
      const lower = line.toLowerCase()
      const found = ordered.find(([needle]) => lower.includes(needle.toLowerCase()))
      if (!found) return
      if (IDENTITY_LAB(file)) { labHits++; return }
      const [needle, label] = found
      total++
      perNeedle.set(needle, (perNeedle.get(needle) ?? 0) + 1)
      if (!perFile.has(file)) perFile.set(file, [])
      perFile.get(file).push(`${i + 1}  [${label}] ${snippet(line, 80)}`)
    })
  }
  for (const [file, hits] of [...perFile].sort((a, b) => b[1].length - a[1].length)) {
    r.fail(`${file}: ${hits.length} hit${hits.length === 1 ? '' : 's'}`)
    for (const hit of hits.slice(0, 3)) r.fail(`    :${hit}`)
    if (hits.length > 3) r.fail(`    … ${hits.length - 3} more`)
  }
  if (labHits) r.note(`${labHits} identity strings under src/app/lab (sketchbook, gated from production; not a failure)`)
  const breakdown = [...perNeedle].map(([n, c]) => `${JSON.stringify(n)} ×${c}`).join(', ')
  r.summary = total
    ? `${total} hardcoded identity strings across ${perFile.size} files (${breakdown})`
    : `${files.length} files scanned, no identity strings outside site.config.ts`
  return r
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

const CHECKS = [
  ['page-needs-layout', checkPageNeedsLayout],
  ['no-raw-img', checkNoRawImg],
  ['no-client-mdx-components', checkNoClientMdxComponents],
  ['no-em-dashes', checkNoEmDashes],
  ['lab-index-registration', checkLabIndexRegistration],
  ['sources-exist', checkSourcesExist],
  ['module-dirs-consistent', checkModuleDirsConsistent],
  ['no-hardcoded-identity', checkNoHardcodedIdentity],
]

let passed = 0
let failed = 0
let skipped = 0
for (const [id, run] of CHECKS) {
  if ((ONLY.size && !matches(id, ONLY)) || matches(id, SKIP)) {
    skipped++
    console.log(`- ${id}: skipped`)
    continue
  }
  let r
  try {
    r = await run()
  } catch (error) {
    r = result()
    r.fail(`check crashed: ${error?.stack ?? error}`)
    r.summary = 'crashed'
  }
  const ok = r.failures.length === 0
  if (ok) passed++
  else failed++
  console.log(`${ok ? '✓' : '✖'} ${id}: ${r.summary}`)
  for (const line of r.failures) console.log(`    ${line}`)
  for (const line of r.notes) console.log(`    NOTE ${line}`)
}

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}${FIX ? ' (with --fix)' : ''}`)
if (failed) {
  console.log('See docs/conventions.md for what each check enforces and its escape hatch.')
  process.exit(1)
}
