/**
 * The site.config.ts WRITER: the dev-only /settings page's pen.
 *
 * Server-side only (node:fs, node:child_process); never import it from a client component.
 * It is deliberately free of the `server-only` marker so the round-trip proof can run under
 * plain Node (`node --input-type=module -e "import('./src/lib/site-config-writer.ts')"`).
 *
 * Three jobs:
 *   1. `readConfig()` loads the file the way the site does: by IMPORTING it in a child Node
 *      process (Node 24 strips the types natively), so what comes back is the resolved config
 *      defineConfig produced, never a text parse. A child process, not an in-bundle import,
 *      because the bundle's copy of site.config.ts can lag the disk by one hot reload and the
 *      writer must always start from what is on disk right now.
 *   2. `toInput()` reduces a resolved config to the input that reproduces it: every value equal
 *      to its default disappears, so an untouched field never appears in the file.
 *   3. `serialize()` + `writeConfig()` emit the file deterministically: the header comment
 *      block verbatim, `defineConfig({...})`, keys in schema order, single quotes, two-space
 *      indent, trailing commas. Writing the same config twice produces byte-identical output.
 *
 * Round trip: `defineConfig(toInput(resolved))` deep-equals `resolved`, and
 * `readConfig(writeConfig(resolved))` deep-equals `resolved` (see docs/settings.md).
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { DEFAULTS, MODULE_IDS, SETUP_STEPS, SOCIAL_NETWORKS, defineConfig } from './site-config-schema.ts'
import type { SiteConfig, SiteConfigInput } from './site-config-schema.ts'

const execFileAsync = promisify(execFile)

/** Repo root: process.cwd() under `next dev` and under every script the repo ships. */
export const ROOT = process.cwd()
export const CONFIG_FILE = 'site.config.ts'
export const CONFIG_PATH = resolve(ROOT, CONFIG_FILE)

/** The comment block at the top of site.config.ts, kept verbatim across every write. */
export const HEADER = `import { defineConfig } from './src/lib/site-config-schema.ts'

/**
 * Your site, in one file.
 *
 * Edit this by hand, through the dev-only /settings page, or by telling Claude Code what you
 * want ("set my name to…", "turn the photos section off"). All three write here. Every field
 * is optional; see src/lib/site-config-schema.ts for what each one does and what it defaults to.
 * Secrets never go here: API keys live in .env.local (see Connections in /settings).
 *
 * Untouched, this file renders the Platinum demo: the template introducing itself. The first
 * thing to change is \`identity\`; the example posts explain the rest.
 */
`

/** Top-level sections in schema order (the order the file is written in). */
export const SECTION_ORDER = Object.keys(DEFAULTS) as Array<keyof SiteConfig>

// ---------------------------------------------------------------------------------------------
// Deep equality (JSON-shaped values only: the config never carries functions or Dates)
// ---------------------------------------------------------------------------------------------

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
    for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false
    return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Resolved -> input (strip defaults)
// ---------------------------------------------------------------------------------------------

type Plain = Record<string, unknown>

/** Keep only the keys whose value differs from the default, in the default's key order. */
function stripSection(value: Plain, defaults: Plain, keyOrder: string[] = Object.keys(defaults)): Plain | undefined {
  const out: Plain = {}
  for (const key of keyOrder) {
    const v = value[key]
    if (v === undefined) continue
    if (deepEqual(v, defaults[key])) continue
    out[key] = v
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * The input that reproduces `resolved` through defineConfig with nothing redundant in it.
 * Special cases mirror defineConfig's own derivations so the round trip stays exact:
 * identity.description and identity.intro fall back to the tagline, so a value equal to
 * the tagline is the derived one and is dropped.
 */
export function toInput(resolved: SiteConfig): SiteConfigInput {
  const input: Plain = {}

  const { steps, ...setupRest } = resolved.setup
  const setup = stripSection(setupRest as Plain, DEFAULTS.setup as Plain) ?? {}
  const stepsOut = stripSection((steps ?? {}) as Plain, DEFAULTS.setup.steps as Plain, [...SETUP_STEPS])
  if (stepsOut) setup.steps = stepsOut
  if (Object.keys(setup).length) input.setup = setup

  const identity = { ...(resolved.identity as Plain) }
  if (identity.description === resolved.identity.tagline) delete identity.description
  if (identity.intro === resolved.identity.tagline) delete identity.intro
  const identityOut = stripSection(identity, DEFAULTS.identity as Plain)
  if (identityOut) input.identity = identityOut

  const { themeColor, ...brandRest } = resolved.brand
  const brand = stripSection(brandRest as Plain, DEFAULTS.brand as Plain) ?? {}
  const tc = stripSection((themeColor ?? {}) as Plain, DEFAULTS.brand.themeColor as Plain)
  if (tc) brand.themeColor = tc
  if (Object.keys(brand).length) input.brand = brand

  const social: Plain = {}
  for (const network of SOCIAL_NETWORKS) {
    const handle = (resolved.social as Plain)[network]
    if (typeof handle === 'string' && handle.trim()) social[network] = handle
  }
  if (resolved.social.order && !deepEqual(resolved.social.order, DEFAULTS.social.order)) social.order = resolved.social.order
  if (resolved.social.rss !== DEFAULTS.social.rss) social.rss = resolved.social.rss
  if (Object.keys(social).length) input.social = social

  const header = stripSection(resolved.header as Plain, DEFAULTS.header as Plain)
  if (header) input.header = header

  if (!deepEqual(resolved.nav, DEFAULTS.nav)) input.nav = resolved.nav

  const footer = stripSection(resolved.footer as Plain, DEFAULTS.footer as Plain)
  if (footer) input.footer = footer

  const modules = stripSection(resolved.modules as Plain, DEFAULTS.modules as Plain, [...MODULE_IDS])
  if (modules) input.modules = modules

  const home = stripSection(resolved.home as Plain, DEFAULTS.home as Plain)
  if (home) input.home = home

  const sources = stripSection(resolved.sources as Plain, DEFAULTS.sources as Plain)
  if (sources) input.sources = sources

  const photos = stripSection(resolved.photos as Plain, DEFAULTS.photos as Plain)
  if (photos) input.photos = photos

  const writing = stripSection(resolved.writing as Plain, DEFAULTS.writing as Plain)
  if (writing) input.writing = writing

  const publishing = stripSection(resolved.publishing as Plain, DEFAULTS.publishing as Plain)
  if (publishing) input.publishing = publishing

  const { models, ...intelligenceRest } = resolved.intelligence
  const intelligence = stripSection(intelligenceRest as Plain, DEFAULTS.intelligence as Plain) ?? {}
  const modelsOut = stripSection((models ?? {}) as Plain, {}, ['fast', 'capable'])
  if (modelsOut) intelligence.models = modelsOut
  if (Object.keys(intelligence).length) input.intelligence = intelligence

  const code = stripSection(resolved.code as Plain, DEFAULTS.code as Plain)
  if (code) input.code = code

  const palette = stripSection(resolved.palette as Plain, DEFAULTS.palette as Plain)
  if (palette) input.palette = palette

  const advanced = stripSection(resolved.advanced as Plain, DEFAULTS.advanced as Plain)
  if (advanced) input.advanced = advanced

  // Schema order, whatever order the sections were collected in above.
  const ordered: Plain = {}
  for (const key of SECTION_ORDER) if (input[key] !== undefined) ordered[key] = input[key]
  return ordered as SiteConfigInput
}

// ---------------------------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][\w$]*$/
const INLINE_ARRAY_MAX = 88

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
}

function key(k: string): string {
  return IDENT.test(k) ? k : quote(k)
}

function isPrimitive(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function emit(value: unknown, depth: number, block = false): string {
  const pad = '  '.repeat(depth)
  const padIn = '  '.repeat(depth + 1)
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(isPrimitive)) {
      const inline = `[${value.map((v) => emit(v, 0)).join(', ')}]`
      if (pad.length + inline.length <= INLINE_ARRAY_MAX) return inline
    }
    return `[\n${value.map((v) => `${padIn}${emit(v, depth + 1)},`).join('\n')}\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Plain).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    // Short flat NESTED objects stay on one line ({ light: '#fff', dark: '#000' }); a top-level
    // section is always a block, the shape the shipped file has.
    if (!block && entries.every(([, v]) => isPrimitive(v))) {
      const inline = `{ ${entries.map(([k, v]) => `${key(k)}: ${emit(v, 0)}`).join(', ')} }`
      if (pad.length + inline.length <= INLINE_ARRAY_MAX) return inline
    }
    return `{\n${entries.map(([k, v]) => `${padIn}${key(k)}: ${emit(v, depth + 1)},`).join('\n')}\n${pad}}`
  }
  throw new TypeError(`site.config.ts cannot hold a ${typeof value}`)
}

/** The full file text for a resolved config. Pure: same input, same bytes. */
export function serialize(resolved: SiteConfig): string {
  const input = toInput(resolved) as Plain
  const sections = Object.entries(input).filter(([, v]) => v !== undefined)
  if (sections.length === 0) return `${HEADER}export default defineConfig({})\n`
  // A blank line between top-level sections (the shape the shipped file has); nested
  // values run tight.
  const body = sections.map(([k, v]) => `  ${key(k)}: ${emit(v, 1, true)},`).join('\n\n')
  return `${HEADER}export default defineConfig({\n${body}\n})\n`
}

// ---------------------------------------------------------------------------------------------
// Disk
// ---------------------------------------------------------------------------------------------

/**
 * Import the config in a child Node process and return the resolved object. Fresh on every
 * call (no module cache), so it always reflects the file on disk. ~80ms.
 */
export async function readConfig(file: string = CONFIG_PATH): Promise<SiteConfig> {
  const href = pathToFileURL(file).href
  const script = `import(${JSON.stringify(href)}).then((m) => process.stdout.write(JSON.stringify(m.default)))`
  const { stdout } = await execFileAsync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
    cwd: ROOT,
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(stdout) as SiteConfig
}

/**
 * Serialize and write. Returns true when the bytes changed. The write is atomic (temp file
 * + rename) so a hot reload never sees a half-written config.
 */
export function writeConfig(resolved: SiteConfig, file: string = CONFIG_PATH): boolean {
  const next = serialize(resolved)
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (current === next) return false
  const tmp = join(dirname(file), `.${Date.now()}.site.config.tmp`)
  writeFileSync(tmp, next)
  renameSync(tmp, file)
  return true
}

// ---------------------------------------------------------------------------------------------
// One change at a time: `path` is the dotted config path every /settings control shows
// ---------------------------------------------------------------------------------------------

export class ConfigPathError extends Error {}

const THIRD_LEVEL: Record<string, string[]> = {
  'setup.steps': [...SETUP_STEPS],
  'brand.themeColor': ['light', 'dark'],
  'intelligence.models': ['fast', 'capable'],
}

/** Validate a dotted path against the schema shape and return its segments. */
export function parsePath(path: string): string[] {
  const parts = path.split('.')
  const [section, field, sub, ...rest] = parts
  if (rest.length || !section) throw new ConfigPathError(`unknown config path: ${path}`)
  if (!(section in DEFAULTS)) throw new ConfigPathError(`unknown section: ${section}`)
  if (section === 'nav') {
    if (field !== undefined) throw new ConfigPathError('nav is set as a whole list')
    return parts
  }
  if (field === undefined) return parts
  if (section === 'social') {
    const ok = (SOCIAL_NETWORKS as readonly string[]).includes(field) || field === 'order' || field === 'rss'
    if (!ok) throw new ConfigPathError(`unknown social network: ${field}`)
  } else if (section === 'modules') {
    if (!(MODULE_IDS as readonly string[]).includes(field)) throw new ConfigPathError(`unknown module: ${field}`)
  } else if (!(field in ((DEFAULTS as Plain)[section] as object))) {
    throw new ConfigPathError(`unknown field: ${section}.${field}`)
  }
  if (sub !== undefined) {
    const allowed = THIRD_LEVEL[`${section}.${field}`]
    if (!allowed || !allowed.includes(sub)) throw new ConfigPathError(`unknown config path: ${path}`)
  }
  return parts
}

/**
 * Apply one change to a resolved config and return the re-resolved result. `value: null`
 * clears the field (it falls back to its default). The change is applied to the INPUT and
 * pushed back through defineConfig, so every derived field (description from tagline, the
 * merged defaults) stays right.
 */
export function applyChange(resolved: SiteConfig, path: string, value: unknown): SiteConfig {
  const parts = parsePath(path)
  const input = structuredClone(toInput(resolved)) as Plain
  const clean = value === '' ? null : value

  if (parts.length === 1) {
    if (clean === null) delete input[parts[0]]
    else input[parts[0]] = clean
    return defineConfig(input as SiteConfigInput)
  }

  const [section, field, sub] = parts
  const sectionObj = ((input[section] as Plain | undefined) ?? {}) as Plain
  if (sub === undefined) {
    if (clean === null) delete sectionObj[field]
    else sectionObj[field] = clean
  } else {
    const nested = ((sectionObj[field] as Plain | undefined) ?? {}) as Plain
    if (clean === null) delete nested[sub]
    else nested[sub] = clean
    if (Object.keys(nested).length) sectionObj[field] = nested
    else delete sectionObj[field]
  }
  if (Object.keys(sectionObj).length) input[section] = sectionObj
  else delete input[section]
  return defineConfig(input as SiteConfigInput)
}
