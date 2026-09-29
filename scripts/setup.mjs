#!/usr/bin/env node
/**
 * The non-agent setup fallback: a few readline prompts that write `site.config.ts`.
 *
 *   node scripts/setup.mjs              ask for name, tagline, url, email, and a shape preset
 *   node scripts/setup.mjs --yes        no prompts: keep every current value and the current shape
 *   node scripts/setup.mjs --complete   also set `setup.completed: true` (retires the Setup page)
 *
 * The three onboarding interfaces (the Claude Code `setup` skill, the dev-only /settings wizard,
 * and this script) are skins over one checklist, `setup.steps`; see docs/onboarding.md. This one
 * covers the first two steps (identity, shape) and leaves the rest to the site owner.
 *
 * How it writes: the current config is imported (resolved, defaults merged), the answers and the
 * chosen preset are laid over it, and the file is written through the /settings page's writer
 * (`src/lib/site-config-writer.ts`: keys in schema order, defaults dropped, header kept), so the
 * wizard and this script produce byte-identical files for the same config. If that module cannot
 * be loaded (it is mid-edit, say), a small emitter of the same shape below takes over; that
 * fallback is the one piece of duplication here, kept deliberately so setup never depends on a
 * file it does not own.
 *
 * Answers can be piped (`printf 'Name\nTagline\n\n\nwriter\n' | node scripts/setup.mjs`), one
 * line per question in order; a blank line keeps the bracketed value.
 *
 * Node 24 built-ins only.
 */
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The package has no "type" field on purpose; silence Node's typeless-module warning the way
// scripts/check-conventions.mjs does.
process.removeAllListeners('warning')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT) // the writer resolves site.config.ts from cwd
const CONFIG_FILE = resolve(ROOT, 'site.config.ts')
const argv = process.argv.slice(2)
const YES = argv.includes('--yes') || argv.includes('-y')
const COMPLETE = argv.includes('--complete')

const { default: current } = await import(CONFIG_FILE)
const { DEFAULTS, MODULE_IDS, defineConfig } = await import(resolve(ROOT, 'src/lib/site-config-schema.ts'))
const { PRESETS, PRESET_IDS, applyPreset, matchPreset } = await import(resolve(ROOT, 'src/lib/presets.ts'))
let writer = null
try {
  writer = await import(resolve(ROOT, 'src/lib/site-config-writer.ts'))
  if (typeof writer.writeConfig !== 'function') writer = null
} catch {
  writer = null
}

// ---------------------------------------------------------------------------------------------
// Resolved config -> input config (fallback path; the writer's toInput is the primary)
// ---------------------------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Keys of `value` that differ from `base`, in `value`'s key order. */
function diffSection(value, base) {
  const out = {}
  for (const [key, v] of Object.entries(value ?? {})) {
    if (v !== undefined && !same(v, base?.[key])) out[key] = v
  }
  return out
}

function toInput(site) {
  const input = {}
  const setup = { completed: site.setup.completed, steps: { ...site.setup.steps } }
  if (!same(setup, DEFAULTS.setup)) input.setup = setup

  const identity = diffSection(site.identity, DEFAULTS.identity)
  // defineConfig fills description and intro from the tagline; do not write the echo back.
  if (identity.description === site.identity.tagline) delete identity.description
  if (identity.intro === site.identity.tagline) delete identity.intro
  if (Object.keys(identity).length) input.identity = identity

  const { themeColor, ...brandRest } = site.brand
  const brand = diffSection(brandRest, DEFAULTS.brand)
  if (!same(themeColor, DEFAULTS.brand.themeColor)) brand.themeColor = themeColor
  if (Object.keys(brand).length) input.brand = brand

  for (const key of ['social', 'header', 'footer']) {
    const section = diffSection(site[key], DEFAULTS[key])
    if (Object.keys(section).length) input[key] = section
  }
  if (!same(site.nav, DEFAULTS.nav)) input.nav = site.nav

  const modules = {}
  for (const id of MODULE_IDS) if (!same(site.modules[id], DEFAULTS.modules[id])) modules[id] = site.modules[id]
  if (Object.keys(modules).length) input.modules = modules

  for (const key of ['home', 'sources', 'photos', 'writing', 'publishing', 'intelligence', 'code', 'palette', 'advanced']) {
    const section = diffSection(site[key], DEFAULTS[key])
    if (Object.keys(section).length) input[key] = section
  }
  return input
}

// ---------------------------------------------------------------------------------------------
// Fallback emitter: a JS value as TypeScript source, two-space indent, single quotes
// ---------------------------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function emit(value, depth = 0) {
  const pad = '  '.repeat(depth)
  const inner = '  '.repeat(depth + 1)
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => emit(v, depth + 1))
    const flat = `[${items.join(', ')}]`
    if (value.every((v) => typeof v !== 'object') && flat.length + pad.length <= 96) return flat
    return `[\n${items.map((i) => `${inner}${i},`).join('\n')}\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    const lines = entries.map(([k, v]) => `${inner}${IDENT.test(k) ? k : emit(k)}: ${emit(v, depth + 1)},`)
    return `{\n${lines.join('\n')}\n${pad}}`
  }
  throw new Error(`setup: cannot emit a ${typeof value}`)
}

/** Write the input config. Returns true when the file changed. */
function save(input) {
  if (writer) return writer.writeConfig(defineConfig(input))
  const source = readFileSync(CONFIG_FILE, 'utf8')
  const at = source.indexOf('export default defineConfig(')
  const header = at >= 0 ? source.slice(0, at) : "import { defineConfig } from './src/lib/site-config-schema.ts'\n\n"
  const next = `${header}export default defineConfig(${emit(input)})\n`
  if (next === source) return false
  writeFileSync(CONFIG_FILE, next)
  return true
}

// ---------------------------------------------------------------------------------------------
// Prompts. Lines are queued as they arrive so piped answers are not lost between questions
// (readline emits every buffered line at once; a question asked after that would never settle).
// ---------------------------------------------------------------------------------------------

const TTY = Boolean(stdin.isTTY)
const rl = YES ? null : createInterface({ input: stdin, terminal: TTY })
const queued = []
const waiting = []
let closed = false
rl?.on('line', (line) => {
  const next = waiting.shift()
  if (next) next(line)
  else queued.push(line)
})
rl?.on('close', () => {
  closed = true
  while (waiting.length) waiting.shift()('')
})

function nextLine() {
  if (queued.length) return Promise.resolve(queued.shift())
  if (closed) return Promise.resolve('')
  return new Promise((done) => waiting.push(done))
}

async function ask(label, fallback) {
  if (YES) return fallback
  const shown = fallback ? ` [${fallback}]` : ''
  stdout.write(`${label}${shown}: `)
  const answer = (await nextLine()).trim()
  if (!TTY) stdout.write(`${answer || fallback}\n`) // echo, so a piped run reads as a transcript
  return answer || fallback
}

if (!YES) stdout.write('\nPlatinum setup. Enter keeps the value in brackets.\n\n')

const input = writer?.toInput ? writer.toInput(current) : toInput(current)
input.setup = { completed: current.setup.completed, steps: { ...current.setup.steps } }

const name = await ask('Your name (it is the site name too)', current.identity.name)
const tagline = await ask('Tagline, one line under your name', current.identity.tagline)
// On Vercel the build reads the project's production domain, so the URL is only for a
// pinned host or hosting elsewhere.
let url = await ask('Site URL, optional (Enter to skip; Vercel supplies it)', current.identity.url ?? '')
url = url.trim().replace(/\/$/, '')
if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
const email = await ask('Email, optional (Enter to skip)', current.identity.email ?? '')

input.identity = { ...input.identity, name, tagline, url: url || undefined, email: email || undefined }
if (name !== DEFAULTS.identity.name) input.setup.steps.identity = true

const matched = matchPreset(current.modules)
if (!YES) {
  stdout.write('\nShape. Each preset sets which sections exist, the nav, and the home grid:\n')
  for (const id of PRESET_IDS) stdout.write(`  ${id.padEnd(13)} ${PRESETS[id].blurb}\n`)
  stdout.write(`  ${'keep'.padEnd(13)} leave the current shape${matched ? ` (${PRESETS[matched].label})` : ''}\n\n`)
}
let preset = (await ask(`Shape [${[...PRESET_IDS, 'keep'].join('/')}]`, matched ?? 'keep')).toLowerCase()
if (!PRESET_IDS.includes(preset) && preset !== 'keep') {
  stdout.write(`  "${preset}" is not a preset; keeping the current shape.\n`)
  preset = 'keep'
}
let applied = input
if (preset !== 'keep') {
  applied = applyPreset(input, preset)
  applied.setup.steps.shape = true
}
if (COMPLETE) applied.setup.completed = true

rl?.close()

// Compare resolved configs, not file bytes: an untouched template re-serialised through the
// writer would drop its explicit defaults, and a run that decided nothing should write nothing.
const changed = same(defineConfig(applied), current) ? false : save(applied)
stdout.write(changed ? '\nWrote site.config.ts\n' : '\nNothing changed; site.config.ts left as it was.\n')

const steps = Object.entries(applied.setup.steps).map(([k, v]) => `[${v ? 'x' : ' '}] ${k}`).join('  ')
stdout.write(`  identity: ${applied.identity.name}, "${applied.identity.tagline}"\n`)
stdout.write(`  shape:    ${preset === 'keep' ? (matched ? PRESETS[matched].label : 'custom') : PRESETS[preset].label}\n`)
stdout.write(`  steps:    ${steps}\n`)
stdout.write('\nNext: npm run dev, then http://localhost:3000. Brand, content, and shipping are the remaining\n')
stdout.write('steps: open the folder in Claude Code and say "set up my site", use /settings?setup=1, or\n')
stdout.write('edit site.config.ts by hand. Run this again with --complete to retire the Setup page.\n')
