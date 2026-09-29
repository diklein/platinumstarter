import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BackSourceLink } from '@/components/blog/back-source-link'
import { getAllPosts, getPostBySlug, formatDate, getEnrichedPost, getRelatedPosts, getPostLeadImage } from '@/lib/posts'
import { ShareButton } from '@/components/ui/share-button'
import { LikeButton } from '@/components/ui/like-button'
import { buttonVariants } from '@/components/ui/button'
import { TableOfContents } from '@/components/blog/table-of-contents'
import { RelatedPosts } from '@/components/blog/related-posts'
import { HashtagList } from '@/components/blog/hashtag-list'
import { JsonLd } from '@/components/seo/json-ld'
import { pageMetadata, AUTHOR, PUBLISHER, breadcrumbSchema, SITE } from '@/lib/seo'
import { site, absoluteUrl } from '@/lib/site-config'
import { VideoAutoplayObserver } from '@/components/blog/video-autoplay-observer'
import { AssetLightbox } from '@/components/mdx/asset-lightbox'

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  // &v=N versions the card: scrapers cache image bytes by URL, so a card redesign must
  // change the URL (see OG_CARD_VERSION in src/lib/seo.ts — keep these in step).
  const ogUrl = `/og?slug=${encodeURIComponent(slug)}&type=${encodeURIComponent(post.type ?? 'article')}&title=${encodeURIComponent(post.title ?? '')}&date=${encodeURIComponent(post.date ?? '')}&path=${encodeURIComponent(`/writing/${slug}`)}&v=3`

  // When the post has its own image, use it for the social card; otherwise the generated card.
  const lead = getPostLeadImage(slug)
  const leadAbs = lead ? absoluteUrl(lead) : null
  const ogImages = leadAbs ? [{ url: leadAbs }] : [{ url: ogUrl, width: 1200, height: 630 }]
  const twitterImages = leadAbs ? [leadAbs] : [ogUrl]

  return pageMetadata({
    title: post.title ?? undefined,
    socialTitle: post.title ?? undefined,
    description: post.description ?? post.excerpt ?? '',
    path: `/writing/${slug}`,
    type: 'article',
    images: ogImages,
    twitterImages,
    publishedTime: post.date,
  })
}

// No `searchParams` here: reading it opted every article out of static prerendering (each
// paid a function invocation per request). The ?from=archive back-link label is resolved
// client-side in <BackSourceLink> instead, and the route stays fully static.
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()
  // The MDX module depends on nothing but the slug: start loading it now, await it last, so the
  // post lookups below overlap the import instead of queueing in front of it.
  const contentPromise = import(`@/content/writing/${slug}.mdx`)

  const leadImage = getPostLeadImage(slug)
  const leadImageAbs = leadImage ? absoluteUrl(leadImage) : null

  const blogPostingSchema = post.type === 'article' ? {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title ?? '',
    datePublished: post.date,
    dateModified: post.date,
    author: AUTHOR,
    publisher: PUBLISHER,
    description: post.description ?? post.excerpt ?? '',
    image: leadImageAbs ?? absoluteUrl(`/og?slug=${encodeURIComponent(slug)}&type=${encodeURIComponent(post.type ?? 'article')}&title=${encodeURIComponent(post.title ?? '')}&date=${encodeURIComponent(post.date ?? '')}&path=${encodeURIComponent(`/writing/${slug}`)}&v=3`),
    url: absoluteUrl(`/writing/${slug}`),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/writing/${slug}`) },
    inLanguage: SITE.language,
  } : null

  let enriched: ReturnType<typeof getEnrichedPost>
  try {
    enriched = getEnrichedPost(slug)
  } catch {
    notFound()
  }
  const related = getRelatedPosts(slug)

  let Content: React.ComponentType
  try {
    const mod = await contentPromise
    Content = mod.default
  } catch {
    // Dev-only drafts lane: local drafts (gitignored, invisible to the prod glob) render at
    // their real URL while writing. Production never reaches this — getAllPosts excludes
    // drafts there, so the slug 404s above before any import runs.
    try {
      const mod = await import(`@/content/writing/drafts/${slug}.mdx`)
      Content = mod.default
    } catch {
      notFound()
    }
  }

  // A single hairline caps the article body above the footer. It rides the FIRST footer block
  // that renders — normally the tags, else the reply block, else related.
  const hasTags = !!(post.tags && post.tags.length > 0)
  // Equal breathing room above (the footer block's mt-12) and below (pt-12) the hairline.
  const dividerCap = 'border-t border-[var(--color-rule-strong)] pt-12'

  return (
    <div className={`article-flow px-6 md:px-12 pt-36 pb-32 grid grid-cols-12 gap-x-6${post.toc ? ' has-toc' : ''}${post.imageBorders ? ' article-image-borders' : ''}`}>
      {blogPostingSchema && <JsonLd data={blogPostingSchema} />}
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Writing', path: '/writing' },
        { name: post.title ?? 'Post', path: `/writing/${slug}` },
      ])} />
      <div className="col-prose mb-12">
        <div className="flex items-center justify-between mb-6">
          <Suspense
            fallback={
              <Link href="/writing" className="link-subtle font-sans text-sm">
                <span aria-hidden="true" className="mr-1 inline-block">←</span>Writing
              </Link>
            }
          >
            <BackSourceLink />
          </Suspense>
          <div className="flex items-center gap-2">
            <ShareButton />
            {site.publishing.likes && <LikeButton slug={`writing/${slug}`} />}
          </div>
        </div>
        <p className="section-label mb-5">
          {formatDate(post.date)}{post.type === 'article' ? ` · ${enriched.readingTime} min read` : null}
        </p>
        {post.title && (
          // No mt: the date label's mb-5 alone sets this gap (a previous mt-2 collapsed
          // away and only read as if it did something).
          <h1 className="font-sans font-normal text-title leading-[1.1] tracking-[var(--tracking-title)] text-foreground">
            {post.title}
          </h1>
        )}
      </div>
      <VideoAutoplayObserver />
      <AssetLightbox />
      <Content />
      {hasTags && (
        <div className={`article-foot-start col-prose mt-12 ${dividerCap}`}>
          <HashtagList hashtags={post.tags!} />
        </div>
      )}
      {/* Reply by email: only with an address to write to (site.identity.email) and the
          writing.replyByEmail switch on. Absent either, the block disappears whole. */}
      {post.title && site.identity.email && site.writing.replyByEmail && (
        <div className={`article-foot-start col-prose mt-12${hasTags ? '' : ` ${dividerCap}`}`}>
          <p className="font-sans text-prose leading-prose text-foreground">Chat about this?</p>
          <a
            href={`mailto:${site.identity.email}?subject=${encodeURIComponent(post.title)}`}
            className={`${buttonVariants({ variant: 'default', size: 'xl' })} mt-3`}
          >
            Send a comment
          </a>
        </div>
      )}
      {post.toc && <TableOfContents toc={enriched.headings} />}
      {/* Only when there ARE related posts — RelatedPosts renders null for an empty list,
          and the wrapper alone painted an orphan hairline + dead spacing under short posts. */}
      {related.length > 0 && (
        <div className={`article-foot-start col-prose mt-12${hasTags || post.title ? '' : ` ${dividerCap}`}`}>
          <RelatedPosts posts={related} />
        </div>
      )}
    </div>
  )
}
