---
name: new-post
description: Create a new post (article, photo, note, or link) in this site's writing folder with the frontmatter the loader expects, then say where it lives. Use when the user says "new post", "write a post", "draft a post", "add a note", "write my first post", or asks where posts go.
---

# New post

## Where posts live

`sources.writing` in `site.config.ts`, default `src/content/writing/`. One `.mdx` file per post, named by slug. Media for a post goes under `public/images/writing/<slug>/` and is referenced as `/images/writing/<slug>/<file>`.

`scripts/new-post.mjs` writes to `src/content/writing/` directly; if `sources.writing` has been changed, write the file yourself (below) instead of running it.

## Two ways to create one

1. The script, when the owner is at a terminal: `npm run new-post` asks for a title and a type, derives the slug, writes the frontmatter, and opens the file in `$EDITOR`. Non-interactive from an agent:

   ```
   printf 'Why I stopped glazing the bottoms\narticle\n' | EDITOR=true node scripts/new-post.mjs
   ```

   (`EDITOR=true` makes the "open in editor" step a no-op.)

2. Write the file yourself with the same frontmatter. This is the normal path when you are also writing the body.

## Frontmatter

```yaml
---
type: article
date: "2026-09-01"
slug: why-i-stopped-glazing-the-bottoms
title: "Why I stopped glazing the bottoms"
tags: []
---
```

- `type`: `article` (titled prose), `photo` (image-led), `note` (untitled and short; hidden from the index while `writing.postTypes` is `'titled'`), `link` (opens on a bare URL).
- `date`: quoted `YYYY-MM-DD`, today unless told otherwise. A future date schedules the post: production hides it until that day (UTC) and shows it then without another push; dev and preview show it now, marked Scheduled.
- `slug`: `[a-z0-9-]` only, equal to the filename without `.mdx`.
- `tags`: a JSON array, empty is fine.
- Optional: `description` (one line for cards and metadata), `toc: true` (table of contents for long articles), `image` (lead image path). Never `example: true`; that marks the template's own demo content for `npm run clear-examples`.

## Body

MDX. `docs/example-content.md` maps every component to the example post that demonstrates it; read the matching example before using one:

- structure, lists, quotes, tables, footnotes, code blocks with titles and line numbers: `writing-a-post`
- images and captions (title keywords `full`, `portrait`, `narrow`, `border`, `shadow`) and video: `images-and-captions`
- slideshows and the `photo` post type: `a-photo-essay`
- product cards, app lists, and the other tags no example post uses: the props table in `docs/example-content.md`

Rules: `h2` and `h3` only (the page renders the title as `h1`), markdown images only (no raw `<img>`), no em or en dashes, the owner's voice and the owner's facts. Do not add details they did not give.

## Verify

- `npm run validate-mdx` compiles every post.
- In dev the post appears at `/writing/<slug>`, on `/writing`, as the latest post on the home page, and in `/feed.xml` without a restart.
- Tell the owner the file path and the URL.

## Publishing

`git add`, `git commit`, `git push origin main`. The push is the publish button; never `vercel deploy`, never a deploy hook. Do not run `generate-alt-text.mjs` or `generate-seo.mjs` unless a key is in `.env.local` and the owner asked.
