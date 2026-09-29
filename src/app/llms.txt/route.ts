import { site, absoluteUrl, navLinks } from '@/lib/site-config'
import { getSearchIndex } from '@/lib/search-index'
import { SOCIAL_LINKS } from '@/components/social-icons'

// /llms.txt, generated from site.config.ts: the name and description, the navigation's
// sections (each with the same one-line description the search index carries for that
// page), the contact directory, and the feed. Static: it only reads repo files.
export const dynamic = 'force-static'

export function GET() {
  const { name, tagline, description, email } = site.identity
  const pages = getSearchIndex()

  const sections = navLinks().map(({ href, label }) => {
    const blurb = pages.find((p) => p.kind === 'Page' && p.href === href)?.description
    return `- [${label}](${absoluteUrl(href)})${blurb ? `: ${blurb}` : ''}`
  })

  const contact = [
    ...(email ? [`- Email: ${email}`] : []),
    ...SOCIAL_LINKS.filter((l) => !l.href.startsWith('/')).map((l) => `- ${l.label}: ${l.handle} (${l.href})`),
  ]

  const parts = [
    `# ${name}`,
    '',
    `> ${tagline}`,
    '',
    ...(description !== tagline ? [description, ''] : []),
    '## Site sections',
    '',
    ...sections,
  ]
  if (contact.length > 0) parts.push('', '## Contact', '', ...contact)
  if (site.publishing.rss) parts.push('', '## RSS', '', absoluteUrl('/feed.xml'))

  return new Response(parts.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
