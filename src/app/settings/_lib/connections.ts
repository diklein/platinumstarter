/**
 * The Connections section: one status card per environment variable the codebase reads.
 * Presence is checked server-side and only a boolean crosses to the client; the value never
 * does. The "unlocks" lists are hand-written from a grep of every process.env read
 * (src/**, scripts/**), so they describe what the code actually does with the key.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '@/lib/site-config-writer'

export type Connection = {
  /** qa/smoke/<id>.mjs, when the private QA tree is present. */
  id: string
  name: string
  env: string
  /** Where the key comes from. */
  docs: string
  /** What having the key turns on, in the words of the code that reads it. */
  unlocks: string[]
}

export const CONNECTIONS: Connection[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    env: 'ANTHROPIC_API_KEY',
    docs: 'https://platform.claude.com/settings/keys',
    unlocks: [
      'AI alt text for article images (scripts/generate-alt-text.mjs) and Unsplash photos (scripts/generate-unsplash-alt-text.mjs)',
      'SEO descriptions for posts (scripts/generate-seo.mjs)',
      'The default provider: intelligence.provider = anthropic',
      'Using Claude Code? This is the key you already have',
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    env: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/api-keys',
    unlocks: ['The same four AI scripts when intelligence.provider = openai', 'Using Codex? This is the key you already have; set intelligence.provider to openai'],
  },
  {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    env: 'AI_GATEWAY_API_KEY',
    docs: 'https://vercel.com/docs/ai-gateway/authentication',
    unlocks: ['The same four AI scripts when intelligence.provider = gateway (any model behind one key)', 'Using Gemini CLI, Grok, or another model? The gateway reaches all of them, and your Vercel account already has it with monthly credit'],
  },
  {
    id: 'neon',
    name: 'Neon Postgres',
    env: 'DATABASE_URL',
    docs: 'https://console.neon.tech',
    unlocks: ['Like buttons on posts (/api/likes, publishing.likes)', 'Run npm run db:push once after adding it'],
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    env: 'UNSPLASH_ACCESS_KEY',
    docs: 'https://unsplash.com/developers',
    unlocks: ['Syncing your Unsplash uploads into /photos (scripts/fetch-unsplash-photos.mjs, needs social.unsplash)'],
  },
  {
    id: 'buttondown',
    name: 'Buttondown',
    env: 'BUTTONDOWN_API_KEY',
    docs: 'https://buttondown.com/requests',
    unlocks: ['Newsletter drafts from new posts (scripts/create-newsletter-drafts.mjs)'],
  },
  {
    id: 'resend',
    name: 'Resend',
    env: 'RESEND_API_KEY',
    docs: 'https://resend.com/api-keys',
    unlocks: ['An email to identity.email when a post is liked (/api/likes; RESEND_FROM sets the sender)'],
  },
  {
    id: 'github',
    name: 'GitHub',
    env: 'GITHUB_TOKEN',
    docs: 'https://github.com/settings/tokens',
    unlocks: ['The contribution calendar on /about and the home calendar cell (src/lib/github.ts, needs social.github)'],
  },
]

export type ConnectionStatus = Connection & {
  present: boolean
  /** True when qa/smoke/<id>.mjs exists in this checkout (the private QA tree). */
  testable: boolean
}

export function smokePath(id: string): string {
  return join(ROOT, 'qa', 'smoke', `${id}.mjs`)
}

export function connectionStatuses(): ConnectionStatus[] {
  return CONNECTIONS.map((c) => ({
    ...c,
    present: Boolean(process.env[c.env]?.trim()),
    testable: existsSync(smokePath(c.id)),
  }))
}
