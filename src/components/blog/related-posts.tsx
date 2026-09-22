import Link from 'next/link'
import type { RelatedPost } from '@/lib/posts'

interface Props {
  posts: RelatedPost[]
}

export function RelatedPosts({ posts }: Props) {
  if (posts.length === 0) return null
  return (
    <section aria-label="Related posts">
      <h2 className="section-label mb-6">
        Related
      </h2>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/writing/${post.slug}`}
              className="plain-link font-sans text-prose text-foreground hover:opacity-60 active:opacity-60 transition-opacity no-underline"
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
