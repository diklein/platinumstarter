---
name: import
description: Bring an existing blog into this site from a platform export: WordPress, Squarespace, Ghost, Substack, Medium, Tumblr, Blogger, a Markdown folder (Jekyll, Hugo, Obsidian, Notion), or any RSS or Atom feed. Use when the user says "import my blog", "bring my Substack over", "migrate from WordPress", "move my posts here", "I have an export", or drops an export file and asks what to do with it.
---

# Import

The importers under `scripts/import/` already know every format. This skill is the conversation
around them: which export to download, where to drop it, a dry run, the real run, the images, and
a summary of what came over and what needs a look. The owner never reads `docs/import.md`; you
do, when a case here does not cover what you see.

## 1. Which platform, which export

Ask, only if the first message does not say: "Which platform is it coming from, and do you
already have the export file?" Then tell them exactly where the export lives on that platform,
in one sentence, from this table. Say what the file will look like so they recognise it.

| platform | where the export is | you get | importer |
| --- | --- | --- | --- |
| WordPress (self-hosted) | Tools, Export, All content, Download Export File | one `.xml` | `wordpress.mjs` |
| WordPress.com | Tools, Export, Export all | a zip around the `.xml` (pass the zip) | `wordpress.mjs` |
| Squarespace | Settings, Import and Export, Export, WordPress format | one `.xml`; a site with no blog page exports empty | `wordpress.mjs` |
| Posthaven | account settings, WordPress-format export | one `.xml` | `wordpress.mjs` |
| Ghost | Settings, Migration tools (Ghost 5) or Labs (older), Export your content | `<site>.ghost.<date>.json`; images stay on the Ghost site, so ask for the site URL | `ghost.mjs --site-url <url>` |
| Substack | Settings, Exports, New export, wait for the email | a zip with `posts.csv` and `posts/` | `substack.mjs` |
| Medium | Settings, Security and apps, Download your information, wait for the email | `medium-export.zip` | `medium.mjs` |
| Tumblr | Settings, blog, Export, wait for the email | a zip with `posts.zip` and `media/` inside | `scripts/migrate-tumblr.mjs` (see below) |
| Blogger | Settings, Manage blog, Back up content | `blog-<date>.xml` (Atom) | `feed.mjs` |
| Jekyll, Hugo, Eleventy, Astro | the repo's content folder | a folder | `markdown.mjs` |
| Obsidian | the vault folder | a folder | `markdown.mjs` |
| Notion | Settings, Export, Markdown and CSV | a zip (pass it as is) | `markdown.mjs` |
| Bear Blog | the posts CSV from the dashboard | one `.csv` | `markdown.mjs` |
| Wix, Svbtle, Write.as, Micro.blog, anything else with a feed | no export; the site's feed URL | nothing to download | `feed.mjs --url <feed url>` |

Something not in the table: `docs/import.md` has the long version and the lossy notes per
platform. Two platforms at once are two runs; slugs that collide get a numeric suffix.

## 2. Where the file goes

Anywhere outside the repo is fine (`~/Downloads` is usual). Never copy the export into the
repo: it carries the owner's whole history and sometimes other people's names and emails. Do
not unzip it; the importers read zips. If the owner pasted a path with spaces, quote it.

## 3. Dry run first, always

```
node scripts/import/<importer>.mjs --src "<path>" --dry-run
```

Read the plan before saying anything. It lists every post with its date, slug, type
(`article`, `note`, `photo`, `link`), and title, then a summary line (`<platform>: N would be
written to src/content/writing; N pages skipped; N attachments skipped; N drafts skipped`), the
images that would need fetching, and `note:` lines for anything lossy.
Report to the owner in three lines: how many posts and their date range, what was skipped and
why (pages, drafts, attachments are normal), and anything the notes flag. Then ask one question:
"Import all of these?" with the answer proposed. If the plan shows zero posts from a Squarespace
export, the site had no blog page; say so and stop.

Drafts are skipped by default. Offer `--drafts` only if the plan reported skipped drafts and
the owner might want them; imported drafts land as published posts, so most owners say no.

## 4. The real run, then the images

```
node scripts/import/<importer>.mjs --src "<path>"
```

The run is offline: posts are written to `src/content/writing/`, image paths are already
rewritten to `/images/writing/<slug>/<file>`, and the URLs that still need fetching are listed
at the end. Then, while the old site is still up:

```
node scripts/import/<importer>.mjs --src "<path>" --fetch-media --force
```

`--force` rewrites the posts just written so the downloaded files replace the remote URLs.
Tell the owner how many images came down and name any that failed (the original URL is kept and
a warning printed; the post still renders, from the old host, until that host goes away).
Hundreds of images take minutes; say so before starting and run it in the background.

A second run of either command is safe: posts are identified by the `imported:` line in their
frontmatter and reported as already imported.

## 5. Check and review

```
npm run validate-mdx
node scripts/check-conventions.mjs
```

A post that fails to compile usually kept a component tag or a template expression the notes
already pointed at; open it, fix the line, say which post. Then read the notes in the summary
and open those posts first. The ones worth a sentence each to the owner:

- **Untitled posts** became notes (`type: note`). They render, without a heading, in the writing list only when `writing.postTypes` includes notes. Say how many there are.
- **Paywalled or subscriber-only sections** (Substack, Ghost) are marked with a comment; the paid part is in the file if the export had it.
- **Footnotes** from Substack keep their numbers as superscripts; the footnote bodies were not in the export. The owner can paste them back.
- **Embeds** (tweets, videos, Medium's media proxy) became links with a note; say which posts.
- **Galleries and dropped shortcodes** are named in the notes with the post slug.
- **Dates from file times** (a Markdown folder without dates) are guesses; list them.

Start `npm run dev` if it is not running and give the owner two or three URLs to read: the
newest post, the oldest, and one the notes flagged.

## 6. Afterwards

- If setup is in progress, set `setup.steps.content: true` in `site.config.ts` and go back to the setup skill.
- The examples are still there. Say that `npm run clear-examples` (`--dry-run` first) removes them, and run it only on a yes.
- Publishing the import is the `publish` skill; an import is a content push (`content(writing): import N posts from <platform>`). Ask before pushing if the owner did not say to.
- Leave the `imported:` frontmatter line in place. It does not render and it is what makes a rerun safe.

## Tumblr

The Tumblr export is the one path that is not a `scripts/import/` importer. Unzip the export,
put `posts.zip` and the `media/` folder under a `Tumblr/` folder at the repo root (it is
gitignored), then:

```
npm run migrate-tumblr                      # the plan, nothing written
npm run migrate-tumblr -- --apply           # everything
npm run migrate-tumblr -- --apply --select "2011-2013"
```

It handles text, photo, quote, link, and answer posts, lifts a post's heading into the title,
decodes Tumblr's entity-encoded bodies, and copies media under `public/images/imported/tumblr/`.
Reblogs are skipped. Delete the `Tumblr/` folder when done.

## Do not

- Copy the export into the repo, commit it, or commit a subscriber list, a `delivers.csv`, or anything from the export that is not a post.
- Run without `--dry-run` first, or run `--fetch-media` before the owner has agreed to the plan.
- Rewrite the owner's old posts: no tidying prose, no new descriptions, no tags they did not have. The notes are a to-do list for them, not for you.
- Read the export aloud. Summaries and counts only; the owner knows what they wrote.
- Write em or en dashes in anything you produce.

## Worked example

**User:** I exported my Substack, it's in Downloads. Bring it over.

**Agent:** finds `~/Downloads/export-clayandash.zip`, runs `node scripts/import/substack.mjs --src ~/Downloads/export-clayandash.zip --dry-run`, reads 41 posts to write, 3 drafts skipped, 2 threads skipped, 118 images to fetch, notes on two footnoted posts. Says: "41 posts from March 2022 to last week, 118 images. Three drafts and two thread posts are skipped, which is usual. Two posts have footnotes whose text Substack does not export; the numbers survive and you can paste the text back. Import all 41?" On yes: runs the real command, then `--fetch-media --force` in the background, then the two checks. Says: "Done: 41 posts in src/content/writing, 118 images under public/images/writing, all fetched. Read them at http://localhost:3000/writing; the two footnote posts are /writing/the-kiln-log and /writing/on-pricing. The examples are still on the site; say the word and I'll clear them. Publishing is a push whenever you are ready."
