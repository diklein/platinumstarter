---
name: edit-post
description: Change an existing post on this site: fix a typo, rewrite a paragraph, change the title, add or swap an image, change the date or tags, turn the table of contents on or off, or rename its URL. Use when the user says "fix", "change", "edit", "update", "add a photo to", "retitle", "move the date", "rename" about a post that already exists, published or in drafts.
---

# Edit a post

A post is one MDX file. Editing it is editing that file, then letting the checks confirm it
still compiles. The owner's words stay the owner's words: change what was asked and nothing
around it.

## Which post

Find it, and say which one you picked when the request could mean more than one:

1. **Named** ("the glazing post", "Why I stopped glazing"): match the title or slug, case-insensitive, in `src/content/writing/` and `src/content/writing/drafts/`.
2. **By time** ("yesterday's post", "my latest", "the last one"): the newest `date` in `src/content/writing/`; "the one I'm working on" is the most recently modified file in `drafts/`.
3. **By subject** ("the kiln post"): grep titles first, then bodies, in that order.

Two or more candidates: name them and ask which. None: say so and offer the `new-post` skill.

## The edits

Read the whole file first. Then:

- **Text** (a typo, a sentence, a paragraph): change exactly the passage named. Do not tidy the rest. Quote the before and after lines in the reply, short.
- **Title**: change `title` in the frontmatter. The slug and the URL stay as they are; a title is not a URL. Only rename the slug when the owner asks for the address to change (below).
- **An image**: the file goes under `public/images/writing/<slug>/` (create the folder; move it there if the owner dropped it elsewhere in the repo; `git mv` if tracked). Reference it as `![<alt in the owner's words or a plain description>](/images/writing/<slug>/<file>)` on its own line where they asked, or after the first paragraph when they did not say. A caption is the image's title string: `![alt](/path "Caption text")`. Keywords in the title (`full`, `portrait`, `narrow`, `border`, `shadow`) set the layout; `docs/example-content.md` and the `images-and-captions` example show them. No raw `<img>`.
- **Date**: `date` as a quoted `YYYY-MM-DD`. A future date schedules the post (production hides it until that day, UTC); say so if the date they gave is ahead of today.
- **Tags**: `tags` is a JSON array of lowercase words. Add or remove what was asked.
- **Description**: `description`, one line, in their words. Do not write one they did not ask for.
- **Table of contents**: `toc: true` or remove the line.
- **Type**: `article`, `photo`, `note`, `link`. A note has no title; a link post opens on a bare URL. Change the type only when asked.
- **Unpublish** ("take it down", "make it a draft"): the `publish` skill's unpublish step.

## Renaming the URL

Only on request ("rename it to", "change the URL", "the slug should be"):

1. `git mv src/content/writing/<old>.mdx src/content/writing/<new>.mdx` and set `slug: <new>` (the slug must equal the filename; `[a-z0-9-]` only).
2. `git mv public/images/writing/<old> public/images/writing/<new>` if it exists, and update every `/images/writing/<old>/` reference in the body.
3. Add a redirect row in `redirects()` in `next.config.mjs` so the old address keeps working:
   `{ source: '/writing/<old>', destination: '/writing/<new>', permanent: true }`.
4. Tell the owner the old URL redirects to the new one after the next publish.

A post in `drafts/` has never been published; rename it freely, no redirect.

## Verify

```
npm run validate-mdx
node scripts/check-conventions.mjs
```

The dev server picks the change up without a restart; give the owner the URL to look at
(`http://localhost:3000/writing/<slug>`). A published post is republished by the `publish`
skill; do not push unless they said to. A draft stays a draft.

## Do not

- Rewrite anything beyond what was asked, "improve" their prose, or add a description, tags, or an image they did not mention.
- Write em or en dashes in anything you add. Leave the owner's own punctuation alone.
- Invent a fact about them or their work to fill a gap; ask, or leave it out.
- Touch another post, `site.config.ts`, or anything under `src/` for an edit that lives in one MDX file.
- Run the alt text, SEO, or review scripts unless a key is in `.env.local` and they asked.
- Change the slug of a published post as a side effect of a title change.

## Worked example

**User:** add the photo of the bowl bottoms to the glazing post, after the first paragraph, and fix "shelfs" in it

**Agent:** finds `src/content/writing/why-i-stopped-glazing-the-bottoms.mdx`, finds `bowl-bottoms.jpg` at the repo root, moves it to `public/images/writing/why-i-stopped-glazing-the-bottoms/bowl-bottoms.jpg`, inserts `![Three bowls upside down, the unglazed feet showing the clay](/images/writing/why-i-stopped-glazing-the-bottoms/bowl-bottoms.jpg)` after the first paragraph, changes `shelfs` to `shelves`, runs the two checks, and says: "Done. The photo sits after the first paragraph and 'kiln shelfs' is now 'kiln shelves'; nothing else changed. Look at http://localhost:3000/writing/why-i-stopped-glazing-the-bottoms. It is published, so say the word and I'll push the change."
