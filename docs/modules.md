# Modules: the content/system boundary

Every route on the site sits in one of three tiers. The tier decides what a site owner (or an
agent working for one) may delete, and what must survive that deletion.

- **Core** always exists. It never imports from a module folder.
- **Modules** are optional route groups toggled in `site.config.ts` (`modules`). Toggling one off
  hides it everywhere it is registered. Deleting its folders with the toggle off still builds.
- **Never-ships** were the original owner's personal products and tools. They are gone from the
  template; this file records what they were so nothing grows back around their old seams.

The mechanical rule behind all of it: **a module may import core; core never imports a module;
modules never import each other.** Shared pieces live in core and gate themselves with
`moduleEnabled()` at render time. `scripts/check-conventions.mjs` (`module-dirs-consistent`)
checks that every enabled module's folder exists.

## Tier 1: core

| Route | Folder | Depends on | Depended on by |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx`, `src/components/home/*` | `site.home.grid` cells (see below) | nav |
| `/about` | `src/app/about`, `src/components/about/*` | `lib/github` (calendar, needs `GITHUB_TOKEN`), `lib/synced-photos.json` (photo card, self-disables without the photos module) | nav |
| `/writing`, `/writing/[slug]` | `src/app/writing`, `src/components/writing/*`, `src/components/blog/*` | `lib/posts`, `mdx-components.tsx` | feed, search, sitemap, home |
| `/[slug]` | `src/app/[slug]` | `lib/posts` (308 redirect of legacy root-level post slugs to `/writing/<slug>`) | old inbound links |
| `/feed.xml` | `src/app/feed.xml` | `lib/posts` | social row RSS mark |
| `/og` | `src/app/og` | fonts under `public/fonts` | every page's OG card |
| `/search-index.json`, `/api/search-index` | `src/app/search-index.json`, `src/app/api/search-index` | `lib/search-index` (module rows filter by `moduleEnabled`), `lib/designs` | the command palette |
| `/api/md/[[...slug]]` | `src/app/api/md` | `lib/markdown-pages` (module branches gate on `moduleEnabled`) | `src/proxy.ts` (`.md` suffix + `Accept: text/markdown`) |
| `sitemap.xml`, `robots.txt` | `src/app/sitemap.ts`, `src/app/robots.ts` | `MODULE_META` + `moduleEnabled` | search engines |
| `not-found` | `src/app/not-found.tsx` | none | every 404 |
| `/api/likes` | `src/app/api/likes` | `publishing.likes` in the config plus their env keys; `lib/db/schema` (`likes` table only) | like buttons |

Core component folders that modules share (so they can never be a module's to delete):

| Folder | What lives there | Used by |
| --- | --- | --- |
| `src/components/lightbox/` | the photo lightbox + `useLightbox` | `/photos` and every article's media (`components/mdx/asset-lightbox`) |
| `src/lib/*` | every data loader and JSON snapshot (`designs`, `synced-photos.json`, `manual-photos`, `books`, `now`) | core registration points and the modules alike |

The data loaders stay in core on purpose: search, sitemap, markdown renditions, and the home grid
all need module data while the module is on, and a static `import` of a missing file fails the
build, so the only deletion-safe shape is "loaders in core, routes and route-only UI in the module".

## Tier 2: optional modules

`MODULE_IDS` / `MODULE_META` in `src/lib/site-config-schema.ts` are the registry. Turning a module
off drops it from: the header nav (`lib/nav`), the palette's page rows (`lib/search-index`), the
sitemap, the markdown router, the home grid, and every in-page link that targets it (writing's
"archive" link, tag chips, the About page's photo card).

| Module id | Route(s) | Folders you may delete (toggle off first) | Depends on (core) | Depended on by |
| --- | --- | --- | --- | --- |
| `designs` | `/designs`, `/designs/[slug]` | `src/app/designs`, `src/components/designs` | `lib/designs`, `src/content/designs/*.mdx`, `lib/auth` (password gate), `components/mdx/asset-lightbox` | search rows, sitemap, markdown (all gated) |
| `photos` | `/photos`, `/photos/[id]`, `/photos/feed.json` | `src/app/photos`, `src/components/photos` | `lib/unsplash-photos(.json)`, `lib/manual-photos`, `lib/photo-feed`, `components/lightbox` | home `photos` cell, About photo card (all gated) |
| `books` | `/books` | `src/app/books` | `public/images/books`; `lib/books` holds the one hand-set "currently reading" signal | home `reading` + `now` cells (gated) |
| `podcasts` | `/podcasts` | `src/app/podcasts` | `public/images/podcasts` | search row |
| `archive` | `/archive` | `src/app/archive`, `src/components/archive` | `lib/posts` | writing's subtitle link, `?from=archive` back link |
| `hashtags` | `/hashtags/[tag]` | `src/app/hashtags` | `lib/posts` | tag chips on posts and the writing list, sitemap tag routes (gated) |
| `lab` | `/lab/*` | `src/app/lab` | core only (`PageShell`, `SectionRail`, `MobileToc`, `components/ui`, `components/writing`, `lib/motion`); ships five example sketches, see `docs/lab.md` | palette "Go to Lab" row; gate lives in `src/proxy.ts` via `labReachable()`; `lab-index-registration` in `scripts/check-conventions.mjs` |

Home grid cells (`site.home.grid`) self-disable from data, not just toggles: `latestPost`
(always), `reading` (books module + `lib/books` `CURRENTLY_READING`), `now` (reading or the
latest titled post), `photos` (photos module + a photo), `social` (any filled network),
`calendar` (`GITHUB_TOKEN`). `home.preset: 'minimal'` renders the hero only.

## Tier 3: never-ships (removed)

| What | Was at | Notes |
| --- | --- | --- |
| Collection, Gear, Bookmarks, Dashboard, Changelog modules | `src/app/{collection,gear,bookmarks,dashboard,changelog}`, `src/components/{bookmarks,changelog,dashboard,charts}`, `components/icons/gear-mark`, `components/layout/section-header` | their loaders (`lib/collection-data`, `lib/gear`, `lib/changelog`, `lib/*-stats`, the bookmarks and favicon JSON), `src/generated/{changelog,commit-stats,collection-recent}.json`, `scripts/{generate-changelog,generate-collection-recent,fetch-bookmarks,fetch-favicons}.mjs`, `sync-bookmarks.yml`, the Shiori connection, `recharts`. The footer's "Last updated" now reads the latest commit from git directly (`lib/last-updated`) |
| Performance scores and design details | `src/app/{performance,design-details}`, `src/components/{performance,design-details}` | PageSpeed tracking workflow, `lib/performance(-data.json)` |
| Intake, QuickTake, Store product pages | `src/app/intake`, `src/app/quicktake`, `src/app/store` | plus their MDX demo components and the intake image folder |
| DKBezeler, DKMediaViewer, DKProductCard pages + the shadcn registry landing | `src/app/dk*`, `src/app/components`, `src/components/dk-*`, `public/r` | the design case study built around them (`vibecoded-projects`) and its `components/designs/vibecoded/*` went with them |
| Health tracking | `src/app/health`, `src/app/api/weight`, `src/components/health`, `weights` table | `scripts/seed-weights.mjs` |
| Reading progress | `src/app/api/reading`, `src/lib/reading.ts`, `reading` table | replaced by the static `lib/books` signal |
| Caption ingest | `src/app/api/caption` | |
| Lapse dev panel route | `src/app/lapse-panel` | `src/components/dev/lapse.tsx` still exists because `src/app/layout.tsx` mounts it; remove both together |
| Owner tooling scripts | `scripts/bake-bezel`, `fix-bezel-fringe`, `generate-extension-icons`, `install-image-watcher`, `watch-images`, `check-dk-drift`, `post-to-x`, `sync-x-bookmarks`, `x-bookmarks-auth`, `x-bookmarks-state.json`, `seed-weights`, `migrate-like-notifications`, and the Intake capture pipeline (`capture-article`, `normalize-capture`, `bookmarklet.js`) | `.github/workflows/post-to-x.yml` removed; `sync-bookmarks.yml` lost its X step; `newsletter-emailed.json` and `bookmark-enrichments.json` ship empty |
| Legacy redirects | `redirects()` in `next.config.mjs` | the original site's Tumblr-era URL space; the list ships empty with the row shape in a comment |
| Planning archive | `.planning/` | the original site's build history (GSD plans, research, sketches) |
| Announcement posts for the above | `src/content/writing/introducing-dk*`, `introducing-intake-for-obsidian`, `currently-reading-widget` | they rendered components that no longer exist |
| Lab sketches of the above | `intake-icons`, `intake-app-window`, `store-*`, `product-marks`, `package-stats`, `vibecoded-*`, `currently-reading`, `break-product-card`, `break-fixes`, `shadows-applied`, plus `break-design-card` and `break-bookmarks-search` (they imported another module's UI) | |

Writing posts that still link to removed routes (left for the content pass): `streetline.mdx`
(`/store`), `how-to-make-a-photography-book.mdx` and `designs/streetline.mdx` (absolute `/store`
URLs).

## Delete-folder verification

Each run is `npm run build` in an isolated copy of the tree (rsync, real `node_modules` clone;
Turbopack rejects a symlinked `node_modules`), with the other agent's still-failing convention
rules skipped (`no-em-dashes`, `lab-index-registration`, `sources-exist`; see the report).

| Run | Config | Folders deleted | Result |
| --- | --- | --- | --- |
| (a) as-is | `site.config.ts` unchanged (every module on) | none | pass (2026-08-31) |
| (b) writer only | every module `false`, `nav: ['writing', 'about']` | every module's `src/app/*` folder plus `src/components/{designs,photos,archive}` | pass, `tsc` clean; routes left: `/`, `/about`, `/writing`, `/writing/[slug]`, `/[slug]`, `/feed.xml`, `/og`, `/search-index.json`, `/api/*`, `/design-system`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/manifest.webmanifest` |
| (c) no photos, no designs | `photos: false`, `designs: false`, the rest on (lab included) | `src/app/{photos,designs}`, `src/components/{photos,designs}` | pass, `tsc` clean |

## How to add a module

1. Create `src/app/<dir>/page.tsx` wrapped in `<PageShell>` and a sibling `layout.tsx` that wraps
   `SiteLayout` (copy `src/app/books/layout.tsx`). Route-only UI goes in
   `src/components/<dir>/`; anything another page will render goes in a core folder.
2. Register it: add the id to `MODULE_IDS`, a `{ href, label, dir }` row to `MODULE_META`, and a
   default to `DEFAULTS.modules` in `src/lib/site-config-schema.ts`.
3. Give it its registrations, each gated by `moduleEnabled('<id>')`: a page row under
   `MODULE_PAGES` in `src/lib/search-index.ts` (the `check-search-index` tripwire insists), a
   `MODULE_ROUTES` entry in `src/app/sitemap.ts`, a markdown branch in `src/lib/markdown-pages.ts`
   if the page has a markdown rendition, and a home cell in `src/components/home/home-cells.tsx`
   if it earns one.
4. Data loaders and JSON snapshots go in `src/lib/`, never inside the module folder.
5. Add the id to `nav` in `site.config.ts` if it belongs in the header.
6. Prove it: toggle the module off, delete its folders, and run `npm run build`.
