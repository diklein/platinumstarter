/**
 * Search-index tripwire.
 *
 * Writing posts and design studies flow into the ⌘K palette automatically
 * (getSearchIndex() derives them from content), but static pages live in the
 * hand-curated PAGES array in src/lib/search-index.ts — curated on purpose, so
 * each entry keeps its verbatim-subtitle description and hand-picked keywords.
 *
 * This check makes the curation impossible to forget: it fails the build when a
 * page route exists on disk with no PAGES entry. Same pattern as the dk-drift
 * and video-poster tripwires.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Routes that exist as pages but are deliberately absent from the palette.
// /lab/* is excluded wholesale (private sketchbook, gated from prod).
// /settings exists only under `next dev` (it writes site.config.ts); the palette reaches it
// through a dev-only action row instead of a page row (command-palette.tsx).
// /setup-needed is the production first-run state (next.config.mjs rewrites every page to it
// until setup.completed is true); it is not a destination anyone searches for.
const INTENTIONALLY_UNINDEXED = new Set(['/settings', '/setup-needed'])

const routes = execSync('find src/app -name page.tsx -not -path "*/lab/*"', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((p) => p.replace(/^src\/app/, '').replace(/\/page\.tsx$/, '') || '/')
  // Dynamic routes are content-driven: writing + designs are derived into the
  // index; photos/[id] and hashtags/[tag] are intentionally not palette rows.
  .filter((r) => !r.includes('['))

const source = readFileSync('src/lib/search-index.ts', 'utf8')
const indexed = new Set([...source.matchAll(/href:\s*'([^'?#]+)/g)].map((m) => m[1]))

const missing = routes.filter((r) => !indexed.has(r) && !INTENTIONALLY_UNINDEXED.has(r))

if (missing.length > 0) {
  console.error('✖ Pages missing from the ⌘K search index (src/lib/search-index.ts PAGES):')
  for (const r of missing) console.error(`  ${r}`)
  console.error(
    'Add an entry (title + verbatim-subtitle description + keywords), or add the route to INTENTIONALLY_UNINDEXED in scripts/check-search-index.mjs.'
  )
  process.exit(1)
}

console.log(`✓ Search index covers all ${routes.length} static pages`)
