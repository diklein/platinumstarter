import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DESIGNS } from '@/lib/designs'
import { extractHeadings, getDesignLeadImage } from '@/lib/posts'
import { pageMetadata, AUTHOR, PUBLISHER, breadcrumbSchema, SITE } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site-config'
import { JsonLd } from '@/components/seo/json-ld'
import { ShareButton } from '@/components/ui/share-button'
import { PasswordGate } from '@/components/ui/password-gate'
import { RelatedDesigns } from '@/components/designs/related-designs'
import { TableOfContents } from '@/components/blog/table-of-contents'
import { ScrollGatedToc } from '@/components/blog/scroll-gated-toc'
import { AssetLightbox } from '@/components/mdx/asset-lightbox'
import { safeEqual, designUnlockToken, DESIGN_UNLOCK_COOKIE } from '@/lib/auth'
import { unlockDesign } from '../actions'

// Server-side gate: a visitor is unlocked only if they present a cookie whose
// value matches the HMAC token derived from DESIGN_PASSWORD. Called ONLY for
// password-protected designs so non-protected pages never touch cookies() and
// remain statically prerendered.
async function isDesignUnlocked(): Promise<boolean> {
  const secret = process.env.DESIGN_PASSWORD
  if (!secret) return false
  const store = await cookies()
  const token = store.get(DESIGN_UNLOCK_COOKIE)?.value
  return !!token && safeEqual(token, designUnlockToken(secret))
}

export async function generateStaticParams() {
  return DESIGNS.map((design) => ({ slug: design.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const design = DESIGNS.find((d) => d.slug === slug)
  if (!design) return {}
  const ogUrl = `/og?title=${encodeURIComponent(design.title)}&type=case+study&path=${encodeURIComponent(`/designs/${design.slug}`)}`
  // Use the case study's own image (static hero, else first body image) — but never
  // for password-protected studies, whose imagery shouldn't leak via the card. Video
  // heroes (.mp4) can't be OG images, so fall back to the first body image.
  const staticHero = design.image && /\.(png|jpe?g|webp|avif|gif)$/i.test(design.image) ? design.image : null
  const lead = design.passwordProtected ? null : (staticHero ?? getDesignLeadImage(slug))
  const leadAbs = lead ? absoluteUrl(lead) : null
  const ogImages = leadAbs ? [{ url: leadAbs }] : [{ url: ogUrl, width: 1200, height: 630 }]
  const twitterImages = leadAbs ? [leadAbs] : [ogUrl]
  return pageMetadata({
    title: design.title,
    description: design.description,
    path: `/designs/${slug}`,
    images: ogImages,
    twitterImages,
  })
}

export default async function DesignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const design = DESIGNS.find((d) => d.slug === slug)
  if (!design) notFound()

  // SECURITY: for protected designs, render ONLY the password form until the
  // visitor is unlocked. The MDX is not read or imported on the locked path, so
  // no protected content is ever serialized into the response/RSC payload.
  if (design.passwordProtected && !(await isDesignUnlocked())) {
    return (
      <div className="px-6 md:px-12 pt-36 pb-24 grid grid-cols-12 gap-x-6">
        <PasswordGate title={design.title} unlockAction={unlockDesign} />
      </div>
    )
  }

  const mdxSource = fs.readFileSync(
    path.join(process.cwd(), 'src/content/designs', `${slug}.mdx`),
    'utf-8'
  )
  const headings = extractHeadings(mdxSource)
  // Opt-out only: the ToC renders unless frontmatter says `toc: false`, so existing
  // studies keep theirs. `toc: scroll` renders it scroll-gated: hidden until the
  // reader passes the page's [data-toc-gate] element (vibecoded's full-width hero).
  const tocScroll = /^toc:\s*scroll\b/m.test(mdxSource)
  const showToc = tocScroll || !/^toc:\s*false\b/m.test(mdxSource)

  let Content: React.ComponentType
  try {
    const mod = await import(`@/content/designs/${slug}.mdx`)
    Content = mod.default
  } catch {
    notFound()
  }

  // Mirror the OG-image logic: never surface a password-protected study's real imagery
  // (the JSON-LD is served to crawlers without the password), fall back to the text-only card.
  const staticHero = design.image && /\.(png|jpe?g|webp|avif|gif)$/i.test(design.image) ? design.image : null
  const schemaLead = design.passwordProtected ? null : (staticHero ?? getDesignLeadImage(slug))
  const schemaImage = schemaLead
    ? absoluteUrl(schemaLead)
    : absoluteUrl(`/og?title=${encodeURIComponent(design.title)}&type=case+study&path=${encodeURIComponent(`/designs/${design.slug}`)}`)
  const designSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: design.title,
    description: design.description,
    author: AUTHOR,
    publisher: PUBLISHER,
    image: schemaImage,
    url: absoluteUrl(`/designs/${slug}`),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/designs/${slug}`) },
    inLanguage: SITE.language,
  }

  return (
    // article-flow: case studies get the article template's rhythm engine (margin zeroing
    // before headings/figures, the 56px media beat) — without it they measured the loosest
    // heading gaps on the site (200-216px vs the article's 160). pb-32 matches articles too.
    <div data-study="" className={`article-flow ${showToc ? 'has-toc ' : ''}px-6 md:px-12 pt-36 pb-32 grid grid-cols-12 gap-x-6`}>
      <JsonLd data={designSchema} />
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Designs', path: '/designs' },
        { name: design.title, path: `/designs/${slug}` },
      ])} />
      <AssetLightbox />
      <div className="col-prose mb-12">
        <div className="flex items-center justify-between mb-6">
          <Link href="/designs" className="link-subtle font-sans text-label">
            <span aria-hidden="true" className="mr-1 inline-block">←</span>Designs
          </Link>
          <ShareButton />
        </div>
        <h1 className="font-sans text-title leading-[1.1] tracking-[var(--tracking-title)] text-foreground">
          {design.title}
        </h1>
      </div>
      <Content />
      <div className="col-prose mt-16">
        <hr className="section-rule mb-16" />
        <RelatedDesigns designs={DESIGNS} currentSlug={slug} />
      </div>
      {showToc && (tocScroll ? <ScrollGatedToc toc={headings} /> : <TableOfContents toc={headings} />)}
    </div>
  )
}
