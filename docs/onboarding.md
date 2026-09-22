# Onboarding: from a fresh copy to a site that says your name

Platinum's primary interface is Claude Code. A new owner copies the template, opens the folder
in Claude Code, and says "set up my site". Everything below exists so that sentence works, and so
the two other ways in (the wizard, the file) land in the same place.

## The three doors

| Door | How the copy arrives | Where onboarding starts |
| --- | --- | --- |
| `npx create-platinum` | a local folder, `npm install` done | the terminal, then the Setup page on `localhost:3000` |
| GitHub template ("Use this template") | a repo in the owner's account, cloned by hand | the Setup page after `npm ci && npm run dev` |
| Vercel Deploy button | a repo in the owner's GitHub AND a live site, before any local checkout | the live preview (the panel shows on preview deployments), then a local clone |

With the Deploy button the site exists before the code does, so onboarding must start inside the
running site: that is why the Setup page renders on preview deployments and not only in dev.

## The Setup page

`src/components/home/welcome-panel.tsx`, mounted above the hero in `src/app/page.tsx`. It
renders while `setup.completed` is `false` in `site.config.ts` and `VERCEL_ENV` is not
`production` (the same rule the lab gate uses, decided on the server at build time, so production
never ships the markup). It says the site is running as its own demo and ranks the three
interfaces:

1. Open this folder in Claude Code and say `set up my site` (a copyable chip).
2. The wizard at `/settings?setup=1`, development only.
3. Edit `site.config.ts` by hand.

Under that, the `setup.steps` checklist with its current state.

## Production before setup

A Deploy-button site is live before its owner has edited a file. While `setup.completed` is
`false`, a production build serves `src/app/setup-needed/page.tsx` for every page (a
`beforeFiles` rewrite in `next.config.mjs`, decided at build time from the flag) instead of
the demo: the site's name, "live but not set up yet", the three doors with the repository's
clone command, and `noindex`. Assets, the API, the social-card route, and the feeds are not
rewritten. The push that completes setup rebuilds without the rewrite. Development and preview
never see this page; they get the demo and the Setup page.

The marketplace listing links to a live demo, and that demo is a production deployment of this
same repository with setup incomplete. `PLATINUM_DEMO=1` in that one project's environment
keeps the demo on its production URL; no other project sets it.

## The sequence

The setup skill drives five steps, in this order, one question at a time, each with a proposed
default. Skipping is always allowed; nothing optional blocks.

| Step | Goal | Writes |
| --- | --- | --- |
| 1 identity | the site says the owner's name, within about a minute | `identity.name`, `identity.tagline`, `identity.email` (optional), `identity.location`, `social.*`; `identity.url` only for a host outside Vercel |
| 2 shape | which sections exist, via a preset, not a checklist | `modules`, `nav`, `home.grid` from `src/lib/presets.ts` (Writer, Photographer, Designer, Everything), then per-module tweaks |
| 3 brand | accent and mark, skippable | `brand.accent` (OKLCH), `brand.mark` |
| 4 content | a first post, an import, or the examples kept | a post via the `new-post` skill; or `scripts/import/*.mjs` per `docs/import.md`; `npm run clear-examples` only when asked |
| 5 ship | a remote and a Vercel project, through the owner's own CLIs | nothing in the config: the build reads the Vercel project's production domain |

Each step flips its `setup.steps.<step>` flag when written. The closing step sets
`setup.completed: true`, which hides the panel. Connections (API keys in `.env.local`), Obsidian
(`sources.obsidianVault`), and the lab are deferred: mentioned at the end, never blocking.

## The metrics

- Under 5 minutes from the first prompt to "the site says my name" (the header wordmark and the home hero show the owner's name).
- Under 15 minutes cumulative to a published post (committed, and pushed when a remote exists).

`qa/potter.md` is the script a tester follows to measure both, with the exact prompts, what the
agent must and must not do, and what counts as a template bug.

## Three skins, one checklist

The flow is data, not code in any one interface:

- `setup.steps` in `src/lib/site-config-schema.ts` is the checklist (`identity`, `shape`, `brand`, `content`, `ship`, all false by default; `defineConfig` merges).
- `src/lib/presets.ts` holds the shapes as typed partial configs plus `applyPreset(current, id)`, so the skill, the wizard, and `scripts/setup.mjs` apply identical objects.
- The skill (`.claude/skills/setup/SKILL.md`) reads the steps and starts at the first false one.
- The wizard (`/settings?setup=1`) shows the same steps as screens and writes the same file.
- `scripts/setup.mjs` is the no-agent fallback: readline prompts for name, tagline, url, email, and a preset; `--yes` keeps every current value; `--complete` flips `setup.completed`.
- Hand-editing is the third skin: every field has a comment and a default.

Because all three write `site.config.ts`, an owner can start in the wizard, continue in Claude
Code, and finish by hand; whichever runs next reads the file and continues.

## The ship recipe, as the agent runs it

A conversation, not a one-click flow. Every command is the owner's own account; the agent runs
the commands and says what each one will ask. Nothing here needs a token pasted into chat.

| # | Command | What it asks the owner | Notes |
| --- | --- | --- | --- |
| 1 | `gh auth status` | nothing | If it fails: `gh auth login`, which asks GitHub.com or Enterprise, HTTPS or SSH, and opens a browser with a one-time code (device flow). The owner types the code in the browser. |
| 2 | `git status` | nothing | `git init` if there is no repo yet, then `git add -A && git commit -m "Set up the site"`. The pre-commit secret scan runs if `npm run hooks:install` was done; run it first if not. |
| 3 | `gh repo create <name> --private --source=. --remote=origin --push` | the repo name and visibility are the two decisions; ask them in one question with `--private` proposed | Creates the repo, sets `origin`, pushes `main`. Deploy-button owners skip this: the repo exists; `gh repo clone <owner>/<name>` instead. |
| 4 | `npx vercel login` | opens a browser (or asks for an email and sends a code) | `npx` so nothing is installed into the project. |
| 5 | `npx vercel link` | the scope (personal or a team), link to an existing project or create one, the project name, the directory (`./`) | Writes `.vercel/` (gitignored). Deploy-button owners pick "link to existing" and the project Vercel made. |
| 6 | `npx vercel git connect` | confirms the GitHub repo to connect | After this every push to `main` deploys production; other branches deploy previews. |
| 7 | `npx vercel env add NAME production` (repeat per key, and `preview` when the preview needs it) | pastes the value at the prompt | Only for keys the owner actually has (`ANTHROPIC_API_KEY`, `DATABASE_URL`, ...). The value never appears in chat. Locally the same key goes in `.env.local`. |
| 8 | `git push origin main` | nothing | The publish button, now and forever. The first push after `git connect` is the first production deploy; `npx vercel inspect` or the dashboard shows the URL. Never `vercel deploy` to publish content. |
| 9 | (optional) a custom domain | `npx vercel domains add <domain>` plus the DNS record Vercel prints | Metadata, feeds, and OG cards follow the project's production domain on their own (`VERCEL_PROJECT_PRODUCTION_URL` at build time), so `identity.url` stays unset unless the site is hosted elsewhere. |

Before step 8 on a first ship, run `npm run build` once locally: the prebuild tripwires
(`check-conventions`, `check-search-index`, `validate-mdx`) fail there with a fixable message
instead of on Vercel.

## What the agent must not do while onboarding

- Ask a question the schema comments already answer (the author's name is the site name; the tagline is one plain line; handles go in `social.*`).
- Edit anything under `src/` to change identity, or hide a module anywhere but `modules` in the config.
- Create `.env.local`, ask for an API key, or run an AI enrichment script before the owner brings a key up.
- Rewrite the owner's words into marketing copy, invent a fact about them, or write an em dash.
- Publish with `vercel deploy`, a deploy hook, or a CMS suggestion. The push is the publish button.
