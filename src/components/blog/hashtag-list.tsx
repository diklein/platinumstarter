import Link from 'next/link'
import { getHashtagCounts } from '@/lib/posts'
import { moduleEnabled } from '@/lib/site-config'

export function HashtagList({ hashtags }: { hashtags: string[] }) {
  // Tags are links into the hashtags module; with it off there is nowhere to go.
  if (!moduleEnabled('hashtags')) return null
  const counts = getHashtagCounts()
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {hashtags.map((tag) => (
        <Link
          key={tag}
          href={`/hashtags/${encodeURIComponent(tag)}`}
          // Foreground, not muted: a hashtag is a link you're invited to follow, and muted read
          // as decoration. The count stays muted — data, not an action. Hover feedback is the
          // underline darkening (a.hashtag-link:hover), in the link's own color.
          className="hashtag-link font-sans text-prose text-foreground"
        >
          #{tag}{' '}
          <span className="text-[var(--color-muted)]">{counts[tag]}</span>
        </Link>
      ))}
    </div>
  )
}
