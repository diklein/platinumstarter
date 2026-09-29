import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import Link from 'next/link'
import { getAllPosts, getHashtagCounts } from '@/lib/posts'
import { WritingSearchClient, type PostForList } from '@/components/writing/writing-search-client'
import { moduleEnabled, site, socialLinks } from '@/lib/site-config'

export const metadata = pageMetadata({
  title: 'Writing',
  description: site.writing.description,
  path: '/writing',
})

export default function WritingPage() {
  // Notes (untitled short posts) join the index only when writing.postTypes asks for them;
  // 'titled', the default, keeps the index to posts with a title. Search and the archive never
  // list notes either way; a note is still reachable at its own URL and in the feed.
  const showNotes = site.writing.postTypes === 'notes'
  const posts: PostForList[] = getAllPosts().filter((p) => showNotes || p.type !== 'note').map((p) => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
    type: p.type,
    excerpt: p.excerpt,
    body: p.body,
    tags: p.tags,
    ...(p.scheduled ? { scheduled: true } : {}),
  }))
  const hashtagCounts = getHashtagCounts()
  // The external signup link is the Buttondown profile from site.config.ts (`social.buttondown`);
  // with no newsletter configured the clause disappears from the subtitle.
  const newsletter = socialLinks().find((l) => l.network === 'buttondown')?.href

  return (
    <PageShell
      title="Writing"
      headerClassName="col-prose mb-4"
      subtitle={
        <>
          {'Subscribe to the '}
          <Link href="/feed.xml" className="accent-link">
            RSS feed
          </Link>
          {moduleEnabled('archive') && (
            <>
              {', view the '}
              <Link href="/archive" className="accent-link">
                archive
              </Link>
            </>
          )}
          {newsletter && (
            <>
              {', or '}
              <a
                href={newsletter}
                target="_blank"
                rel="noopener noreferrer"
                className="accent-link"
              >
                sign up<span className="sr-only"> (opens in new tab)</span>
              </a>
              {' for an occasional email digest'}
            </>
          )}
        </>
      }
    >
      <div className="col-prose">
        <WritingSearchClient posts={posts} hashtagCounts={hashtagCounts} />
      </div>
    </PageShell>
  )
}
