---
name: publish
description: Publish a post or any pending change on this site: move a draft out of drafts if needed, check it, commit, push, and report the live URL once the deploy has landed. Use when the user says "publish", "publish this", "publish my draft", "ship it", "put it live", "post it", or "unpublish" / "take it down".
---

# Publish

Publishing on this site is a git push to `main`. This skill makes that one word, and makes sure
what goes out is right first. Never `vercel deploy`, never a deploy hook.

## What is being published

Work out which of these the owner means, in this order, and say which you picked:

1. **A draft they name** ("publish the glazing post"): a file in `src/content/writing/drafts/`.
2. **The draft they were just working on**: the most recently modified file in `drafts/`.
3. **Pending changes**: `git status --porcelain` shows modified or new files under `src/content/`, `public/images/`, `public/files/`, or `site.config.ts`. Publish those.
4. Nothing pending and no draft: say so. There is nothing to publish.

Never sweep in changes outside those paths (code under `src/`, scripts, config files other than
`site.config.ts`) without naming them and asking. A content push should be a content push. The
one exception: `src/generated/*.json` (image transparency and video dimensions, rewritten by every
`npm run build`) is derived, not content; commit it as `chore(generated): refresh` in the
same push, or leave it for Vercel's build to redo. Do not ask about it.

## A draft becomes a post

- Move the file from `drafts/` to `src/content/writing/` (`git mv` if tracked, plain `mv` if not: drafts are gitignored).
- Now or later: if the owner did not say when, ask once, "Now, or on a date?", with now proposed. A date in the future is the schedule: the post is pushed with that `date`, production leaves it out until the day, and a daily check just after midnight UTC puts it on the site without another push (development and preview show it in the meantime, marked Scheduled). Say the date it will appear and that it goes by UTC; a post dated tomorrow appears within the hour after midnight UTC.
- Frontmatter: `date` becomes today as a quoted `YYYY-MM-DD` unless the owner named a date; `slug` must equal the filename without `.mdx`, `[a-z0-9-]` only (rename the file to match the slug if the slug is the better one); `type` present (`article` unless the post has no title, then `note`); `tags` a JSON array; no `example: true`. A `description` is optional; do not invent one, and do not run the SEO script unless a key is set and the owner asked.
- Images the draft references: they belong under `public/images/writing/<slug>/`, referenced as `/images/writing/<slug>/<file>`. Move them there if they are elsewhere in the repo; do not fetch remote ones.
- No em or en dashes in anything you wrote. The owner's own text stays as it is.

## Check before it goes

```
npm run validate-mdx
node scripts/check-conventions.mjs
```

Both must pass. A failure with a message the owner could not act on is a template bug: fix it,
then continue. A failure about their content (a missing date, a bad slug) is yours to fix silently
and mention in one clause.

## Commit and push

- Stage only the files identified above.
- Message, conventional, present tense, the post's title when it is a post:
  `content(writing): <title>` for a new post, `content(writing): <title> (edit)` for a change to
  an existing one, `content(photos): <n> photos` for photos, `chore(config): <what changed>` for
  `site.config.ts`. One line; no trailer needed.
- `git push origin main`. No remote: this site has not been shipped yet; hand over to the ship
  step of the `setup` skill, then come back.
- The pre-commit hook may refuse a key-shaped string. It is right; move the value out of the
  file and try again.

## Report the live URL

The production origin is `identity.url` from `site.config.ts` when set; otherwise
`https://<name>.vercel.app` where `<name>` is `projectName` in `.vercel/project.json` (present
after `vercel link`); otherwise ask once and remember it in the conversation.

Poll the post's URL (`<origin>/writing/<slug>`, or the home page for a config change) every
15 seconds for up to 5 minutes with a browser user agent:

```
curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' <url>
```

A scheduled post (a future `date`) is not expected to be live: skip the poll, confirm the push
went through, and say when it will appear. Otherwise a 200 that contains the post's title means it is live: say so with the URL. Five minutes
without it: say the push went through and the deploy is still building, give the URL, and
suggest `npx vercel ls` or the Vercel dashboard if it stays that way. Never claim it is live
without having seen it.

## Unpublish

"Unpublish" / "take it down": `git mv` the post back into `drafts/` (it keeps rendering locally),
remove it from git, commit `content(writing): unpublish <title>`, push, and confirm the URL is
404 the same way. Its images can stay; say so.

## Do not

- Run `npm run build` here; the checks above are the gate and Vercel builds.
- Rewrite the owner's words, add a description they did not write, or change tags they set.
- Push code changes you happen to find in the tree without asking.
- Use `--force`, amend published commits, or touch any branch but `main`.

## Worked example

**User:** publish the glazing post

**Agent:** finds `src/content/writing/drafts/why-i-stopped-glazing-the-bottoms.mdx`, moves it to `src/content/writing/`, sets `date: "2026-09-11"`, confirms the slug matches, moves its one image under `public/images/writing/why-i-stopped-glazing-the-bottoms/`, runs the two checks, commits `content(writing): Why I stopped glazing the bottoms`, pushes, polls, and says: "Live: https://clayandash.example/writing/why-i-stopped-glazing-the-bottoms. It is the latest post on the home page and in the feed."
