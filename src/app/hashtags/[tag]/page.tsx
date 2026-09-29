import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPostsByHashtag, getHashtagCounts, formatDate } from '@/lib/posts'
import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'

export async function generateStaticParams() {
  const counts = getHashtagCounts()
  return Object.keys(counts).map((tag) => ({ tag: encodeURIComponent(tag) }))
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = await params
  const tag = decodeURIComponent(rawTag)
  const counts = getHashtagCounts()
  if (!counts[tag]) return {}
  return pageMetadata({
    title: `#${tag}`,
    description: `All posts tagged #${tag}.`,
    path: `/hashtags/${tag}`,
    images: [{ url: `/og?title=%23${encodeURIComponent(tag)}&type=tag&path=${encodeURIComponent(`/hashtags/${tag}`)}`, width: 1200, height: 630 }],
  })
}

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = await params
  const tag = decodeURIComponent(rawTag)
  const posts = getPostsByHashtag(tag)
  if (posts.length === 0) notFound()

  const counts = getHashtagCounts()
  const count = counts[tag]

  return (
    <PageShell
      title={`#${tag}`}
      headerClassName="col-prose"
      subtitle={`${count} ${count === 1 ? 'post' : 'posts'}`}
      eyebrow={
        <Link href="/writing" className="link-subtle font-sans text-sm">
          <span aria-hidden="true" className="mr-1 inline-block">←</span>Writing
        </Link>
      }
    >

      <div className="col-prose">
        {posts.map((post) => (
          <div
            key={post.slug}
            className="border-b border-[var(--color-border)] py-3 flex items-baseline gap-6"
          >
            {/* Same list register as /writing and /archive: 13px label date, prose title. */}
            <span className="font-sans text-label text-[var(--color-muted)] w-44 shrink-0">
              {formatDate(post.date)}
            </span>
            <Link
              href={`/writing/${post.slug}`}
              className="font-sans text-prose accent-link"
            >
              {post.title ?? '(untitled)'}
            </Link>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
