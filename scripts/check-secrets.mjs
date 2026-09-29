#!/usr/bin/env node
/**
 * Secret tripwire.
 *
 * The Obsidian `data.json` scar, generalised: before a commit lands, scan what is about to be
 * committed for key-shaped strings and for files that should never be tracked. Runs as the
 * pre-commit hook (scripts/install-hooks.sh) and by hand.
 *
 *   node scripts/check-secrets.mjs          scan the STAGED files (what `git commit` would take)
 *   node scripts/check-secrets.mjs --all    scan every tracked file
 *
 * Prints file:line with the value masked after its first 6 characters, exits 1 on any hit.
 * Node 24 built-ins only.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)

const ALL = process.argv.includes('--all')

// ---------------------------------------------------------------------------------------------
// What a secret looks like
// ---------------------------------------------------------------------------------------------

/** Content patterns. `envOk: true` means the pattern is skipped inside .env* files, where a
 *  KEY=value line is the point of the file (those files are gitignored; staging one is caught
 *  separately below). */
const PATTERNS = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{8,}/g },
  { name: 'Stripe live key', re: /sk[-_]live[-_]?[A-Za-z0-9]{8,}/g },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{20,}/g },
  { name: 'GitHub token', re: /\bghp_[A-Za-z0-9]{16,}/g },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{16,}/g },
  { name: 'Postgres URL with password', re: /postgres(?:ql)?:\/\/[^\s:'"@/]+:[^\s@'"]+@/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}/g },
  {
    name: 'KEY/SECRET/TOKEN assignment',
    re: /[A-Z_]*(?:KEY|SECRET|TOKEN)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}/g,
    envOk: true,
  },
  // The git plugin's settings ship (they are the vault's publish loop), but the mobile app
  // stores the GitHub username and token in that same file. A filled credential field there
  // is refused whatever it looks like.
  {
    name: 'a credential in the Obsidian git plugin settings',
    re: /"(?:password|token|accessToken|username|author)"\s*:\s*"[^"]+"/g,
    only: /(^|\/)\.obsidian\/plugins\/obsidian-git\/data\.json$/,
  },
]

/** Paths that must never be tracked, whatever they contain. */
const FORBIDDEN_PATHS = [
  { name: 'Obsidian plugin data (holds API keys)', re: /(^|\/)\.obsidian\/plugins\/[^/]+\/data\.json$/, unless: /(^|\/)\.obsidian\/plugins\/obsidian-git\/data\.json$/ },
  { name: '.env file (secrets live only in your local copy)', re: /(^|\/)\.env(?:\.[^/]+)?$/, unless: /\.(example|sample|template)$/ },
]

/** Files that are noise, not risk: lockfiles and anything binary. */
const SKIP_NAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'])
const MAX_BYTES = 4 * 1024 * 1024

function isEnvFile(file) {
  return /^\.env(\..*)?$/.test(basename(file))
}

function looksBinary(buf) {
  const head = buf.subarray(0, 8192)
  return head.includes(0)
}

function mask(value) {
  return value.length <= 6 ? `${value[0]}…` : `${value.slice(0, 6)}…(${value.length} chars)`
}

// ---------------------------------------------------------------------------------------------
// Which files
// ---------------------------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

const listed = (ALL ? git(['ls-files', '-z']) : git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']))
  .split('\0')
  .filter(Boolean)

const files = listed.filter((f) => existsSync(f) && statSync(f).isFile())

// ---------------------------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------------------------

const hits = []

for (const file of files) {
  for (const { name, re, unless } of FORBIDDEN_PATHS) {
    if (re.test(file) && !unless?.test(file)) hits.push({ file, line: 0, name, value: null })
  }
  if (SKIP_NAMES.has(basename(file))) continue
  const size = statSync(file).size
  if (size > MAX_BYTES) continue
  const buf = readFileSync(file)
  if (looksBinary(buf)) continue
  const text = buf.toString('utf8')
  const env = isEnvFile(file)
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const { name, re, envOk, only } of PATTERNS) {
      if (env && envOk) continue
      if (only && !only.test(file)) continue
      for (const m of line.matchAll(re)) hits.push({ file, line: i + 1, name, value: m[0] })
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

const scope = ALL ? `${files.length} tracked files` : `${files.length} staged files`

if (hits.length === 0) {
  console.log(`✓ check-secrets: ${scope}, nothing key-shaped`)
  process.exit(0)
}

console.error(`✖ check-secrets: ${hits.length} finding${hits.length === 1 ? '' : 's'} in ${scope}`)
for (const { file, line, name, value } of hits) {
  console.error(value === null ? `    ${file}: ${name}` : `    ${file}:${line}  ${name}: ${mask(value)}`)
}
console.error(
  '\nMove the value to .env.local (gitignored) and read it from process.env. If a match is a false positive,' +
    ' rewrite the literal so it no longer looks like a key; there is no inline escape on purpose.'
)
process.exit(1)
