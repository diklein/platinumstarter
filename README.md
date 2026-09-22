---
name: Platinum
slug: platinum
publisher: Platinum
description: Platinum is a personal site you manage with AI. Writing, photography, and design work in Next.js and Markdown, set up by chat.
framework: Next.js
type: [Blog, Portfolio, Starter]
css: Tailwind
githubUrl: https://github.com/diklein/platinumstarter
demoUrl: https://platinumstarter.vercel.app
deployUrl: https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdiklein%2Fplatinumstarter&project-name=my-site&repository-name=my-site&demo-title=Platinum&demo-description=A+personal+site+you+publish+to+with+a+git+push%3A+writing%2C+photos%2C+and+design+work.&demo-url=https%3A%2F%2Fplatinumstarter.vercel.app&demo-image=https%3A%2F%2Fplatinumstarter.vercel.app%2Fog%3Ftitle%3DPlatinum
relatedTemplates: []
---

# Platinum

Platinum is a personal site you manage with AI. It supports writing, photography, and design
work using Next.js and Markdown. The best part? You can configure it through chat.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdiklein%2Fplatinumstarter&project-name=my-site&repository-name=my-site&demo-title=Platinum&demo-description=A+personal+site+you+publish+to+with+a+git+push%3A+writing%2C+photos%2C+and+design+work.&demo-url=https%3A%2F%2Fplatinumstarter.vercel.app&demo-image=https%3A%2F%2Fplatinumstarter.vercel.app%2Fog%3Ftitle%3DPlatinum)

## What you get

- **Writing.** Posts in Markdown with footnotes, code blocks, captions, video, and slideshows. Date a post in the future and it publishes itself that day.
- **Photos.** Use a folder of photos in the repo or automatically sync from Unsplash, Glass, Pixelfed, Immich, or PhotoPrism. Camera data and alt text come along. The result is a gorgeous grid and a precisely tuned lightbox.
- **Designs.** Tell your story with before and after comparisons and videos. For sensitive work enable password protection.
- **Personal sections.** Enable books and podcasts pages to share your favorites.
- **Writing help.** Scripts draft your alt text and SEO descriptions, and review a post before you publish it. They use Claude, OpenAI, or any model through Vercel AI Gateway.
- **Your agent.** Seven skills ship with Platinum for Claude Code, Codex, Cursor, and Gemini CLI to use. Every page is served as Markdown too so your agent can read it.

## Three ways in

1. **Deploy button.** The button above creates a repository in your GitHub account and a live site on Vercel. The live site shows a "not set up yet" page until you finish setup. On your computer, with Node 24 installed:

   ```sh
   git clone <your new repository> my-site && cd my-site
   npm ci
   npm run dev
   ```

   Open `http://localhost:3000`, then in a second terminal in the same folder start Claude Code and say `set up my site`. Your first push replaces the "not set up yet" page with your site.

2. **GitHub template.** Use this template, clone it, `npm ci`, `npm run dev`.

3. **Clone.**

   ```sh
   git clone https://github.com/diklein/platinumstarter my-site && cd my-site
   npm ci
   npm run dev
   ```

## Setting up

Open the folder in Claude Code and say:

```
set up my site
```

The `setup` skill asks one question at a time and writes `site.config.ts`:

1. Your name.
2. The shape: Writer, Photographer, Designer, or Everything.
3. A brand color and a mark.
4. A first post or an import of your existing blog.
5. The repository and the Vercel project, through your own `gh` and `vercel` logins.

From then on, "publish" is the word. The `publish` skill checks the post, commits, pushes, and tells you the live URL once the deploy lands. The same flow exists as a wizard at `/settings?setup=1` in development.

Bringing a blog over: WordPress, Ghost, Substack, Medium, a folder of Markdown, or any RSS or Atom feed. Say "import my blog" or see `docs/import.md`. `npm run clear-examples` removes the demo content. `npm run export` writes every post, case study, and photo as a folder of Markdown with the images beside it, so leaving is as easy as arriving.

## A custom domain

The site's URL follows the Vercel project: the `.vercel.app` address first, and a custom domain the moment one is attached, with no config to change. Add the domain in the Vercel dashboard under the project's Domains tab, or from the terminal:

```sh
npx vercel domains add yourname.com
```

Vercel prints the DNS record to create at your registrar. Once it resolves, the next deploy's metadata, feeds, and social cards carry the domain. Set `identity.url` in `site.config.ts` only to pin a different host or when hosting somewhere other than Vercel.

## Keys

None are required. The site builds and runs with no environment variables. Add a key only for a feature you use, in `.env.local` locally and with `npx vercel env add` for deployments. `.env.local.example` lists every one and where it comes from, and the `/settings` page in development has a test button for each.

## What is in the repository

The Next.js app, plus:

- `AGENTS.md`, the instructions every agent reads.
- `.claude/skills/`, the seven skills.
- `docs/`, the conventions and recipes.
- `scripts/`, the checks and the writing-help scripts.
- `.obsidian/` and `Templates/`. The repository is also an Obsidian vault: open the folder in Obsidian and a new note lands in the drafts folder with the post frontmatter filled in.

## The stack

Next.js 16 (App Router) · MDX · Tailwind v4 · shadcn/ui · Motion · Geist · Vercel. The full
rationale is in `docs/tech-stack.md`; the conventions the build enforces are in
`docs/conventions.md`; the module boundary is in `docs/modules.md`.

## Commands

```sh
npm run dev              # localhost:3000
npm run check            # every convention check
npm run validate-mdx     # compile every post
npm run build            # the prebuild checks, then next build
npm run new-post         # scaffold a post
npm run clear-examples   # remove the demo content (--dry-run first)
npm run export           # your content as a folder of Markdown, images beside it
npm run hooks:install    # the pre-commit secret scan, once per clone
```

## License

MIT.
