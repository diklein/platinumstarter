---
name: setup
description: Set up this Platinum site for its owner, one question at a time, by editing site.config.ts. Use when the user says "set up my site", "setup", "set this up", "get started", "make this mine", "this is my site now", or introduces themselves and asks for the site to reflect it. Drives the shared checklist in setup.steps (identity, shape, brand, content, ship) and resumes from wherever it stands.
---

# Setup

## Doctrine

- Untouched, the site is a labelled demo of itself. The first job is to make it say the owner's name, inside a minute of their first message. Everything else comes after that.
- One question at a time, each with a proposed default. Never a form, never a list of questions.
- `site.config.ts` at the repo root is the only file identity lives in. Edit it directly. Never touch `src/` to change who the site belongs to.
- The flow is data. `setup.steps` in the config is the checklist; the dev-only wizard at `/settings?setup=1` and hand-editing use the same one, so the owner can switch interfaces mid-stream. Read `setup.steps` before asking anything.
- Every field has a default and skipping is always fine (zero-configuration doctrine). Do not block on anything optional.

## Before the first question

1. Read `site.config.ts`. If any `setup.steps` entry is already true, say so in one line and skip it.
2. If a field's meaning is unclear, read the comments in `src/lib/site-config-schema.ts`. Never ask the owner what the schema already answers: the author's name IS the site name; the tagline is one plain line under it; social handles go in `social.<network>`; the URL keeps its default until there is a domain.
3. If the first message already carries facts (name, business, craft, handles, email, place), write them without asking. Ask only for what is missing and needed for the current step.

## The steps, in order

### 1. Identity (target: the site says their name within 60 seconds)

Ask, only if not already given: "What's your name, and one line to go under it?"

Write to `site.config.ts`:
- `identity.name`: their name (a person's name, not a brand, unless they say the brand is the site).
- `identity.tagline`: one plain sentence in their words. Do not rewrite it into marketing copy. A business name can live here ("Wheel-thrown stoneware from Clay and Ash.").
- `identity.email`, `identity.location`, `social.<network>` when mentioned. Leave `identity.intro` and `identity.description` unset: they fall back to the tagline, and a sentence you compose about the owner is a sentence they did not write. Delete the template's own intro line rather than replacing it. `footer.byline` can stay; mention it only if they ask about the footer. Leave `identity.url` unset: on Vercel the build reads the project's production domain, custom or .vercel.app, so it needs no value. Set it only if they host elsewhere or name a host to pin.
- `setup.steps.identity: true`.

Verify (below). Start `npm run dev` in the background if it is not running and point them at `http://localhost:3000`: the header wordmark and the hero now carry their name. Mention once that the Setup page on the home page stays until setup is completed.

### 2. Shape (presets, not checklists)

Ask one question: "Which is closest: Writer, Photographer, Designer, or Everything?" Give each preset's one-line blurb from `src/lib/presets.ts` and propose the one that fits what they have said (someone with pots to photograph: Photographer).

Write: copy the chosen preset's three fields into `site.config.ts` literally, as `applyPreset` would: `modules` (every toggle except `lab`, which stays as it is), `nav`, and `home.grid`. Then apply anything specific they said on top ("no podcast" is `modules.podcasts: false`). Never hide a module by editing `nav`, `src/lib/search-index.ts`, or `src/app/page.tsx`; a disabled module drops out of the nav, palette, sitemap, and home grid by itself.

Offer once, in one sentence, to delete the folders of modules that are now off (`MODULE_META[id].dir` in the schema). Do it only on a yes. The build passes either way.

Set `setup.steps.shape: true`.

### 3. Brand (skippable)

Ask: "An accent color and a mark, or keep the defaults for now?" Default: keep.
- A color: `brand.accent` as an OKLCH string (convert from hex if that is what they gave).
- A logo file: put it under `public/` and set `brand.mark` to that path. No file: `brand.mark: 'wordmark'` renders their name as text. Switch away from `'starter'` once the name is theirs; that mark is the template's own.
- Set `setup.steps.brand: true` whether they chose or skipped. A decision was made.

### 4. Content

Ask: "A first post now, an import of an existing blog, or keep the examples for a while?"
- First post: follow the `new-post` skill. Their voice, their facts, no em dashes. Tell them the file path and the URL.
- Import: follow the `import` skill (which platform, where the export is, dry run, apply, images, a summary), then come back here.
- Keep the examples: fine. Say that `npm run clear-examples` (with `--dry-run` first) removes them whenever they want. Clearing is an explicit action; never run it unasked.

Set `setup.steps.content: true` once one of the three has happened.

### 5. Ship

A conversation that uses their own `gh` and `vercel` CLIs, not a one-click flow. The full recipe with what each command asks is in `docs/onboarding.md`; the order is: `gh auth status` (then `gh auth login`, device flow), `git init` and a first commit if needed, `gh repo create <name> --private --source=. --remote=origin --push`, `npx vercel login`, `npx vercel link`, `npx vercel git connect`, any keys through `npx vercel env add NAME production` (they paste the value at the prompt; it never appears in chat). From then on `git push origin main` is the publish button. Never publish content with `vercel deploy`.

Owners who came in through the Deploy button already have the repo and the project: `gh repo clone` and `npx vercel link` are the only steps. Their production site has been showing a "not set up yet" page since the button; the first push after `setup.completed: true` replaces it.

The site's URL follows the Vercel project on its own (`identity.url` stays unset); a custom domain later is `npx vercel domains add <domain>`. Set `setup.steps.ship: true` after the first push that deploys.

### Closing

When every step is true, or the owner says they are done: set `setup.completed: true`, verify, and say the Setup page is gone. If the site is deployed, say that the next push replaces the "not set up yet" page production has been showing with the real site. Then one sentence each on what was deferred: a custom domain (`npx vercel domains add <domain>` plus the DNS record Vercel prints; the site picks it up on its own), connections (API keys in `.env.local`, tested from `/settings`; the agent they write with usually comes with one: Claude Code with an Anthropic key, Codex with an OpenAI key, others through the Vercel AI Gateway, and `intelligence.provider` should match), Obsidian (open the folder as a vault: new notes land in drafts, the git plugin commits and pushes every ten minutes, so writing there publishes on its own; `sources.obsidianVault` adds edit links), and the lab (`modules.lab`, visible in dev and preview only).

## Verify after every write

```
npx tsc --noEmit -p tsconfig.json
node scripts/check-conventions.mjs
```

`npm run build` only before shipping (step 5), never after every edit. If a check fails with a message the owner could not act on, fix it yourself; that is a template bug, not theirs.

## Resuming

Read `setup.steps` and start at the first false step. Do not re-ask what is done. If the wizard or a hand edit changed the file mid-stream, the file wins.

## Do not

- Add taste knobs (spacing, type scale, motion, shadows). They are the design system, not settings.
- Write em dashes or en dashes in anything you produce, config or copy.
- Put a secret in `site.config.ts`, print a key in chat, or read `.env.local` values aloud. Say a key was set, never what it is.
- Invent facts about the owner (years of experience, a city they did not name, customers, equipment). Ask or omit.
- Edit `src/` to change identity. If the old name still shows somewhere, that is a template bug: report it, do not patch around it.
- Run an AI enrichment script (alt text, SEO, review) without a key in `.env.local`; nothing in setup needs one.
- Ask whether to use MDX or Markdown, or which frontmatter; the `new-post` skill knows.

## Worked transcript (the potter test, `qa/potter.md`)

**User:** I'm a potter in Ohio. My name is Maren Holloway, my studio is called Clay and Ash, and I make wheel-thrown stoneware. Set up this site for me. My instagram is clayandash and my email is maren@clayandash.example.

**Agent:** reads `site.config.ts` (every step false). Writes `identity.name: 'Maren Holloway'`, `identity.tagline: 'Wheel-thrown stoneware from Clay and Ash.'`, `identity.location: 'Ohio'`, `identity.email`, `social.instagram: 'clayandash'`, `setup.steps.identity: true`. Runs tsc and the convention check, starts `npm run dev`. Says: "Your name is on the site: http://localhost:3000. The URL stays at the template default until you have a domain, and the setup panel on the home page stays until we finish. Next is the shape. You have pots to photograph, so I'd suggest Photographer: photos first, then writing. The others are Writer, Designer, and Everything. Photographer?"

**User:** I don't have a design portfolio or a podcast. Turn those off. I do want a photos section for pictures of my pots.

**Agent:** applies the Photographer preset (designs and podcasts off, photos on, nav `photos, writing, about`, grid `photos, latestPost, social`), `setup.steps.shape: true`, verifies. Says: "Done. Designs and podcasts are off and out of the nav; photos are on. Their folders, src/app/designs and src/app/podcasts, can stay or go; the site builds either way. Want them deleted? And for the look: an accent color and a mark, or keep the defaults for now?"

**User:** Write my first post. Title it "Why I stopped glazing the bottoms". It's about how leaving the foot unglazed shows the clay body, saves kiln shelves, and how my customers started asking for it. Keep it short and in my voice, plain and practical. Then show me where it lives.

**Agent:** takes the silence on brand as keep (`setup.steps.brand: true`). Follows `new-post`: `src/content/writing/why-i-stopped-glazing-the-bottoms.mdx`, `type: article`, quoted date, slug, title, `tags: []`; three short paragraphs on her three points, nothing added. `setup.steps.content: true`. Says: "It lives at src/content/writing/why-i-stopped-glazing-the-bottoms.mdx and renders at /writing/why-i-stopped-glazing-the-bottoms. It is the latest post on the home page and in /feed.xml."

**User:** Publish it.

**Agent:** "Publishing is a git push. There is no remote yet, so: I'll commit now, then we create the GitHub repo and the Vercel project on your own accounts. gh and vercel will each ask you to log in in the browser. Ready?" Runs the ship recipe step by step, `setup.steps.ship: true` after the first deploy, then `setup.completed: true`, and closes with the three deferred topics in one sentence each.
