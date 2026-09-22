#!/usr/bin/env node
/**
 * Remove the template's example content.
 *
 *   npm run clear-examples             delete it
 *   npm run clear-examples -- --dry-run  list what would be deleted, touch nothing
 *
 * What counts as an example, and how each kind is found:
 *
 *   - Posts and case studies: every .mdx under src/content/ whose frontmatter has
 *     `example: true` (docs/example-content.md lists them).
 *   - Their media: every /images/…, /videos/…, /img/…, or /files/… path those files reference
 *     (plus the sibling files a clip implies: its poster, webm, and 3x encode, and a
 *     BezelVideo's six files). A file also referenced by a NON-example post is kept.
 *   - Case-study entries: objects in ALL_DESIGNS (src/lib/designs.ts) with `example: true`.
 *   - Photos: entries in src/lib/manual-photos.ts whose id starts with `example-`, and the
 *     files they point at, plus any leftover public/images/photos/example-*.
 *
 * Idempotent: a second run finds nothing. Content folders that end up empty get a .gitkeep so
 * the convention check (sources-exist) still finds them on a fresh clone.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry-run')

const CONTENT_DIRS = ['src/content/writing', 'src/content/designs']
const KEEP_DIRS = ['public/images/writing', 'public/images/designs', 'public/images/photos', 'public/files']
const DESIGNS_FILE = 'src/lib/designs.ts'
const PHOTOS_FILE = 'src/lib/manual-photos.ts'
const PHOTOS_DIR = 'public/images/photos'

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function walk(dir, out = []) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return out
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const rel = join(dir, entry.name)
    if (entry.isDirectory()) walk(rel, out)
    else if (entry.name.endsWith('.mdx')) out.push(rel)
  }
  return out
}

/** Site-absolute asset paths mentioned anywhere in the file (frontmatter included), and the
 *  sibling files those imply. Repo-relative Obsidian paths (../../../public/images/…) count. */
function assetRefs(source) {
  const refs = new Set()
  for (const m of source.matchAll(/(?:\.\.\/)*(?:public)?(\/(?:images|videos|img|files)\/[^\s"'`)\]>|]+)/g)) {
    refs.add(m[1])
  }
  for (const m of source.matchAll(/<BezelVideo\b[^>]*\bname="([^"]+)"/g)) {
    for (const theme of ['light', 'dark']) {
      refs.add(`/img/dot/bezel/${m[1]}-${theme}.mp4`)
      refs.add(`/img/dot/bezel/${m[1]}-${theme}-3x.mp4`)
      refs.add(`/img/dot/bezel/${m[1]}-${theme}.jpg`)
    }
  }
  // A clip's implied siblings: poster, webm, and dense-screen encode.
  for (const ref of [...refs]) {
    const base = ref.replace(/\.(mp4|webm)$/i, '')
    if (base !== ref) for (const ext of ['.mp4', '.webm', '.jpg', '-3x.mp4']) refs.add(base + ext)
  }
  return refs
}

/**
 * Remove top-level object literals from the array that starts at `marker`, keeping those
 * for which `keep(objectText)` is true. Skips braces inside strings and line comments, so the
 * commented-out sample entry in manual-photos.ts is not mistaken for a real one.
 */
function pruneArray(source, marker, drop) {
  const start = source.indexOf(marker)
  if (start === -1) return { source, removed: 0 }
  let i = start + marker.length
  let depth = 1
  const objects = []
  let objStart = -1
  let objDepth = 0
  while (i < source.length && depth > 0) {
    const c = source[i]
    const d = source[i + 1]
    if (c === '/' && d === '/') { i = source.indexOf('\n', i); if (i === -1) break; continue }
    if (c === '/' && d === '*') { i = source.indexOf('*/', i) + 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== c) { if (source[j] === '\\') j++; j++ }
      i = j + 1
      continue
    }
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === '{') { if (objStart === -1) { objStart = i; objDepth = depth }; depth++ }
    else if (c === '}') {
      depth--
      if (objStart !== -1 && depth === objDepth) {
        // Swallow the trailing comma and the line break so the array stays tidy.
        let end = i + 1
        if (source[end] === ',') end++
        if (source[end] === '\n') end++
        objects.push({ start: objStart, end, text: source.slice(objStart, i + 1) })
        objStart = -1
      }
    }
    i++
  }
  let out = source
  let removed = 0
  for (const obj of objects.reverse()) {
    if (!drop(obj.text)) continue
    // The object's leading indentation sits before objStart; trim it with the object.
    let s = obj.start
    while (s > 0 && (out[s - 1] === ' ' || out[s - 1] === '\t')) s--
    out = out.slice(0, s) + out.slice(obj.end)
    removed++
  }
  return { source: out, removed }
}

const deleted = []
function removeFile(rel) {
  const abs = join(ROOT, rel)
  // Files only: prose that names a folder ("public/images/writing/") matches the path regex too.
  if (!existsSync(abs) || !statSync(abs).isFile()) return
  deleted.push(rel)
  if (!DRY) rmSync(abs)
}

function pruneEmptyDirs(rel) {
  // Climb from the file's folder, removing folders that are now empty, but never past the
  // content image folders and public/files (kept, with a .gitkeep) or out of public/.
  let dir = rel
  while (dir && dir !== 'public' && dir !== 'public/images' && !KEEP_DIRS.includes(dir)) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs) || readdirSync(abs).length > 0) break
    if (!DRY) rmSync(abs, { recursive: true })
    dir = dirname(dir)
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Content files and the assets only they reference
// ---------------------------------------------------------------------------------------------

const examples = []
const keptRefs = new Set()
for (const file of CONTENT_DIRS.flatMap((d) => walk(d))) {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const { data } = matter(source)
  if (data.example === true) examples.push({ file, source })
  else for (const ref of assetRefs(source)) keptRefs.add(ref)
}

const assetSet = new Set()
for (const { file, source } of examples) {
  removeFile(file)
  for (const ref of assetRefs(source)) if (!keptRefs.has(ref)) assetSet.add(ref)
}
for (const rel of [...assetSet].map((ref) => `public${ref}`).sort()) removeFile(rel)

// ---------------------------------------------------------------------------------------------
// 2. Case-study entries
// ---------------------------------------------------------------------------------------------

let designsRemoved = 0
if (existsSync(join(ROOT, DESIGNS_FILE))) {
  const source = readFileSync(join(ROOT, DESIGNS_FILE), 'utf8')
  const pruned = pruneArray(source, 'const ALL_DESIGNS: Design[] = [', (obj) => /\bexample:\s*true\b/.test(obj))
  designsRemoved = pruned.removed
  if (designsRemoved && !DRY) writeFileSync(join(ROOT, DESIGNS_FILE), pruned.source)
}

// ---------------------------------------------------------------------------------------------
// 3. Photos
// ---------------------------------------------------------------------------------------------

let photosRemoved = 0
if (existsSync(join(ROOT, PHOTOS_FILE))) {
  const source = readFileSync(join(ROOT, PHOTOS_FILE), 'utf8')
  const photoFiles = new Set()
  const pruned = pruneArray(source, 'export const manualPhotos: UnsplashPhoto[] = [', (obj) => {
    if (!/\bid:\s*['"]example-/.test(obj)) return false
    for (const m of obj.matchAll(/['"](\/images\/photos\/[^'"]+)['"]/g)) photoFiles.add(`public${m[1]}`)
    return true
  })
  for (const rel of [...photoFiles].sort()) removeFile(rel)
  photosRemoved = pruned.removed
  if (photosRemoved && !DRY) writeFileSync(join(ROOT, PHOTOS_FILE), pruned.source)
}
if (existsSync(join(ROOT, PHOTOS_DIR))) {
  for (const name of readdirSync(join(ROOT, PHOTOS_DIR)).sort()) {
    if (name.startsWith('example-')) removeFile(`${PHOTOS_DIR}/${name}`)
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Tidy: empty folders, .gitkeep in the content image folders
// ---------------------------------------------------------------------------------------------

const uniqueDeleted = [...new Set(deleted)]
for (const rel of uniqueDeleted) if (rel.startsWith('public/')) pruneEmptyDirs(dirname(rel))
const kept = []
if (!DRY) {
  for (const dir of KEEP_DIRS) {
    const abs = join(ROOT, dir)
    mkdirSync(abs, { recursive: true })
    if (readdirSync(abs).length === 0) {
      writeFileSync(join(abs, '.gitkeep'), '')
      kept.push(`${dir}/.gitkeep`)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

const verb = DRY ? 'would remove' : 'removed'
const content = uniqueDeleted.filter((f) => f.endsWith('.mdx'))
const media = uniqueDeleted.filter((f) => !f.endsWith('.mdx'))
let bytes = 0
for (const rel of DRY ? uniqueDeleted : []) bytes += statSync(join(ROOT, rel)).size

console.log(`clear-examples${DRY ? ' (dry run)' : ''}: ${verb} ${content.length} content files, ${media.length} media files, ${designsRemoved} design entries, ${photosRemoved} photo entries`)
for (const f of content) console.log(`  ${f}`)
for (const f of media) console.log(`  ${f}`)
if (designsRemoved) console.log(`  ${DESIGNS_FILE}: ${designsRemoved} ALL_DESIGNS entr${designsRemoved === 1 ? 'y' : 'ies'} with example: true`)
if (photosRemoved) console.log(`  ${PHOTOS_FILE}: ${photosRemoved} manualPhotos entr${photosRemoved === 1 ? 'y' : 'ies'} with an example- id`)
for (const f of kept) console.log(`  wrote ${f}`)
if (DRY && bytes) console.log(`  ${(bytes / 1024).toFixed(0)} KB on disk`)
if (uniqueDeleted.length === 0 && !designsRemoved && !photosRemoved) console.log('  nothing to do: no example content found')
if (!DRY && uniqueDeleted.length) console.log(`\nNext: review with \`git status\`, then commit. \`${relative(ROOT, join(ROOT, 'docs/example-content.md'))}\` describes what was here.`)
