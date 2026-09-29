/**
 * remark-self-links
 *
 * Rewrites absolute links to THIS site into site-relative hrefs at compile time:
 * `https://example.com/writing/foo` becomes `/writing/foo`, `https://example.com` becomes
 * `/`. Migrated posts author self-links with the full domain (~22 of them), and two things
 * want them relative: the branded self-link treatment in globals.css matches
 * `a[href^="/"]` (a stylesheet cannot read site.config.ts, so it cannot match the domain),
 * and a relative link keeps a reader on whatever origin they are reading (a preview
 * deployment, a local build) instead of bouncing them to production.
 *
 * Registered in next.config.mjs as `[path, { origins }]`: Turbopack loads remark plugins
 * by path string (functions cannot cross the Rust boundary), and the origins come from
 * site.config.ts, which next.config.mjs imports. Only `link` and `definition` nodes are
 * touched; images and raw JSX are left alone.
 */

import { visit } from 'unist-util-visit'

/**
 * @param {{ origins?: string[] }} [options] Origins to treat as "this site", no trailing
 *   slash. Defaults to NEXT_PUBLIC_SITE_URL when nothing is passed.
 */
export default function remarkSelfLinks(options = {}) {
  const origins = (options.origins ?? [process.env.NEXT_PUBLIC_SITE_URL])
    .filter((o) => typeof o === 'string' && o.length > 0)
    .map((o) => o.replace(/\/$/, ''))

  return function transformer(tree) {
    if (origins.length === 0) return
    visit(tree, ['link', 'definition'], (node) => {
      const url = node.url
      if (typeof url !== 'string') return
      for (const origin of origins) {
        if (url === origin) {
          node.url = '/'
          return
        }
        // Only a real path boundary counts: `https://example.community` is not this site.
        if (url.startsWith(origin) && /^[/?#]/.test(url.slice(origin.length))) {
          const rest = url.slice(origin.length)
          node.url = rest.startsWith('/') ? rest : `/${rest}`
          return
        }
      }
    })
  }
}
