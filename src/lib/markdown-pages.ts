import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getAllPosts, getPostsByHashtag, formatDate, type Post } from './posts'
import { DESIGNS, PATENTS } from './designs'
import { getSearchIndex } from './search-index'
import { moduleEnabled, navLinks } from './site-config'
import { site, siteUrl } from './site-config'
import { SITE as SEO } from './seo'
import { SOCIAL_LINKS } from '@/components/social-icons'

/**
 * Markdown renditions of the site's pages, served by /api/md (which the proxy
 * reaches via `.md` URL suffixes and `Accept: text/markdown` negotiation).
 *
 * MDX-backed content (writing posts, design case studies) is the
 * actual source converted to clean markdown — imports/JSX stripped, the
 * meaningful props of known components (ProductCard, DesignDetails, videos,
 * slideshows) kept as markdown, everything else dropped with a placeholder.
 * Structured pages are generated from the same data modules the pages render
 * from. Deep interactive pages fall back to a short summary + canonical link.
 */

// The canonical origin from site.config.ts; every link in the markdown is absolute so the
// text stands on its own outside the site.
const SITE = siteUrl

export interface MarkdownResult {
  body: string
  status: 200 | 404
}

/* ------------------------------------------------------------------ */
/* MDX → markdown                                                      */
/* ------------------------------------------------------------------ */

function parseProps(tag: string): Record<string, string> {
  const props: Record<string, string> = {}
  const re = /([A-Za-z]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag)) !== null) props[m[1]] = m[2]
  return props
}

function absolutize(url: string): string {
  if (url.startsWith('/')) return `${SITE}${url}`
  const i = url.indexOf('/public/')
  if (i !== -1) return `${SITE}${url.slice(i + '/public'.length)}`
  return url
}

const OMITTED = '*[Interactive component omitted — view this page on the website.]*'

export function mdxToMarkdown(content: string): string {
  let md = content
    // MDX comments hide content from the rendered page; hide it here too.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^import\s.+$/gm, '')
    .replace(/^export\s.+$/gm, '')

  // <ProductCard title description href image retired label /> → linked bold line + blurb.
  md = md.replace(/<ProductCard\b[\s\S]*?\/>/g, (tag) => {
    const p = parseProps(tag)
    if (!p.title) return OMITTED
    const name = p.href ? `[${p.title}](${p.href})` : p.title
    const retired = /\bretired\b/.test(tag) ? ' *(retired)*' : ''
    const desc = p.description ? `\n> ${p.description}` : ''
    return `> **${name}**${retired}${desc}`
  })

  // <DesignDetails role team org company year /> → italic metadata line.
  md = md.replace(/<DesignDetails\b[\s\S]*?\/>/g, (tag) => {
    const p = parseProps(tag)
    const parts = [
      p.role && `Role: ${p.role}`,
      p.team && `Team: ${p.team}`,
      p.org && `Org: ${p.org}`,
      p.company && `Company: ${p.company}`,
      p.year && `Year: ${p.year}`,
    ].filter(Boolean)
    return parts.length ? `*${parts.join(' · ')}*` : ''
  })

  // <Slideshow images={[{ src, alt, caption, … }, …]} /> → one image line per slide.
  md = md.replace(/<Slideshow\b[\s\S]*?\/>/g, (tag) => {
    const slides: string[] = []
    const re = /src:\s*"([^"]+)"\s*,\s*alt:\s*"([^"]*)"(?:\s*,\s*caption:\s*"([^"]*)")?/g
    let m: RegExpExecArray | null
    while ((m = re.exec(tag)) !== null) {
      const caption = m[3] ? ` *${m[3]}*` : ''
      slides.push(`![${m[2]}](${absolutize(m[1])})${caption}`)
    }
    return slides.length ? slides.join('\n\n') : OMITTED
  })

  // Video-ish components → a labelled link to the video file.
  md = md.replace(/<(?:Video|GifVideo|BezelVideo|PortraitVideo)\b[\s\S]*?\/>/g, (tag) => {
    const p = parseProps(tag)
    if (!p.src) return OMITTED
    return `*Video: [${p.alt ?? path.basename(p.src)}](${absolutize(p.src)})*`
  })

  // Bezel-framed images → plain images.
  md = md.replace(/<BezelImage\b[\s\S]*?\/>/g, (tag) => {
    const p = parseProps(tag)
    return p.src ? `![${p.alt ?? ''}](${absolutize(p.src)})` : OMITTED
  })

  // <TlDr>…</TlDr> → a TL;DR block; keep the children.
  md = md.replace(/<TlDr\b[^>]*>/g, '**TL;DR**\n').replace(/<\/TlDr>/g, '')

  // <AppList label="…"> groups of <App>children</App> → bold label + list items.
  md = md
    .replace(/<AppList\b[^>]*>/g, (tag) => {
      const p = parseProps(tag)
      return p.label ? `**${p.label}**\n` : ''
    })
    .replace(/<\/AppList>/g, '')
    .replace(/<App\b[^>]*>\s*/g, '- ')
    .replace(/\s*<\/App>/g, '')

  // Anything still JSX (interactive demos, one-off diagrams) → placeholder.
  md = md
    .replace(/<([A-Z][A-Za-z]*)\b[\s\S]*?<\/\1>/g, OMITTED)
    .replace(/<[A-Z][A-Za-z]*\b[\s\S]*?\/>/g, OMITTED)

  // Repo-relative and root-relative asset/page URLs → absolute, so the markdown
  // works from anywhere.
  md = md.replace(/\]\((\.\.\/)+public\//g, `](${SITE}/`).replace(/\]\(\//g, `](${SITE}/`)

  return md.replace(/\n{3,}/g, '\n\n').trim()
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function header(title: string, metaLine?: string, description?: string): string {
  let out = `# ${title}\n`
  if (metaLine) out += `\n*${metaLine}*\n`
  if (description) out += `\n> ${description}\n`
  return out
}

function canonicalFooter(pagePath: string): string {
  return `\n\n---\n\n*Markdown version of [${SITE}${pagePath}](${SITE}${pagePath}). Append \`.md\` to any page URL on this site (or request it with \`Accept: text/markdown\`) for a markdown version.*\n`
}

/** The About page's "On the web" directory: the email (when configured) and the same
 *  resolved social row the footer draws, one line each. Site-relative entries (the RSS
 *  feed) print as a bare absolute URL, profiles as a linked handle. */
function onTheWeb(): string {
  const lines = SOCIAL_LINKS.map(({ label, href, handle }) =>
    href.startsWith('/') ? `- ${label}: ${SITE}${href}` : `- ${label}: [${handle}](${href})`,
  )
  if (site.identity.email) lines.unshift(`- Email: ${site.identity.email}`)
  return lines.join('\n')
}

function postLine(p: Post): string {
  const label = p.title ?? (p.excerpt ? `${p.type}: ${p.excerpt}` : `${p.type} post`)
  return `- ${formatDate(p.date)} — [${label}](${SITE}/writing/${p.slug})`
}

/* ------------------------------------------------------------------ */
/* Page builders                                                       */
/* ------------------------------------------------------------------ */

function homeMarkdown(): string {
  const recent = getAllPosts().slice(0, 10)
  // The navigation from site.config.ts, each entry with the one-line description the search
  // index carries for that page (the same pairing /llms.txt prints).
  const pages = getSearchIndex()
  const sections = navLinks().map(({ href, label }) => {
    const blurb = pages.find((p) => p.kind === 'Page' && p.href === href)?.description
    return `- [${label}](${SITE}${href})${blurb ? ` — ${blurb}` : ''}`
  })
  return [
    header(site.identity.name, undefined, SEO.description),
    '## Site sections\n',
    sections.join('\n'),
    '\n## Recent writing\n',
    recent.map(postLine).join('\n'),
    canonicalFooter('/'),
  ].join('\n')
}

function writingIndexMarkdown(): string {
  const posts = getAllPosts()
  return [
    header('Writing', `${posts.length} posts`, site.writing.description),
    `Subscribe via [RSS](${SITE}/feed.xml).\n`,
    posts.map(postLine).join('\n'),
    canonicalFooter('/writing'),
  ].join('\n')
}

function archiveMarkdown(): string {
  const posts = getAllPosts().filter((p) => p.type !== 'note')
  const earliest = posts[posts.length - 1]?.date.slice(0, 4) ?? ''
  return [
    header('Archive', `${posts.length} posts since ${earliest}`),
    posts.map(postLine).join('\n'),
    canonicalFooter('/archive'),
  ].join('\n')
}

function findPostFile(slug: string): string | null {
  const base = path.join(process.cwd(), 'src/content/writing')
  const direct = path.join(base, `${slug}.mdx`)
  if (fs.existsSync(direct)) return direct
  if (process.env.NODE_ENV !== 'production') {
    const draft = path.join(base, 'drafts', `${slug}.mdx`)
    if (fs.existsSync(draft)) return draft
  }
  return null
}

function writingPostMarkdown(slug: string): string | null {
  // Validate against the known post list before touching the filesystem.
  const post = getAllPosts().find((p) => p.slug === slug)
  if (!post) return null
  const file = findPostFile(slug)
  if (!file) return null
  const { content } = matter(fs.readFileSync(file, 'utf-8'))
  const meta = [formatDate(post.date), post.type !== 'article' && post.type, post.tags?.length && post.tags.map((t) => `#${t}`).join(' ')]
    .filter(Boolean)
    .join(' · ')
  return [
    header(post.title ?? formatDate(post.date), meta, post.description),
    mdxToMarkdown(content),
    canonicalFooter(`/writing/${slug}`),
  ].join('\n')
}

function designsIndexMarkdown(): string {
  const list = DESIGNS.map(
    (d) =>
      `## [${d.title}](${SITE}/designs/${d.slug})\n\n*${d.year} · ${d.role} · ${d.company}${d.passwordProtected ? ' · password-protected' : ''}*\n\n${d.description}`
  ).join('\n\n')
  const patents = PATENTS.map((p) => `- ${p.num} — ${p.title}`).join('\n')
  return [
    header('Designs', undefined, 'Selected design work and case studies.'),
    list,
    '\n## Patents\n',
    patents,
    canonicalFooter('/designs'),
  ].join('\n')
}

function designMarkdown(slug: string): string | null {
  const design = DESIGNS.find((d) => d.slug === slug)
  if (!design) return null
  const meta = `${design.year} · ${design.role} · ${design.company}`
  if (design.passwordProtected) {
    return [
      header(design.title, meta, design.description),
      `This case study is password-protected. View it at [${SITE}/designs/${slug}](${SITE}/designs/${slug}).`,
      canonicalFooter(`/designs/${slug}`),
    ].join('\n')
  }
  const file = path.join(process.cwd(), 'src/content/designs', `${slug}.mdx`)
  if (!fs.existsSync(file)) return null
  const { content } = matter(fs.readFileSync(file, 'utf-8'))
  return [header(design.title, meta, design.description), mdxToMarkdown(content), canonicalFooter(`/designs/${slug}`)].join('\n')
}

function hashtagMarkdown(tag: string): string | null {
  const posts = getPostsByHashtag(tag.toLowerCase())
  if (posts.length === 0) return null
  return [
    header(`#${tag.toLowerCase()}`, `${posts.length} post${posts.length === 1 ? '' : 's'}`),
    posts.map(postLine).join('\n'),
    canonicalFooter(`/hashtags/${tag.toLowerCase()}`),
  ].join('\n')
}

// /about renders src/content/about.mdx (the same file the page compiles), so this is that
// source as markdown plus the two directory sections the page builds from site.config.ts.
// The cards the prose can seat (<PhotoCollageCard />, <GitHubCalendar />) are pictures with
// no markdown rendition, so they are dropped rather than left as placeholders.
function aboutMarkdown(): string {
  const file = path.join(process.cwd(), 'src/content/about.mdx')
  const { data, content } = matter(fs.readFileSync(file, 'utf-8'))
  const description = typeof data.description === 'string' ? data.description : site.identity.description
  const prose = mdxToMarkdown(content.replace(/<(?:PhotoCollageCard|GitHubCalendar)\b[^>]*\/>/g, ''))
  const affiliate = site.publishing.amazonAffiliateTag
    ? `\n\n## Affiliate links\n\nSome product links on this site are Amazon affiliate links; purchases through them earn ${site.identity.name} a small commission.`
    : ''
  return [
    header('About', undefined, description),
    `${prose}

## On the web

${onTheWeb()}${affiliate}`,
    canonicalFooter('/about'),
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Fallback + 404                                                      */
/* ------------------------------------------------------------------ */

function fallbackSummaryMarkdown(pagePath: string): string | null {
  const page = getSearchIndex().find((item) => item.kind === 'Page' && item.href === pagePath)
  if (!page) return null
  return [
    header(page.title, undefined, page.description),
    `This page is interactive and is best experienced as HTML: [${SITE}${pagePath}](${SITE}${pagePath}).`,
    canonicalFooter(pagePath),
  ].join('\n')
}

function notFoundMarkdown(pagePath: string): string {
  return [
    '# 404 — Not found\n',
    `No page exists at \`${pagePath}\` on ${SITE}.\n`,
    'Markdown versions are available for every page by appending `.md` to its URL, for example:\n',
    [
      `- [${SITE}/writing.md](${SITE}/writing.md)`,
      `- [${SITE}/designs.md](${SITE}/designs.md)`,
      `- [${SITE}/about.md](${SITE}/about.md)`,
    ].join('\n'),
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function renderMarkdownForPath(rawPath: string): MarkdownResult {
  // Normalize: single leading slash, no trailing slash, no query/hash.
  let p = rawPath.split(/[?#]/)[0]
  if (!p.startsWith('/')) p = `/${p}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)

  const found = (body: string | null): MarkdownResult | null => (body ? { body, status: 200 } : null)

  let result: MarkdownResult | null = null
  const segments = p.split('/').slice(1)

  // Module pages render only while their module is on (a disabled module's URL 404s in HTML
  // land too); the checks mirror site.config.ts, not the folders on disk.
  if (p === '/') result = found(homeMarkdown())
  else if (p === '/about') result = found(aboutMarkdown())
  else if (p === '/writing') result = found(writingIndexMarkdown())
  else if (p === '/archive' && moduleEnabled('archive')) result = found(archiveMarkdown())
  else if (p === '/designs' && moduleEnabled('designs')) result = found(designsIndexMarkdown())
  else if (segments[0] === 'writing' && segments.length === 2) result = found(writingPostMarkdown(segments[1]))
  else if (segments[0] === 'designs' && segments.length === 2 && moduleEnabled('designs')) result = found(designMarkdown(segments[1]))
  else if (segments[0] === 'hashtags' && segments.length === 2 && moduleEnabled('hashtags')) result = found(hashtagMarkdown(decodeURIComponent(segments[1])))
  // Legacy root-level post slugs (/{slug} 308s to /writing/{slug} in HTML land).
  else if (segments.length === 1) result = found(writingPostMarkdown(segments[0]))

  // Any other real page gets a summary + canonical link instead of a 404.
  result ??= found(fallbackSummaryMarkdown(p))

  return result ?? { body: notFoundMarkdown(p), status: 404 }
}
