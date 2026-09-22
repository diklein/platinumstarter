import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Image from 'next/image'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import pkg from '../../../package.json'
import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import { JsonLd } from '@/components/seo/json-ld'
import { TableOfContents } from '@/components/blog/table-of-contents'
import { extractHeadings, type TocItem } from '@/lib/posts'
import { PhotoCollageCard } from '@/components/about/photo-collage-card'
import { GitHubCalendar } from '@/components/about/github-calendar'
import { SOCIAL_LINKS } from '@/components/social-icons'
import { site, siteUrl, absoluteUrl, socialLinks } from '@/lib/site-config'
import Content from '@/content/about.mdx'

/* The page is a shell; the words live in src/content/about.mdx (frontmatter `example: true`
   marks the template's own copy), compiled by @next/mdx as a Server Component exactly like the
   posts. The two cards the prose can seat (<PhotoCollageCard />, <GitHubCalendar />) are
   handed to it as components below; each self-disables without its data. Everything
   identity-shaped (the portrait, the Person schema, the "On the web" directory, the affiliate
   note) rebuilds from site.config.ts, so replacing one MDX file replaces the page. The
   markdown rendition (src/lib/markdown-pages.ts) reads the same file. */

const ABOUT_FILE = path.join(process.cwd(), 'src/content/about.mdx')

// The cards the MDX can seat land as direct children of the page grid, so they take the
// prose column here rather than asking the About copy to know the layout.
function SeatedPhotoCollageCard() {
  return <PhotoCollageCard className="col-prose mb-10" />
}
function SeatedGitHubCalendar() {
  return <GitHubCalendar className="col-prose mb-10" />
}

// Frontmatter + the h2s, read at build so the TOC can never drift from the headings
// (rehype-slug and extractHeadings share github-slugger, so the anchors match).
function readAbout() {
  const { data, content } = matter(fs.readFileSync(ABOUT_FILE, 'utf-8'))
  return {
    description: typeof data.description === 'string' ? data.description : site.identity.description,
    headings: extractHeadings(content).filter((h) => h.depth === 2),
  }
}

const about = readAbout()
const affiliate = site.publishing.amazonAffiliateTag

export const metadata = pageMetadata({
  title: 'About',
  description: about.description,
  path: '/about',
})

const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: site.identity.name,
  url: `${siteUrl}/about`,
  ...(site.identity.portrait ? { image: absoluteUrl(site.identity.portrait) } : {}),
  ...(site.identity.email ? { email: `mailto:${site.identity.email}` } : {}),
  ...(site.identity.location ? { homeLocation: { '@type': 'Place', name: site.identity.location } } : {}),
  sameAs: socialLinks().map((l) => l.href),
}

const TEXT_COL = 'col-prose'
// mt-40 + the article-flow zeroing (the PageShell below carries `article-flow`) = the same
// 160px section beat as articles; heading line-height 1.2, not the body's 1.6.
const H2 = `${TEXT_COL} font-sans font-medium text-h2 leading-[1.15] tracking-[-0.02em] text-foreground mt-40 mb-8`
const P = `${TEXT_COL} font-sans text-prose leading-prose tracking-[-0.01em] text-foreground mb-10`

const toc: TocItem[] = [
  ...about.headings,
  { depth: 2, text: 'Colophon', slug: 'colophon' },
  { depth: 2, text: 'On the web', slug: 'on-the-web' },
  ...(affiliate ? [{ depth: 2 as const, text: 'Affiliate links', slug: 'affiliate-links' }] : []),
]

// Each service mark at roughly 12px: SOCIAL_LINKS carries its optical size for a 20px box
// (social-icons.tsx), scaled here so the filled marks keep their parity with the stroked ones.
const directory = [
  ...(site.identity.email
    ? [{ label: 'Email', href: `mailto:${site.identity.email}`, handle: site.identity.email, icon: <Mail size={12} strokeWidth={2.25} aria-hidden="true" /> }]
    : []),
  ...SOCIAL_LINKS.map(({ label, href, handle, Icon, optical }) => ({
    label: label === 'RSS' ? 'RSS feed' : label,
    href,
    handle,
    icon: <Icon size={Math.round(optical * 0.63)} />,
  })),
]

export default function AboutPage() {
  return (
    <PageShell title="About" headerClassName="col-prose" className="article-flow has-toc" subtitle={about.description}>
      <JsonLd data={personSchema} />
      <TableOfContents toc={toc} />

      {/* The portrait rides only with `identity.portrait` set; no portrait, no figure.
          No mt: the PageShell header's mb-16 alone sets the 64px title→content invariant. */}
      {site.identity.portrait && (
        <figure className="col-prose md:row-start-2 mb-14">
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={site.identity.portrait}
              alt={site.identity.name}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) calc(100vw - 48px), 50vw"
            />
          </div>
        </figure>
      )}

      <Content components={{ PhotoCollageCard: SeatedPhotoCollageCard, GitHubCalendar: SeatedGitHubCalendar }} />

      <h2 id="colophon" className={H2}>Colophon</h2>
      <div className={TEXT_COL}>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7">
          {[
            { label: 'Framework', href: 'https://nextjs.org', value: 'Next.js' },
            { label: 'Styling', href: 'https://tailwindcss.com', value: 'Tailwind CSS' },
            { label: 'Components', href: 'https://ui.shadcn.com', value: 'shadcn/ui' },
            { label: 'Typeface', href: 'https://vercel.com/font', value: 'Geist' },
            { label: 'Monospace', href: 'https://vercel.com/font', value: 'Geist Mono' },
            { label: 'Hosting', href: 'https://vercel.com', value: 'Vercel' },
            { label: 'Content', href: 'https://mdxjs.com', value: 'MDX' },
            { label: 'Written in', href: 'https://obsidian.md', value: 'Obsidian' },
            { label: 'Version', href: null, value: `v${pkg.version}` },
          ].map(({ label, href, value }) => (
            <li key={label}>
              <span className="section-label block mb-1">{label}</span>
              {href ? (
                <Link href={href} className="accent-link font-sans text-prose break-words">
                  {value}
                </Link>
              ) : (
                <span className="font-sans text-prose break-words text-foreground">{value}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <h2 id="on-the-web" className={H2}>On the web</h2>
      {/* A profile directory rather than a plain list: each gray label carries its service
          mark, with the handle in the accent-link style. The row is the same resolved list the
          footer draws (site.config.ts `social`), plus the email when one is configured. */}
      <nav aria-label="Profiles elsewhere" className={TEXT_COL}>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7">
          {directory.map(({ label, href, handle, icon }) => (
            <li key={label}>
              <span className="section-label mb-1 flex items-center gap-1.5">
                {icon}
                {label}
              </span>
              <Link href={href} className="accent-link font-sans text-prose break-words">
                {handle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* The disclosure Amazon Associates requires, only while a tag is configured
          (publishing.amazonAffiliateTag), since only then do product links carry one. */}
      {affiliate && (
        <>
          <h2 id="affiliate-links" className={H2}>Affiliate links</h2>
          <p className={P}>
            Some product links on this site are Amazon affiliate links. If you purchase an item through one of them, {site.identity.name} receives a small commission. {site.identity.name} is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com.
          </p>
        </>
      )}
    </PageShell>
  )
}
