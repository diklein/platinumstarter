/**
 * The resolved site configuration + derived helpers.
 *
 * Import `site` (and the helpers) from here, never from the root `site.config.ts` directly, so
 * the defaults are always merged in. See site-config-schema.ts for the contract and the rules.
 */
import config from '../../site.config'
import { MODULE_META, SOCIAL_NETWORKS, SOCIAL_URL } from './site-config-schema'
import type { ModuleId, SiteConfig, SocialNetwork } from './site-config-schema'

export * from './site-config-schema'

export const site: SiteConfig = config

/** Canonical origin. next.config.mjs resolves it once at build time (NEXT_PUBLIC_SITE_URL, then
 *  identity.url, then the Vercel production domain, then localhost) and inlines it here for the
 *  server and the browser alike; the chain is repeated for code that imports this file outside
 *  a Next build (scripts, tests). */
export const siteUrl: string = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  site.identity.url ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
).replace(/\/$/, '')

/** Absolute URL for a site-relative path. Absolute inputs pass through. */
export function absoluteUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function moduleEnabled(id: ModuleId): boolean {
  const value = site.modules[id]
  return value !== false && value !== undefined
}

/**
 * Whether /lab is reachable in a deployment environment. `env` is VERCEL_ENV on the server
 * (the proxy gate) or NEXT_PUBLIC_VERCEL_ENV in the browser (the palette row); both are
 * undefined in local dev. Production never sees the lab; gate 'dev' hides it from previews too.
 */
export function labReachable(env: string | undefined): boolean {
  const lab = site.modules.lab
  if (!lab) return false
  if (env === 'production') return false
  if (lab.gate === 'dev') return !env || env === 'development'
  return true
}

/** The social row: only filled networks, in the configured order, handle + resolved URL. */
export function socialLinks(): Array<{ network: SocialNetwork; handle: string; href: string }> {
  const order = site.social.order ?? SOCIAL_NETWORKS
  const seen = new Set<SocialNetwork>()
  const out: Array<{ network: SocialNetwork; handle: string; href: string }> = []
  for (const network of [...order, ...SOCIAL_NETWORKS]) {
    if (seen.has(network)) continue
    seen.add(network)
    const raw = site.social[network]
    if (!raw) continue
    const href = /^https?:\/\//.test(raw) ? raw : SOCIAL_URL[network](raw.replace(/^@/, ''))
    const handle = raw.startsWith('http') ? raw.replace(/^https?:\/\/[^/]+\/(?:in\/|profile\/)?/, '') : raw
    out.push({ network, handle, href })
  }
  return out
}

/** The Setup page (/setup, the first-run guide) exists while `setup.completed` is false, in
 *  development and preview and on a production deployment that keeps the demo (PLATINUM_DEMO).
 *  A production site that is not set up rewrites every page to /setup-needed anyway. Decided
 *  at build time; the push that completes setup removes the page and its nav entry. */
export function setupPageVisible(): boolean {
  if (site.setup.completed !== false) return false
  return process.env.VERCEL_ENV !== 'production' || Boolean(process.env.PLATINUM_DEMO)
}

/** Resolved nav: module ids become links, disabled modules drop out, 'setup' rides only while
 *  the Setup page exists. */
export function navLinks(): Array<{ href: string; label: string }> {
  const out: Array<{ href: string; label: string }> = []
  for (const entry of site.nav) {
    if (typeof entry === 'object') { out.push(entry); continue }
    if (entry === 'setup') { if (setupPageVisible()) out.push({ href: '/setup', label: 'Setup' }); continue }
    if (entry === 'writing') { out.push({ href: '/writing', label: 'Writing' }); continue }
    if (entry === 'about') { out.push({ href: '/about', label: 'About' }); continue }
    if (!moduleEnabled(entry)) continue
    const { href, label } = MODULE_META[entry]
    out.push({ href, label })
  }
  return out
}
