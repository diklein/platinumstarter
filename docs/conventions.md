# Conventions, enforced

Every load-bearing rule in CLAUDE.md is also a mechanical check. Prose gets missed (the footer rule was missed twice on the personal site this template came from); a script that fails the build does not. This page is the table of what is checked, why, and how to get past a check when you are right and it is wrong.

Two scripts carry the checks. `scripts/check-conventions.mjs` runs at the start of every build (`prebuild`) and by hand; `scripts/check-secrets.mjs` runs on every commit through a git hook. Both use Node built-ins only and read the same `site.config.ts` the site reads.

## The checks

| Rule | Why it exists | Check | What fails | Escape hatch |
| --- | --- | --- | --- | --- |
| Every page gets the site footer | `PageShell` does not bring the footer. A page directory needs a `layout.tsx` wrapping `SiteLayout`, or an ancestor that has one. Missed twice before this check existed. | `page-needs-layout` | A `src/app/**/page.tsx` with no `SiteLayout` in its own `layout.tsx` or any ancestor layout below `src/app`, and which does not render `<SiteLayout>` itself. Also fails when `SiteLayout` appears twice in one ancestry (double footer). | Footerless by design: anything under `src/app/lab/**` or `src/app/api/**`, and pure-redirect pages (a `page.tsx` that only calls `redirect()` / `permanentRedirect()`). `--fix` writes the three-line layout beside the page. |
| All images through `next/image` | Raw `<img>` skips the srcset, lazy loading, and the size reservation that keeps layout shift at zero. 100/100 Lighthouse is the standard. | `no-raw-img` (script) and the `no-restricted-syntax` rule in `eslint.config.mjs` | Any `<img` JSX under `src/`. | `src/app/og/**` is exempt (next/og renders raw `<img>` only). For a deliberate exception put `// convention: raw-img <reason>` on the line or the line above; ESLint needs its own `// eslint-disable-next-line no-restricted-syntax` beside it. The dk-* components that ship to npm are carved out in the ESLint config. |
| No client code in `mdx-components.tsx` | The MDX component map is imported by server code; a `'use client'` there drags every article's component tree to the client. Interactive pieces live in their own files. | `no-client-mdx-components` | `'use client'` in `mdx-components.tsx`, or any file it imports directly that starts with `'use client'`. | None for the file itself. For an import, wrap the client component in a server component file and import that. |
| No em or en dashes in copy | House style: no em or en dashes in site copy or AI-written page text. | `no-em-dashes` | U+2014 or U+2013 outside comments in `src/app/**/page.tsx`, `src/app/**/layout.tsx`, and `src/lib/search-index.ts`. Reported as `file:line` with the snippet. | Rewrite with a comma, colon, or period. Comments are already exempt. Glyphs used as list bullets or empty-value placeholders count too; use a real bullet or a hyphen. |
| Every lab prototype is registered | The lab index at `/lab` is the only way to find a sketch; an unregistered one is invisible. | `lab-index-registration` | A `src/app/lab/<name>/page.tsx` whose route is not in the `ITEMS` array of `src/app/lab/page.tsx` (matched on `route:` or `href:`). Skipped entirely when `src/app/lab` does not exist. | Prefix the directory with `_` (shared fixtures, not a prototype). Stale `ITEMS` entries print a NOTE, not a failure. |
| Content folders exist | Loaders and this script read `site.sources.*`; a typo there is an empty site with no error. | `sources-exist` | A `site.sources.{writing,designs,images,photos}` path that is not a directory. | `photos` may be absent when `site.photos.sources` is non-empty (synced sources supply the photos). |
| Module toggles match the folders | A module that is on but has no folder is a 404 in the nav; a folder for a module that is off is dead weight. | `module-dirs-consistent` | An enabled module (`site.modules.<id>` not `false`) whose `dir` from `MODULE_META` is missing. | A disabled module with its folder still on disk only prints a NOTE saying the folder is safe to delete. |
| No hardcoded identity | The template's "is this still someone's personal site?" tripwire. Identity belongs in `site.config.ts`; the codebase reads it from there. | `no-hardcoded-identity` | `site.identity.name`, the host of `site.identity.url`, `site.identity.email`, and every `site.social` handle found as a literal anywhere under `src/` (case-insensitive, one hit per line). | Excluded by design: `src/lib/site-config*.ts`, `src/content/**`, and comment lines. Values equal to the template defaults are not searched for. Skip the check with `--skip identity` (the build does this today, see below). |
| No secrets in commits | The Obsidian `data.json` scar: a plugin settings file with an API key in it, one `git add .` away from being public. | `check-secrets` (pre-commit hook) | Key-shaped strings in staged files: `sk-ant-`, Stripe live keys, `re_` (Resend), `ghp_` / `github_pat_`, Postgres URLs with a password, Google `AIza` keys, and `KEY|SECRET|TOKEN = "24+ chars"` assignments outside `.env*` files. Any staged `.obsidian/plugins/*/data.json` or `.env*` file (except `.example`, `.sample`, `.template`). | None inline, on purpose. Move the value to `.env.local` and read `process.env`; rewrite a false positive so it no longer looks like a key. |

## How to run

```sh
npm run check                      # every convention check
npm run check -- --skip identity   # skip one (comma-separate for several; any word of a check's name works)
npm run check -- --only layout     # run one
npm run check -- --fix             # apply the trivially safe fixes (today: writes missing layouts)

npm run check:secrets              # scan what is staged, exactly what the hook does
npm run check:secrets -- --all     # scan every tracked file

npm run hooks:install              # install the pre-commit hook (idempotent, run once per clone)
```

`npm run build` runs `check-conventions.mjs` first through `prebuild`; a failed check stops the build, the identity check included. The identity check scans `src/`, `scripts/`, the workflows, `next.config.mjs`, and `mdx-components.tsx` for the configured name, host, email, and handles (and their kebab-case forms, since a name also hides in file names), with comments stripped first. While `site.config.ts` holds the template defaults there is nothing to scan for; the check earns its keep the moment the identity is someone's.

### The hook

`scripts/install-hooks.sh` writes `.git/hooks/pre-commit` directly. There is no `husky` and no `prepare` script: a git hook is one file, and the template stays free of a dependency whose whole job is writing that file. Because `.git/hooks` is not cloned, run `npm run hooks:install` once per fresh checkout. The installer refuses to run while `core.hooksPath` points elsewhere (git would silently ignore `.git/hooks`), keeps any pre-existing hook as `pre-commit.local` and chains to it, and can be re-run any time.

### Adding a check

One function per check in `scripts/check-conventions.mjs`, registered in the `CHECKS` list at the bottom. A check returns `failures` (each a `file:line message`), optional `notes`, and a one-line `summary`. Add its row to the table above in the same change.
