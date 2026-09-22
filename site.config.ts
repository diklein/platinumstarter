import { defineConfig } from './src/lib/site-config-schema.ts'

/**
 * Your site, in one file.
 *
 * Edit this by hand, through the dev-only /settings page, or by telling Claude Code what you
 * want ("set my name to…", "turn the photos section off"). All three write here. Every field
 * is optional; see src/lib/site-config-schema.ts for what each one does and what it defaults to.
 * Secrets never go here: API keys live in .env.local (see Connections in /settings).
 *
 * Untouched, this file renders the Platinum demo: the template introducing itself. The first
 * thing to change is `identity`; the example posts explain the rest.
 */
export default defineConfig({
  identity: {
    tagline: 'Welcome to Platinum.',
    description: 'A personal site you manage with AI. Writing, photos, and design work, set up and published in conversation with an agent, from one repository.',
    intro: 'Platinum is a kit for a writing, photography, and portfolio site you manage with AI. Skills for setup, posts, and publishing ship with it.',
  },

  footer: {
    byline: 'Built with Platinum',
    bylineHref: 'https://vercel.com/templates/next.js/platinum',
  },
})
