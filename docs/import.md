# Importing your blog

The short way is to tell your agent "import my Substack" (or WordPress, Squarespace, Ghost,
Medium, Tumblr, Blogger, a folder of Markdown, a feed): the `import` skill knows where each
platform's export lives, runs the right importer with a dry run first, fetches the images, and
tells you what needs a look. This page is the reference behind it.

Six importers under `scripts/import/` turn a platform export into the MDX this site reads. They
share one runner (`scripts/migration-utils.mjs`), so the flags, the output, and the guarantees
are the same everywhere:

```
node scripts/import/<source>.mjs --src <file | folder | zip> [--dry-run] [--drafts] [--fetch-media] [--force]
                                 [--out <dir>] [--images <dir>]
```

| flag | what it does |
|---|---|
| `--src` | the export: a file, a folder, or a zip (each importer says which it expects) |
| `--out` | where the MDX goes. Default: `sources.writing` in `site.config.ts` (`src/content/writing`) |
| `--images` | where media goes. Default: `sources.images` + `/writing` (`public/images/writing`) |
| `--dry-run` | print the plan (what would be written, with slug, date, type, title) and write nothing |
| `--drafts` | include unpublished posts; every importer skips them by default |
| `--fetch-media` | download the remote images posts reference. Off by default: the run is offline, image paths are rewritten to their local home, and the URLs that still need fetching are listed at the end |
| `--force` | rewrite posts this importer already wrote (see idempotency below) |

What every importer guarantees:

- **Frontmatter the site expects.** `type`, `date` (quoted `YYYY-MM-DD`), `slug`, `title`,
  `description` when the platform had one, `tags` as a JSON array, plus a provenance line:
  `imported: { source: "<platform>", id: "<original id or URL>" }`.
- **Idempotent.** A post is identified by that `imported` line. Running the same command twice
  writes nothing the second time ("N already imported"). `--force` rewrites those posts in
  place at the same slug. A slug that is taken by anything else (a hand-written post, a post
  from another importer) gets a numeric suffix: `market-weekend-2`.
- **Type detection.** `photo` (an image and under 20 words), `link` (opens on a bare URL),
  `note` (under 150 words, no headings), otherwise `article`.
- **Media.** Every image reference becomes `/images/writing/<slug>/<file>`. Files bundled with
  the export (Hugo bundles, Obsidian attachments) are copied on every run. Remote images are
  downloaded only under `--fetch-media` (http/https only, 20MB cap, 15s timeout); a failed
  download keeps the original URL and warns. The featured image, when the platform has one,
  becomes the first image in the body (the site's lead-image convention).
- **MDX safety.** Braces and stray `<` in prose are escaped so the file compiles.
- **Pages, attachments, menus, comments** are counted and skipped. The summary line says how
  many of each.

Pick your source below. The last section maps the platforms that do not get their own importer
onto the one that handles them.

## WordPress (`wordpress.mjs`)

**Export.** WordPress admin → Tools → Export → "All content" → Download Export File. You get an
`.xml` file (WXR, WordPress eXtended RSS). WordPress.com wraps the same XML in a zip; pass the
zip, the importer finds the XML inside.

```
node scripts/import/wordpress.mjs --src export.xml --dry-run
node scripts/import/wordpress.mjs --src export.xml --fetch-media
```

**What it handles.** Posts vs pages vs attachments vs menus and revisions (only posts are
written); categories and tags merged into `tags` (`uncategorized` dropped); `content:encoded`
HTML to Markdown, including classic-editor bodies that have no `<p>` tags (paragraphs are
blank-line separated) and block-editor bodies (the `<!-- wp:… -->` comments vanish); the
`[caption]`, `[embed]`, `[video]`, `[audio]`, `[code]`, and `[sourcecode]` shortcodes;
`excerpt:encoded` becomes `description`; the featured image via `_thumbnail_id` and the
attachment's URL. Dates come from `wp:post_date` (the site's local calendar date), not
`pubDate` (a UTC instant that can land a day early).

**Lossy.** `[gallery]` shortcodes are dropped with a note (the export carries attachment ids,
not the gallery). Other shortcodes stay as literal text. Comments are not imported. Custom post
types are skipped as "other". Images are anything the body references, so hotlinked
third-party images are listed for fetching too.

## Ghost (`ghost.mjs`)

**Export.** Ghost admin → Settings → Labs (older) or Migration tools (Ghost 5) → Export your
content. You get `<site>.ghost.<date>.json`. The JSON has no images in it; images stay on your
Ghost site, so pass `--site-url` and `--fetch-media` while the site is still up.

```
node scripts/import/ghost.mjs --src my-site.ghost.2026-08-31.json --site-url https://blog.example.com --fetch-media
```

**What it handles.** `db[0].data.posts`, `posts_tags`, and `tags`. Both post formats: Lexical
(Ghost 5, the `lexical` field) and Mobiledoc (Ghost 1 to 4, the `mobiledoc` field), with the
`html` field as the fallback when neither is present. Cards and nodes: image, gallery,
markdown, html, code, embed, bookmark, callout, toggle, header, button, hr, paywall (becomes an
MDX comment plus a note). Pages skipped; drafts and scheduled posts skipped unless `--drafts`;
internal `#tags` dropped; `custom_excerpt` becomes `description`; `feature_image` leads the
body. `__GHOST_URL__` placeholders resolve through `--site-url`.

**Lossy.** File, audio, video, and product cards become a plain link to their source. Email-only
cards (email, email CTA, signup) are dropped. Underline, subscript, and superscript formatting
is dropped. Member visibility is noted but not enforced. Authors are not imported.

## Substack (`substack.mjs`)

**Export.** Substack dashboard → Settings → Exports → New export. After a few minutes you get a
zip with `posts.csv` and `posts/<post_id>.<slug>.html`, one file per post.

```
node scripts/import/substack.mjs --src substack-export.zip --fetch-media
```

**What it handles.** `posts.csv` drives it: `title`, `subtitle` (becomes `description`),
`post_date`, `is_published` (unpublished skipped unless `--drafts`), `type` (newsletter and
podcast posts are imported; pages and threads are skipped), `audience` (paid posts get a
note), `podcast_url` (becomes the first line of the body). The HTML cleanup strips the
subscribe widgets, subscribe buttons, share dialogs, and polls; keeps the original upload
behind each image rather than the resized webp; turns YouTube wrappers into a plain URL and
embedded posts into links. A paywall marker in the HTML becomes
`{/* Substack paywall: everything below was paid-only */}` and a note.

**Lossy.** Substack has no tags, so `tags` is empty. Comments, likes, and subscriber-only
footnote popovers are gone (footnote numbers survive as superscripts). Polls do not export.
Podcast audio is a link, not an embed.

## Medium (`medium.mjs`)

**Export.** Medium → Settings → Security and apps → Download your information. Medium emails
a link to `medium-export.zip`; inside, `posts/` has one HTML file per story:
`YYYY-MM-DD_Title-<hash>.html` for published stories, `draft_Title-<hash>.html` for drafts.

```
node scripts/import/medium.mjs --src medium-export.zip --fetch-media
```

**What it handles.** Title from `<h1 class="p-name">`, subtitle section as `description`, date
from the footer's `<time class="dt-published">` (falling back to the filename, then the file's
modification time for drafts), the canonical link as the provenance id. The cleanup pass takes
the body section only, drops the repeated title and subtitle headings and the first section
divider (later dividers become `---`), unwraps the section and layout divs, turns link cards
(`graf--mixtapeEmbed`) into links, decodes Medium's `/r/?url=` redirect links, and keeps
pull quotes as blockquotes. Drafts are skipped unless `--drafts`.

**Lossy.** Medium exports carry no tags. Embeds (tweets, videos, gists) are exported only as
an iframe pointing at Medium's media proxy; they become a link to that proxy with a note.
Responses (comments) in the export are stories without titles and import as notes. Claps and
highlights are gone.

## A folder of Markdown (`markdown.mjs`)

For Jekyll, Hugo, Eleventy, Astro, Obsidian, Notion, Bear Blog, Blot, or any folder of `.md`
files. Point it at the repo, the vault, or the content directory. A zip (Notion's export) is
unpacked for you; a Bear Blog CSV is read row by row.

```
node scripts/import/markdown.mjs --src ~/code/old-jekyll-site
node scripts/import/markdown.mjs --src ~/Downloads/Export-abc123.zip     # Notion
node scripts/import/markdown.mjs --src ~/Obsidian/Vault --dry-run
```

**Front matter.** YAML (`---`), TOML (`+++`, Hugo), JSON, or a Blot/Notion `Key: value` header
under the H1. Keys mapped: `title`; `date`/`pubDate`/`published`/`publishDate`/`publishedAt`/
`created`; `tags`/`categories`/`keywords` (string or array; Eleventy's collection tag `posts`
is dropped); `draft: true`, `published: false`, `status: draft`, or a `_drafts/` folder;
`layout: page`/`type: page` (skipped as pages); `description`/`summary`/`excerpt`/`subtitle`;
`image`/`cover`/`heroImage`/`featured_image`/`thumbnail` (leads the body); `slug`/`permalink`.
Without a date the Jekyll `YYYY-MM-DD-slug.md` filename or a `YYYY/MM/DD/` path is used, then
the file's modification time (with a note). Without a title the first `# H1` is used, then the
filename. Hugo page bundles (`index.md`) take their folder's name as the slug and keep their
sibling images. `_index.md`, top-level `content/*.md`, and README-style files are skipped.

**Body.** Shortcodes become plain Markdown: `{% highlight %}` and `{{< highlight >}}` to fenced
code, `{{< figure >}}` to an image plus caption, `{{< youtube >}}`, `{{< vimeo >}}`,
`{{< tweet >}}`, `{{< gist >}}` to their URL, `{{< ref >}}`/`{{< relref >}}`/`{% post_url %}`/
`{% link %}` to `/writing/<slug>` when the target is in this import, `{{ site.baseurl }}` to
nothing. `[[Wiki links]]` become `[label](/writing/slug)` when a post with that name exists and
plain text otherwise; `![[image.png]]` embeds become images, found by name anywhere in the
folder (Obsidian attachment folders). Callouts become bold-led blockquotes. Kramdown `{: …}`
attribute lists, Obsidian `%% comments %%`, and MDX `import`/`export` lines are removed.
Relative image paths are resolved against the file, the folder root, and `static/`, `public/`,
`src/`, `assets/`.

**Lossy.** Every other Liquid or Hugo tag is dropped and named in a note (`{% include %}`,
custom shortcodes, `{{ page.x }}`). Astro/MDX components in the body are left as-is and will
not compile until you replace them. Notion property tables beyond the header lines are plain
text. The Bear CSV columns are matched by name heuristically; open the CSV if the mapping looks
wrong. Prose with literal braces is not escaped here (it is author-written Markdown).

## Any RSS or Atom feed (`feed.mjs`)

The universal fallback for a platform with no export: Wix, Svbtle, Write.as, Blogger's Atom
backup, a Micro.blog feed, anything else that publishes a feed.

```
node scripts/import/feed.mjs --src feed.xml
node scripts/import/feed.mjs --url https://example.com/feed.xml     # fetches over the network
```

**What it handles.** RSS 2.0 (and RSS 1.0 items) and Atom 1.0. Bodies prefer `content:encoded`
over `description` (RSS) and `content` over `summary` (Atom, in html, xhtml, and text forms).
Tags from `category`. Slugs from the last segment of the item's link. Enclosure or
`media:content` images lead the body. A Blogger Atom export is recognised by its kind
categories: comments, settings, and templates are skipped, pages are skipped, and `app:draft`
entries are skipped unless `--drafts`.

**Lossy, and this one deliberately says so.** Feeds usually carry only the newest 10 to 25
posts, and many carry summaries instead of bodies. The run ends with a note to that effect, and
any item that arrived without a full body and looks cut off (ends with `[…]`, "read more", or
is under 60 words) gets its own note. Authors and comments are not imported.

## Where the other platforms go

| platform | export | importer |
|---|---|---|
| Squarespace | Settings → Import & Export → Export → WordPress format (one blog page per export; some blocks do not survive Squarespace's own exporter) | `wordpress.mjs` |
| Posthaven | the WordPress-format XML export in your account settings | `wordpress.mjs` |
| WordPress.com | Tools → Export → Export all (a zip around the XML) | `wordpress.mjs` |
| Jekyll, Hugo, Eleventy, Astro | the repo's content folder | `markdown.mjs` |
| Obsidian | the vault folder | `markdown.mjs` |
| Blot | `git clone` your Blot folder (or point at the Dropbox/Drive folder) | `markdown.mjs` (or the older `scripts/migrate-blot.mjs`, which knows Blot's `Date:` headers and `/img/` paths) |
| Notion | Settings → Export → Markdown & CSV → the zip, as-is | `markdown.mjs` |
| Bear Blog | the posts CSV from the dashboard | `markdown.mjs` |
| Blogger | Settings → Manage blog → Back up content (`blog-<date>.xml`, Atom) | `feed.mjs` |
| Wix | `https://<your site>/blog-feed.xml` (no other export exists) | `feed.mjs --url` |
| Svbtle | the site's RSS feed (truncated; there is no export) | `feed.mjs --url` |
| Write.as / WriteFreely | the blog's RSS feed | `feed.mjs --url` |
| Micro.blog | the site's feed (or its own export bundle, which is WXR: `wordpress.mjs`) | `feed.mjs` / `wordpress.mjs` |
| Tumblr | the export zip's `html/` folder | `scripts/migrate-tumblr.mjs` (the existing script) |

Not covered: platform APIs (WordPress REST, Ghost Admin API, Tumblr API, Webflow, Notion's
API, Micropub), LiveJournal's ljdump output, Day One's JSON, and Typepad (dead). Anything with
a feed still has `feed.mjs`.

## Leaving

`npm run export` (`scripts/export.mjs`) is the other direction: every post and case study as a
Hugo-style page bundle (`writing/<slug>/index.md` with its images beside it, paths made
relative), the photo library, and `site.config.ts`, as a zip in `~/Downloads` (or `--out` a
folder). `--drafts` includes the drafts folder. Hugo, Astro, Eleventy, and Obsidian read the
bundles as they are, and so does `markdown.mjs`, so the round trip back into a Platinum site is
one import.

## After the import

1. `node qa/import/run.mjs` proves the importers still work on the sanitized fixtures under
   `qa/import/fixtures/`; run it if you change one.
2. `npm run validate-mdx` compiles every post; an imported post that fails there usually has a
   leftover component tag or template expression the notes already pointed at.
3. Open the posts the summary flagged with notes first (paywalls, dropped embeds, mtime dates).
4. The `imported:` line is what makes a re-run safe. Leave it in place; it does not render.
