#!/usr/bin/env node
/**
 * fetch-unsplash-photos.mjs: the old name of the photo sync, kept so existing cron lines and
 * habits keep working. The Unsplash logic now lives in scripts/photo-sources/unsplash.mjs and
 * runs through scripts/fetch-photos.mjs, which syncs every source in site.photos.sources into
 * src/lib/synced-photos.json. This wrapper runs that script restricted to Unsplash.
 *
 * Usage (unchanged):
 *   UNSPLASH_ACCESS_KEY=xxx node scripts/fetch-unsplash-photos.mjs [--dry-run]
 *
 * Prefer `node scripts/fetch-photos.mjs` directly; it syncs the other sources too.
 */
console.log('fetch-unsplash-photos.mjs is now `node scripts/fetch-photos.mjs --only unsplash`; running that.\n')
if (!process.argv.includes('--only')) process.argv.push('--only', 'unsplash')
await import('./fetch-photos.mjs')
