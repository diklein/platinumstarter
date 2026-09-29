# Technology Stack (research)

Stack research produced during project setup (moved out of CLAUDE.md 2026-08-23).
The living summary lives in CLAUDE.md; this file keeps the full rationale, alternatives, confidence table, and sources.

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 16.x (App Router) | Full-stack React framework | Official Vercel target; Turbopack, React 19.2, View Transitions, and Cache Components are production-stable. Already on 16 — do not downgrade. |
| React | 19.x | UI runtime | Required by Next.js 16; concurrent features, `use` hook, and improved Server Component DX |
| TypeScript | 5.x | Type safety | Required for typed MDX frontmatter, component props, and AI SDK patterns |
### MDX Content Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@next/mdx` | latest | MDX compilation | Official Next.js integration; MDX files compile as RSCs — zero client JS for content, full Server Component tree |
| `@mdx-js/loader` | latest | Webpack MDX loader | Required peer dep of `@next/mdx` |
| `@mdx-js/react` | latest | React MDX context | Required peer dep |
| `@types/mdx` | latest | TypeScript types | Type support for MDX imports |
| `gray-matter` | 4.x | Frontmatter parsing | `@next/mdx` does not parse frontmatter natively; `gray-matter` reads YAML frontmatter from `.mdx` files in a Node-side build step |
| `remark-gfm` | 4.x | GitHub Flavored Markdown | Tables, strikethrough, task lists |
| `remark-toc` | 9.x | Table of contents generation | Auto-generates TOC for long articles |
| `rehype-slug` | 6.x | Heading IDs | Required for anchor links in TOC |
| `rehype-autolink-headings` | 7.x | Heading anchor links | Adds clickable `#` links to headings |
| `rehype-pretty-code` | 0.14.x | Syntax highlighting | Powered by Shiki; uses VS Code themes; no runtime JS; supports dark/light theme switching via `data-theme` attribute |
| `reading-time` | 1.5.x | Reading time estimate | Pure function — pass the raw markdown string, get back minutes |
| `globby` | 14.x | File globbing | Enumerate `.mdx` files in `content/` to build blog index pages; ESM-only, use `next.config.mjs` |
### UI Component System
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| shadcn/ui | latest (v4-era) | Component library | Copy-paste components; full ownership, no version lock-in; fully compatible with Tailwind v4 |
| Radix UI | (via shadcn) | Accessible primitives | shadcn/ui is built on Radix; handles dialog, dropdown, tooltip accessibility correctly |
| `next-themes` | 0.4.x | Dark/light mode | Standard pairing with shadcn/ui; `ThemeProvider` wraps the layout |
### CSS Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | **v4.x** (currently ~4.1) | Utility-first CSS | GA since January 22, 2025; production-stable |
| `@tailwindcss/typography` | latest | Prose styling for MDX | The `prose` classes style MDX-rendered HTML without manual element targeting |
| `@tailwindcss/vite` OR `postcss` | latest | Build integration | For Next.js use the PostCSS path (`@tailwindcss/postcss`); Turbopack support is available but verify plugin compatibility |
- No `tailwind.config.ts` — all config lives in `globals.css` via `@theme`
- `@tailwindcss/upgrade` codemod handles most migration automatically
- shadcn/ui CLI is v4-aware and generates correct CSS-first config
- Turbopack + remark/rehype plugins: pass plugin names as strings in `next.config.mjs` (functions can't cross the Rust boundary)
### Typography / Fonts
| Technology | Purpose | Strategy |
|------------|---------|---------|
| `next/font/google` — **Playfair Display** | Editorial serif for article body | Variable font via `next/font/google`; self-hosted by Vercel; zero layout shift (CLS = 0) because Next.js inlines the `@font-face` in the `<head>` before render |
| `next/font/google` — **Geist Sans** | UI sans-serif | Variable font; Vercel's own design system font; already in `next/font/google` as `Geist`; pairs cleanly with Playfair for the Steve Jobs Archive aesthetic |
| `next/font/google` — **Geist Mono** | Code blocks | Monospace; consistent with Geist Sans family |
### Animation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `motion` | 12.x | UI animations (Emil Kowalski patterns) | The package formerly known as `framer-motion` rebranded to `motion` in late 2024; import from `motion/react` |
### OG Image Generation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `next/og` (ships with Next.js) | bundled | Dynamic social card images | No separate install needed in App Router; import `ImageResponse` from `next/og` |
- Only `display: flex` (no grid, no CSS Grid, no float)
- Only `ttf`, `otf`, and `woff` fonts — load custom fonts via `fetch()` inside the route handler and pass in the `fonts` option
- 500KB bundle size limit per route — keep JSX simple, fetch the font subset needed, avoid large embedded images
- Use Tailwind CSS experimental support (`tw` prop) inside `ImageResponse` JSX — pass `tw="..."` instead of `style` for Tailwind utility classes
### AI Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel AI SDK (`ai`) | 5.x (latest stable) | Orchestration layer for all AI calls | Provider-agnostic; handles streaming, retries, token counting; official Vercel product with Next.js integration |
| `@ai-sdk/anthropic` | latest | Claude text generation, vision | Alt text generation, pre-publish review, social draft writing |
| `@ai-sdk/voyage` (community provider) | latest | Text embeddings for semantic search | Anthropic **does not offer an embedding model** — Anthropic officially recommends Voyage AI for embeddings when using Claude |
| `voyageai` (official Voyage SDK) | latest | Alternative direct Voyage access | Use if the community AI SDK provider is insufficient |
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Neon Serverless Postgres | latest | Primary database + vector store | Vercel Postgres was migrated to Neon in Q4 2024–Q1 2025; Neon is now the official Vercel-integrated Postgres |
| pgvector | 0.8.x | Vector similarity search | Ships as a Neon extension; `CREATE EXTENSION vector` — no separate infrastructure |
| Drizzle ORM | 0.40.x | Type-safe SQL queries | Better TypeScript DX than Prisma for this use case; Neon + Drizzle is the documented first-party path; supports `cosineDistance` for vector queries |
| `@neondatabase/serverless` | latest | Neon database driver | Replaces `@vercel/postgres` (which is now in maintenance mode); actively developed; identical API surface |
### Analytics & Observability
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@vercel/analytics` | latest | Page view analytics | First-party Vercel product; no cookie banner required; integrates with Vercel dashboard |
| `@vercel/speed-insights` | latest | Core Web Vitals field data | Real-user CWV data from Vercel's edge; pairs with Lighthouse CI for lab data |
### Performance / CI
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@lhci/cli` | 0.15.x | Lighthouse CI runner | GoogleChrome/lighthouse-ci; LHCI 0.15 ships Lighthouse 12.6; ~2M monthly downloads; well-maintained |
| `lighthouse-ci-action` (GitHub Marketplace) | 3.x | GitHub Actions integration | Simplest path: uses `treosh/lighthouse-ci-action`; handles Chrome and LHCI install automatically |
# .github/workflows/lighthouse.yml
- uses: actions/checkout@v4
- uses: treosh/lighthouse-ci-action@v12
### Image Optimization
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `next/image` | (bundled) | All image rendering | Required for LCP, WebP/AVIF format negotiation, lazy loading, and no-raw-`<img>` constraint |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MDX layer | `@next/mdx` | `next-mdx-remote` | Remote MDX is designed for CMS-hosted content; adds serialize/hydrate roundtrip for no gain with local files; RSC support marked unstable |
| MDX layer | `@next/mdx` | Contentlayer2 | Community fork of an abandoned project; no governance; not worth the bet on a long-lived site |
| MDX layer | `@next/mdx` | fumadocs-mdx | Documentation site framework; opinionated navigation system is unnecessary overhead for a blog |
| CSS framework | Tailwind v4 | Tailwind v3 | v4 is stable GA; v3 enters maintenance mode; new projects should use v4 |
| Animation | `motion` | `framer-motion` | `framer-motion` is now `motion`; `framer-motion` is no longer actively developed |
| Database | Neon | Supabase | Both are valid; Neon is the first-party Vercel Marketplace integration (unified billing, Preview DB branching); Supabase requires a separate account and billing relationship |
| Database | Neon | PlanetScale | PlanetScale is MySQL, not Postgres; pgvector requires Postgres |
| Embeddings | Voyage AI | OpenAI `text-embedding-*` | Anthropic officially recommends Voyage AI alongside Claude; Voyage AI is now owned by Anthropic; consistent vendor relationship |
| Embeddings | Voyage AI | Native Claude embeddings | Anthropic does not offer an embedding model — this is not an option |
| OG images | `next/og` | Puppeteer/headless | 50-100x slower; requires a full browser runtime; defeats edge caching; wrong tool entirely |
| Fonts | `next/font/google` | CSS `@import` | `@import` blocks rendering; `next/font` self-hosts, preloads, and eliminates FOUT/FOIT |
## Installation
# Core dependencies
# MDX
# shadcn/ui (initialize with CLI — do not install manually)
# Tailwind typography plugin
# Fonts (via next/font/google — no npm install needed)
# Animation
# AI layer
# Database
# Analytics
# next-themes for dark mode
# Lighthouse CI (dev / CI only)
## Confidence Assessment
| Area | Confidence | Source |
|------|------------|--------|
| `@next/mdx` as MDX choice | HIGH | Official Next.js docs (v16.2.6, updated 2026-05-13) confirmed via WebFetch |
| Tailwind v4 production-ready | HIGH | GA announced Jan 22, 2025; official tailwindcss.com blog |
| `motion` package rename | HIGH | motion.dev official site + multiple corroborating sources |
| Vercel Postgres → Neon migration | HIGH | Neon official transition guide confirmed via WebFetch |
| Anthropic has no embedding model | HIGH | Confirmed on platform.claude.com/docs official Anthropic docs |
| Voyage AI for embeddings | HIGH | Anthropic's own embedding guide recommends Voyage AI |
| `@ai-sdk/voyage` as AI SDK provider | MEDIUM | Community provider (not official Vercel); Context7 has docs for it; verify version before use |
| shadcn/ui v4 CSS variable gotchas | HIGH | Official shadcn/ui Tailwind v4 docs + corroborating community sources |
| LHCI 0.15.x with Lighthouse 12 | HIGH | GoogleChrome/lighthouse-ci GitHub; verified via web search |
| OG image `next/og` current API | HIGH | Official Vercel docs (updated 2026-02-17) confirmed via WebFetch |
| Neon pgvector HNSW indexing | HIGH | Neon official docs + Drizzle ORM docs |
## Known Gaps / Phase-Specific Research Needed
## Sources
- Next.js MDX guide (official, v16.2.6): https://nextjs.org/docs/app/guides/mdx
- Tailwind CSS v4.0 release: https://tailwindcss.com/blog/tailwindcss-v4
- shadcn/ui Tailwind v4 docs: https://ui.shadcn.com/docs/tailwind-v4
- motion.dev official site: https://motion.dev
- framer-motion → motion rename: https://fireup.pro/news/framer-motion-becomes-independent-introducing-motion
- Vercel OG image generation (official, updated 2026-02-17): https://vercel.com/docs/og-image-generation
- Anthropic embeddings guide (confirms no Claude embedding model): https://platform.claude.com/docs/en/build-with-claude/embeddings
- AI SDK Voyage provider docs: https://ai-sdk.dev/providers/ai-sdk-providers/27-voyage (via Context7)
- Neon Vercel Postgres transition guide: https://neon.com/docs/guides/vercel-postgres-transition-guide
- Drizzle ORM pgvector guide: https://orm.drizzle.team/docs/guides/vector-similarity-search
- LHCI GitHub: https://github.com/GoogleChrome/lighthouse-ci
- Lighthouse CI Action (GitHub Marketplace): https://github.com/marketplace/actions/lighthouse-ci-action
- Next.js image optimization docs: https://nextjs.org/docs/app/api-reference/components/image
- rehype-pretty-code: https://rehype-pretty.pages.dev
<!-- GSD:stack-end -->
