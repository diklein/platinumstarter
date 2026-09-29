#!/usr/bin/env node
/**
 * fetch-photos.mjs: syncs every remote photo source in site.config.ts (`photos.sources`) into
 * src/lib/synced-photos.json, which the site merges with the local photos folder at build time
 * (src/lib/photo-feed.ts). Commit the JSON: the build never calls a photo API.
 *
 *   node scripts/fetch-photos.mjs                 sync every configured source
 *   node scripts/fetch-photos.mjs --dry-run       fetch and report, write nothing
 *   node scripts/fetch-photos.mjs --only glass,immich
 *   node scripts/fetch-photos.mjs --force         override the shrink guard
 *
 * One adapter per service lives in scripts/photo-sources/<kind>.mjs; see docs/photo-sources.md
 * for what each needs. Keys come from the environment (.env.local is loaded when present):
 * UNSPLASH_ACCESS_KEY, PIXELFED_TOKEN (optional), IMMICH_API_KEY, PHOTOPRISM_TOKEN.
 *
 * Doctrine, carried over from the Unsplash-only sync this replaced (fetch-unsplash-photos.mjs
 * is now a wrapper around this script) and applied to every source:
 *  - DEDUPE: an id never lands twice, within a source or across sources.
 *  - STALE-CACHE GUARD: a committed photo that a listing dropped is kept while it is under
 *    RECENT_DAYS old. Unsplash answers from caches that disagree about recent uploads (two fresh
 *    uploads vanished from the sync after landing, 2026-07-24); a recent photo missing from one
 *    listing is far more likely a stale cache than a deletion. A real deletion still leaves
 *    the JSON once the photo ages past the window.
 *  - SHRINK GUARD: a populated cache is never replaced by a near-empty result. A source that
 *    fails keeps every photo it committed before, and a run whose merged result is under half
 *    the committed count aborts without writing (unless --force).
 *  - EXIF and alt text already committed survive a re-sync that comes back without them
 *    (Unsplash's EXIF endpoint rate-limits; generate-unsplash-alt-text.mjs writes alt text into
 *    this file).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.removeAllListeners('warning') // site.config.ts import: "module type not specified" is expected

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(ROOT, 'src/lib/synced-photos.json')
const RECENT_DAYS = 60
const SHRINK_FLOOR = 5 // below this many committed photos the shrink guard has nothing to protect

const ADAPTERS = {
  unsplash: () => import('./photo-sources/unsplash.mjs'),
  glass: () => import('./photo-sources/glass.mjs'),
  pixelfed: () => import('./photo-sources/pixelfed.mjs'),
  immich: () => import('./photo-sources/immich.mjs'),
  photoprism: () => import('./photo-sources/photoprism.mjs'),
}

// .env.local, if present; values already in the environment win (Node's own loader never
// overrides), so cron and CI keep passing keys the usual way.
try { process.loadEnvFile(path.join(ROOT, '.env.local')) } catch { /* no local env file */ }

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex === -1 ? null : String(args[onlyIndex + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/fetch-photos.mjs [--dry-run] [--force] [--only kind,kind]')
  process.exit(0)
}

function describe(source) {
  switch (source.kind) {
    case 'unsplash': return `unsplash${source.user ? ` @${source.user}` : ''}`
    case 'glass': return `glass @${source.profile}`
    case 'pixelfed': return `pixelfed @${source.user}@${source.instance}`
    case 'immich': return `immich ${source.url}${source.album ? ` (album ${source.album})` : ''}`
    case 'photoprism': return `photoprism ${source.url}${source.album ? ` (album ${source.album})` : ''}`
    default: return String(source.kind)
  }
}

const hasExif = (e) => !!e && Object.values(e).some((v) => v !== null && v !== undefined)

/** A fresh record inherits what the committed one knew and the source no longer says. */
function carryForward(next, prev) {
  if (!prev) return next
  const out = { ...next }
  if (!hasExif(next.exif) && hasExif(prev.exif)) out.exif = prev.exif
  if (!next.alt_description && prev.alt_description) out.alt_description = prev.alt_description
  return out
}

function validate(photo, label) {
  const problems = []
  if (typeof photo?.id !== 'string' || !photo.id) problems.push('id')
  if (!(photo?.width > 0) || !(photo?.height > 0)) problems.push('width/height')
  if (typeof photo?.urls?.regular !== 'string' || !photo.urls.regular) problems.push('urls.regular')
  if (typeof photo?.color !== 'string') problems.push('color')
  if (problems.length) throw new Error(`${label}: adapter returned a record without ${problems.join(', ')} (${photo?.id ?? 'no id'})`)
}

async function readPrevious() {
  try {
    const parsed = JSON.parse(await readFile(OUT_PATH, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // first run
  }
}

async function main() {
  const site = (await import(pathToFileURL(path.join(ROOT, 'site.config.ts')).href)).default
  let sources = Array.isArray(site?.photos?.sources) ? site.photos.sources : []
  if (only) {
    const unknown = only.filter((k) => !ADAPTERS[k])
    if (unknown.length) {
      console.error(`unknown source kind(s): ${unknown.join(', ')}. Known: ${Object.keys(ADAPTERS).join(', ')}`)
      process.exit(2)
    }
    sources = sources.filter((s) => only.includes(s.kind))
  }
  if (sources.length === 0) {
    console.log(only
      ? `Nothing to sync: site.photos.sources has no ${only.join('/')} source.`
      : 'Nothing to sync: site.photos.sources is empty (local photos in site.sources.photos always render). Add a source in site.config.ts; see docs/photo-sources.md.')
    return
  }

  const prev = await readPrevious()
  const prevById = new Map(prev.map((p) => [p.id, p]))
  const merged = []
  const seen = new Set()
  const configuredKinds = new Set(sources.map((s) => s.kind))
  const failedKinds = new Set()
  const okKinds = new Set()
  const perSource = []

  console.log(`${dryRun ? 'Dry run: ' : ''}syncing ${sources.length} source${sources.length === 1 ? '' : 's'} (${prev.length} photos committed)\n`)
  for (const source of sources) {
    const label = describe(source)
    const load = ADAPTERS[source.kind]
    if (!load) {
      console.log(`✗ ${label}: unknown source kind`)
      failedKinds.add(source.kind)
      continue
    }
    process.stdout.write(`${label}… `)
    try {
      const { fetchPhotos } = await load()
      const photos = await fetchPhotos(source, process.env, {
        site, prev: prevById, progress: (msg) => process.stdout.write(`\r${label}… ${msg} `),
      })
      let added = 0
      let dupes = 0
      for (const photo of photos) {
        validate(photo, label)
        if (seen.has(photo.id)) { dupes++; continue }
        seen.add(photo.id)
        merged.push(carryForward(photo, prevById.get(photo.id)))
        added++
      }
      okKinds.add(source.kind)
      perSource.push({ label, count: added })
      console.log(`\r${label}: ${added} photo${added === 1 ? '' : 's'}${dupes ? ` (${dupes} duplicate id${dupes === 1 ? '' : 's'} skipped)` : ''}`)
    } catch (err) {
      failedKinds.add(source.kind)
      perSource.push({ label, count: null })
      console.log(`\r${label}: FAILED`)
      console.error(`  ${err.message}`)
    }
  }

  // Committed photos the run did not see again.
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  let keptForFailure = 0
  let keptForCache = 0
  for (const p of prev) {
    if (seen.has(p.id)) continue
    const k = p.source ?? 'unsplash' // records from before `source` existed were all Unsplash
    if (only && !only.includes(k)) { seen.add(p.id); merged.push(p); continue } // outside this run's scope
    if (!configuredKinds.has(k)) continue // the owner removed that source: its photos go
    if (failedKinds.has(k)) { seen.add(p.id); merged.push(p); keptForFailure++; continue }
    if ((p.created_at ? Date.parse(p.created_at) : 0) > cutoff) {
      console.log(`  ⚠ ${p.id} (${(p.created_at ?? '').slice(0, 10)}) missing from the ${k} listing, keeping it (stale-cache guard)`)
      seen.add(p.id)
      merged.push(p)
      keptForCache++
    }
  }
  if (keptForFailure) console.log(`  kept ${keptForFailure} committed photo${keptForFailure === 1 ? '' : 's'} from the failed source${failedKinds.size === 1 ? '' : 's'}`)

  merged.sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0))

  if (okKinds.size === 0) {
    console.error('\nEvery source failed; the committed JSON is untouched.')
    process.exit(1)
  }
  if (!force && prev.length >= SHRINK_FLOOR && merged.length < prev.length / 2) {
    console.error(`\nShrink guard: the result has ${merged.length} photos but ${prev.length} are committed. Not writing. Re-run with --force if the shrink is real.`)
    process.exit(1)
  }

  const summary = `${merged.length} photo${merged.length === 1 ? '' : 's'} (${prev.length} before${keptForCache ? `, ${keptForCache} held by the stale-cache guard` : ''})`
  if (dryRun) {
    console.log(`\nDry run: would write ${summary} to src/lib/synced-photos.json`)
  } else {
    await writeFile(OUT_PATH, JSON.stringify(merged, null, 2) + '\n')
    console.log(`\nSaved ${summary} to src/lib/synced-photos.json`)
  }
  if (failedKinds.size) {
    console.error(`${failedKinds.size} source${failedKinds.size === 1 ? '' : 's'} failed (see above); their committed photos were kept.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
