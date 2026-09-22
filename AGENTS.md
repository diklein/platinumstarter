## Project

**Platinum**: a personal site template. Writing, photography, and design work on a fast Next.js site that its owner publishes to with a git push. Claude Code is the primary interface: the owner talks, the agent edits `site.config.ts` and the content folders, and Vercel builds what gets pushed.

You are working for the owner of this copy, not for the template's author. Everything the site says about a person comes from `site.config.ts` and `src/content/`; nothing about the owner is hardcoded anywhere else, and nothing in `src/` should be edited to change who the site belongs to.

This file is the instructions file for every agent: Codex, Cursor, and Gemini CLI read it as `AGENTS.md`, and `CLAUDE.md` and `GEMINI.md` import it. Edit this file, not those.

## Start here

- `setup.completed` in `site.config.ts` is `false` until the site has been set up. While it is false, the site renders as a labelled demo of itself with a Setup page (`/setup`, first in the nav) that ranks the ways in and tracks the checklist; a production deployment that is not a demo shows a "not set up yet" page instead until the flag flips and a push rebuilds. If the owner introduces themselves or asks to set up, get started, or make the site theirs, follow the `setup` skill (`.claude/skills/setup/SKILL.md`): identity first, then shape, brand, content, ship. One question at a time, each with a proposed default.
- `site.config.ts` is the only file identity lives in. Every field has a default and a comment; `src/lib/site-config-schema.ts` documents the rest. Read the comments before asking the owner a question the file already answers.
- Seven skills ship with the template and are the product: `setup`, `new-post`, `edit-post`, `new-page`, `publish`, `import`, and `craft`. Use them by name whenever the request matches. "What can you do?" is answered by naming them: set the site up, write a post, change a post, add a page, publish, bring an old blog over, and keep the design honest. `craft` (`.claude/skills/craft/SKILL.md`) is the site's design rules as a checklist: read it before adding or changing any component, page, or style, and run its review list on every visual diff.
- The dev-only control panel at `/settings` writes the same file (`/settings?setup=1` is the wizard form of the setup flow). Whichever interface ran last, the file wins; read it before writing.
- Publishing is `git push origin main`, and the `publish` skill makes that one word: it moves a draft out, checks it, commits, pushes, and reports the live URL once the deploy has landed. Never `vercel deploy`, a deploy hook, or a CMS suggestion. The ship recipe, with what each command asks the owner, is in `docs/onboarding.md`.

## Constraints

- **Tech stack**: Next.js 16 App Router + `@next/mdx` + shadcn/ui + Tailwind v4 + Vercel. No deviation without discussing it with the owner.
- **Performance**: 100/100 Lighthouse is the standard. A pattern that costs performance is a no, however pretty.
- **Publishing**: no build-time external API dependencies. The site must build from repo files only; every sync and enrichment script runs before the commit, never during the build.
- **Images**: all images through `next/image`. Markdown images in posts compile to it; no raw `<img>` tags in `src/` (`src/app/og/**` is the one exemption).
- **Client boundaries**: `'use client'` must never appear in `mdx-components.tsx` or a file it imports directly. Interactive pieces live in their own files.
- **Copy**: no em or en dashes in site copy, config, or anything the agent writes for the owner. Use a comma, colon, period, or parentheses. The owner's voice and the owner's facts; never invent a detail about them.
- **Secrets**: keys live in `.env.local` (gitignored) and, for deployments, `npx vercel env add`. Never in `site.config.ts`, never printed in chat. A pre-commit hook (`npm run hooks:install`, once per clone) scans staged files; `.obsidian/plugins/*/data.json` is gitignored so a plugin's key can never ship.
- **AI features**: alt text, SEO descriptions, and review scripts need a provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `AI_GATEWAY_API_KEY`, chosen by `intelligence.provider`). Do not run them, and do not ask for a key, unless the owner brings it up. Nothing in setup or in writing a post needs one.

## Conventions

The load-bearing rules are also mechanical checks in `scripts/check-conventions.mjs` (`npm run check`, and the start of every build). `docs/conventions.md` is the table of what is checked and how to get past a check when you are right and it is wrong.

- **New pages use `<PageShell>` and a sibling `layout.tsx`.** `PageShell` (`src/components/layout/page-shell.tsx`) provides the header-clearing top padding, the 12-column grid, the `page-title` heading, and the muted `section-label` subtitle. It does not bring the site footer: every new page directory also gets a three-line `layout.tsx` wrapping `SiteLayout` (copy `src/app/books/layout.tsx`). The `page-needs-layout` check fails a page without one; `/lab` sketches and pure-redirect routes are the only exemptions. The `new-page` skill has both files.
- **Content lives in the grid.** Place page content with the column classes from `globals.css`: `col-content` (the reading column), `col-prose` (wider), `col-media`, `col-portrait`.
- **Typographic and layout recipes are classes in `globals.css`**: `page-title`, `section-label`, `section-title`, `accent-link`, `link-accent-hover`, and the `col-*` classes. Use them instead of retyping their utilities. Taste knobs (spacing, type scale, motion, shadows) are the design system, not settings; do not add config for them.
- **Footnotes have one anatomy**, the FOOTNOTES block in `globals.css`. Articles write GFM `[^1]` markers; bespoke pages use `<ol class="footnote-list">` with `data-footnote-ref` and `data-footnote-backref` links. Never restyle footnotes locally.
- **Modules**: optional sections (designs, photos, books, podcasts, archive, hashtags, lab) are toggled in `modules` in `site.config.ts`. A disabled module drops out of the nav, palette, sitemap, home grid, and every in-page link by itself, and its URL answers 404 even while its folder is still on disk; never hide one by editing the header, the search index, or the home page. A module may import core; core never imports a module; modules never import each other. `docs/modules.md` has the registry and the recipe for adding one.
- **Header links come from `nav` in `site.config.ts`**, including custom links (`{ href, label }`). Never edit the header component to add one.
- **The lab** (`/lab`) is a gated sketchbook: visible in development and on preview deployments, never in production (`modules.lab` decides). Every sketch is registered in the `/lab` index. Never link a lab route from production UI.

## Where things live

- Posts: `src/content/writing/<slug>.mdx` (path set by `sources.writing`), one file per post, `slug` equal to the filename. Frontmatter and body rules are in the `new-post` skill; `docs/example-content.md` maps every MDX component to the example post that demonstrates it, so read the matching example before using a component. Scheduling is the date: a post dated in the future is hidden from production until that day (UTC) and appears then on its own, through the daily cron in `vercel.json` and `/api/cron/scheduled-posts`; there is no other scheduling field.
- Post media: `public/images/writing/<slug>/`, referenced as `/images/writing/<slug>/<file>`. Every video element needs a `poster` image (a build check insists); the `images-and-captions` example post shows each video component and what the poster and dimension scripts expect.
- Downloads: `public/files/`, linked as `/files/<name>` and offered through a `ProductCard` with `download`. This is the one folder where a `.md` URL is served as a file; every other `.md` URL returns that page's markdown rendition.
- Case studies: `src/content/designs/<slug>.mdx` plus an entry in `src/lib/designs.ts`; `docs/case-study-guidance.md` is the anatomy.
- Photos: `public/images/photos/` with entries in `src/lib/manual-photos.ts`, or a synced source (Unsplash, Glass, Pixelfed, Immich, PhotoPrism) configured in `photos.sources`; see `docs/photo-sources.md`.
- Example content: every demo post, case study, and photo is marked (`example: true` in frontmatter, or an `example-` id). `npm run clear-examples` removes all of it, media included; run `--dry-run` first, and only when the owner asks. The reverse direction is `npm run export`: every post and case study as a Hugo-style page bundle (`<slug>/index.md` plus its images), the photos, and `site.config.ts`, zipped outside the repo; nothing in it is a secret. Offer it when the owner asks how to leave or back up.
- Drafts: `src/content/writing/drafts/` is gitignored and renders in development only. Underscore-prefixed files there are scaffolding, not drafts.
- Obsidian: the repository is also a vault. Opening the folder in Obsidian gives new notes in the drafts folder, attachments under `public/images/writing`, Markdown links, a `Templates/Post.md` with the post frontmatter, and the git plugin committing and pushing every ten minutes, so a note moved out of drafts is published on its own. The plugin's settings file is the one Obsidian settings file that ships; every other plugin's is gitignored because they can hold keys.
- Data loaders and JSON snapshots: `src/lib/`, never inside a module folder.

## Commands

```sh
npm run dev                 # localhost:3000
npm run check               # every convention check (--fix writes missing layouts)
npm run validate-mdx        # compile every post
npm run build               # prebuild checks, then next build; run before a first ship
npm run new-post            # scaffold a post (the new-post skill can also write the file directly)
npm run clear-examples      # remove the template's demo content (--dry-run first)
npm run export              # the owner's content as Markdown page bundles, a zip in ~/Downloads
npm run hooks:install       # the pre-commit secret scan, once per clone
npx tsc --noEmit -p tsconfig.json
```

After any edit to `site.config.ts` or `src/`: `npx tsc --noEmit -p tsconfig.json` and `node scripts/check-conventions.mjs`. `npm run build` only before shipping, not after every edit; never run it while `next dev` holds port 3000. Importing an existing blog (WordPress, Squarespace, Ghost, Substack, Medium, Tumblr, Blogger, a Markdown folder, or a feed) is the `import` skill, which runs `scripts/import/*.mjs` with `--dry-run` first; `docs/import.md` is the reference behind it.

## Stack notes

Full stack research (versions, rationale, alternatives, sources) lives in `docs/tech-stack.md`. The rules that matter day to day:

- Tailwind v4: no `tailwind.config.ts`; all config lives in `globals.css` via `@theme`.
- Turbopack + remark/rehype plugins: pass plugin names as strings in `next.config.mjs` (functions cannot cross the Rust boundary).
- Animation is the `motion` package (import from `motion/react`); `framer-motion` is its dead predecessor, do not add it.
- Type is Geist Sans and Geist Mono, self-hosted; `docs/typography.md` explains the scale and how to swap the face without moving it.
- `next/og` image routes: `display: flex` only (no grid or float), fonts fetched in the route handler, 500KB per-route bundle limit, `tw` prop for Tailwind.
- Model calls go through one provider seam (`scripts/lib/ai.mjs`): Anthropic by default, OpenAI or Vercel AI Gateway by config. Other vendors go through the gateway.
- The optional database (likes, newsletter) is Neon Postgres through Drizzle; `npm run db:push` once after `DATABASE_URL` is set. Everything else is static files.

## Docs

`docs/onboarding.md` (the setup flow and the ship recipe), `docs/modules.md` (the content/system boundary), `docs/conventions.md` (the checks), `docs/example-content.md` (what each example demonstrates), `docs/import.md` (bringing a blog over), `docs/photo-sources.md`, `docs/settings.md` (the dev-only panel), `docs/lab.md`, `docs/typography.md`, `docs/case-study-guidance.md`, `docs/tech-stack.md`.
