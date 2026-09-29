# The lab: a gated sketchbook

`/lab` is where ideas for the site get built, compared, and thrown away. It is a folder of
self-contained pages under `src/app/lab/`, an index at `/lab` that lists them, and a gate that
keeps every one of them out of production.

## The gate

`src/proxy.ts` asks `labReachable()` (`src/lib/site-config.ts`) before it serves anything under
`/lab`, including the `.md` and `Accept: text/markdown` renditions. The answer comes from
`modules.lab` in `site.config.ts`:

| `modules.lab` | Local dev | Preview deployments | Production |
| --- | --- | --- | --- |
| `{ gate: 'preview' }` (default) | yes | yes | never |
| `{ gate: 'dev' }` | yes | no | never |
| `false` | no | no | never |

Off or gated, the route answers with the site's 404. The lab is also unlinked from the header
and the sitemap; the only in-site way to reach it is the command palette's "Go to Lab" row, which
follows the same rule. Every sketch sets `robots: { index: false, follow: false }` in its
metadata as belt and braces. With the module off, deleting `src/app/lab` entirely still builds.

## The doctrine: build in the lab, pick, harvest

1. **Sketch here.** A new idea for a page, a component, or a treatment starts as a page under
   `src/app/lab/<slug>/`, built from the site's own components and tokens so it looks like the
   site from the first render. Several variants of one idea can be one sketch or several.
2. **Pick.** Compare on preview, in both themes, at phone and desktop widths. Decide.
3. **Harvest.** Port the winner into the real page or component it belongs to. Then delete the
   sketch folder and its `ITEMS` row. The lab is where ideas are compared, not where they live;
   a sketch that stays becomes a second, drifting copy of production.

A sketch that loses is deleted sooner.

## Adding a sketch

1. Create `src/app/lab/<slug>/page.tsx`. Wrap it in `<PageShell title subtitle>` and place its
   content with the `col-*` column classes. Anything interactive goes in a sibling file that
   starts with `'use client'`; the page itself stays a server component.
2. Export `metadata` with `robots: { index: false, follow: false }`.
3. Do not add a `layout.tsx`. Lab pages are footerless by design, and the
   `page-needs-layout` convention check allowlists `src/app/lab/**` for exactly that reason.
4. Add a row to `ITEMS` at the top of `src/app/lab/page.tsx` (see below), newest first.
5. Run `node scripts/check-conventions.mjs`. `lab-index-registration` fails for any
   `src/app/lab/<slug>/page.tsx` without a row; `prebuild` runs the same script, so an
   unregistered sketch fails the build.

Shared fixtures that are not sketches (data, helper components) go in a folder whose name
starts with `_`; the registration check skips those.

`src/app/lab/hello-lab` is the template for a new sketch: copy the folder, rename it, and
replace the copy.

## The `ITEMS` convention

`src/app/lab/page.tsx` holds one flat array:

```ts
type Item = { date: string; route: string; name: string; blurb: string }

const ITEMS: Item[] = [
  { date: '2026-09-01', route: '/lab/hello-lab', name: 'Hello, lab', blurb: 'One paragraph on what the sketch shows and what to look for.' },
]
```

- `date` is the day the sketch landed, ISO `YYYY-MM-DD`. The list is newest first.
- `route` is the page's route, `/lab/<slug>`. The convention check matches on this literal,
  so keep it a plain string.
- `name` is the section heading on the index and the label in the left rail.
- `blurb` is the one paragraph under the heading. Write it for the reader who has not opened
  the sketch: what it shows, what to compare, what would count as a win.

The index derives everything else from the array: the section ids (the slug), the rail
groups, and the mobile Contents sheet. There is nothing else to register.

## The index

`/lab` is built on the site's own anatomy: `PageShell` with the section rail
(`src/components/layout/section-rail.tsx`, the same left rail `/settings` uses) listing
the sketches, the `MobileToc` sheet below the `xl` breakpoint, and one section per sketch in
the content column (date, route, name, blurb, link). The last section, "How it works", is the
short version of this document.

## The worked examples

The template ships five sketches so an empty lab still shows what a sketch looks like. Delete
them as soon as you have your own.

| Route | What it shows |
| --- | --- |
| `/lab/hello-lab` | The smallest sketch: a page, a `PageShell`, one button, and the three things every sketch needs |
| `/lab/color-tokens` | Every runtime color token as a live swatch in a forced-light and a forced-dark panel |
| `/lab/type-scale` | The fluid `clamp()` text tokens at their own size with a live pixel readout |
| `/lab/motion-easing` | The house spring next to the CSS easing tokens, same box, same distance, replayable |
| `/lab/post-card-variants` | The real `/writing` list item fed worst-case content |
