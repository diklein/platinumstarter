'use client'

import { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { loadSearchIndex } from '@/lib/search-index-client'
import { moduleEnabled } from '@/lib/site-config'

// Tag chips link into the hashtags module; with it off they have nowhere to go.
const HASHTAGS_ON = moduleEnabled('hashtags')

export type PostForList = {
  slug: string
  title?: string
  date: string
  type: 'article' | 'photo' | 'note' | 'link'
  excerpt?: string
  body?: string
  tags?: string[]
  /** Pre-lowercased full body from the search index — matching corpus only, never rendered. */
  content?: string
  /** Dated after today. Only ever true in development and preview; production leaves these out. */
  scheduled?: boolean
}

const PER_PAGE = 20

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function matchesQuery(post: PostForList, q: string): boolean {
  return (
    post.title?.toLowerCase().includes(q) ||
    post.excerpt?.toLowerCase().includes(q) ||
    post.tags?.some((t) => t.toLowerCase().includes(q)) ||
    // content arrives pre-lowercased — lowercasing every body per keystroke was
    // the hottest line in this component.
    post.content?.includes(q) ||
    false
  )
}

export function WritingSearchClient({
  posts,
  hashtagCounts,
}: {
  posts: PostForList[]
  hashtagCounts: Record<string, number>
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [contentMap, setContentMap] = useState<Map<string, string> | null>(null)

  const enrichedPosts = useMemo(() => {
    if (!contentMap) return posts
    return posts.map((p) => ({ ...p, content: contentMap.get(p.slug) ?? '' }))
  }, [posts, contentMap])

  // Shared module-level fetch (also feeds ⌘K and /archive) — safe to call per
  // keystroke, only the first caller pays.
  const loadIndex = useCallback(() => {
    loadSearchIndex()
      .then((items) => setContentMap((prev) => prev ?? new Map(items.map((i) => [i.slug, i.contentLower]))))
      .catch(() => {})
  }, [])

  /* The URL carries ?q= and ?page= so results are deep-linkable and back/forward
     restore them. State is read from the URL on mount (not via useSearchParams:
     that would client-side-render the whole prerendered list out of the initial
     HTML) and written with the native history API, which this Next version keeps
     in sync with its router. SSR always renders page 1 — the guideline trade. */
  const readUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q') ?? ''
    setQuery(q)
    if (q) loadIndex()
    const p = parseInt(params.get('page') ?? '1', 10)
    setPage(Number.isFinite(p) && p > 0 ? p : 1)
  }, [loadIndex])

  useEffect(() => {
    // Mount-time restore from an external input (the URL). Lazy state init can't do it:
    // the server rendered the unfiltered list, and hydration must match that markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.search) readUrl()
    window.addEventListener('popstate', readUrl)
    return () => window.removeEventListener('popstate', readUrl)
  }, [readUrl])

  const writeUrl = useCallback((q: string, p: number, method: 'pushState' | 'replaceState') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const search = params.toString()
    window.history[method](null, '', window.location.pathname + (search ? `?${search}` : ''))
  }, [])

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value)
      setPage(1)
      loadIndex()
      writeUrl(value, 1, 'replaceState')
    },
    [loadIndex, writeUrl]
  )

  const goToPage = useCallback(
    (p: number) => {
      setPage(p)
      window.scrollTo(0, 0)
      writeUrl(query, p, 'pushState')
    },
    [query, writeUrl]
  )

  // Deferred: the filter walks every full post body, so it follows the keystroke
  // at transition priority instead of blocking the input's urgent update.
  const deferredQuery = useDeferredValue(query)
  const searchResults = useMemo(() => {
    if (!deferredQuery) return null
    const q = deferredQuery.toLowerCase()
    return enrichedPosts.filter((p) => matchesQuery(p, q))
  }, [deferredQuery, enrichedPosts])

  /* Search results page too: a broad query matches most of the corpus, and an
     unpaginated render of a few hundred articles is the guideline's >50-items
     red flag. The result COUNT in the input stays the total across pages. */
  const activeList = searchResults ?? posts
  const visiblePosts = activeList.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(activeList.length / PER_PAGE)

  return (
    /* min-w-0: as a flex item the list must be allowed to shrink below the widest
       row's min-content, or it blows out of its slot (break-writing-search). */
    <div className="min-w-0">
      <div className="mb-16">
        <SearchInput
          value={query}
          onValueChange={handleChange}
          placeholder="Search writing…"
          ariaLabel="Search writing"
          resultsCount={searchResults?.length}
        />
      </div>

      {searchResults && searchResults.length === 0 && (
        <p className="font-sans text-label text-[var(--color-muted)]">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {visiblePosts.map((post, index) => (
        <article key={post.slug}>
          {index > 0 && (
            <div className="border-t border-[var(--color-border)] my-16" />
          )}
          {post.type === 'note' ? (
            <div>
              <p className="section-label mb-4">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                {post.scheduled && <span className="ml-2 text-[var(--color-accent)]">Scheduled</span>}
              </p>
              {post.body && post.body.split('\n\n').map((para, i) => (
                <p key={i} className="font-sans text-prose leading-[1.45] tracking-[-0.01em] text-[var(--color-muted)] mt-4 first:mt-0">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <div>
              <p className="section-label mb-1">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                {post.scheduled && <span className="ml-2 text-[var(--color-accent)]">Scheduled</span>}
              </p>
              {/* font-medium, the house heading weight (article h2s, page H2s) — semibold was
                  only ever compensating for the title sharing the excerpt's size. Now that
                  text-entry-title carries the hierarchy, the scale follows one rule: the bigger
                  the type, the lighter it runs (54px normal h1 → 24px medium → regular body). */}
              {post.title && (
                <h2 className="font-sans font-medium text-entry-title leading-[1.2] tracking-[-0.015em] text-foreground mb-4">
                  <Link href={`/writing/${post.slug}`} className="link-quiet">
                    {post.title}
                  </Link>
                </h2>
              )}
              {post.excerpt && (
                <p className="font-sans text-prose leading-prose tracking-[-0.01em] text-foreground line-clamp-3">
                  {post.excerpt}
                </p>
              )}
            </div>
          )}
          {HASHTAGS_ON && post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/hashtags/${encodeURIComponent(tag)}`}
                  className="hashtag-link section-label hover:text-foreground active:text-foreground transition-colors"
                >
                  #{tag}{' '}
                  <span className="text-[var(--color-muted)]">{hashtagCounts[tag]}</span>
                </Link>
              ))}
            </div>
          )}
        </article>
      ))}

      {totalPages > 1 && (
        <div className="mt-24 flex items-center justify-between pt-8 border-t border-[var(--color-border)]">
          {page > 1 ? (
            <button
              onClick={() => goToPage(page - 1)}
              className={buttonVariants({ variant: 'secondary', size: 'default' })}
            >
              ← Newer
            </button>
          ) : <span />}
          {page < totalPages ? (
            <button
              onClick={() => goToPage(page + 1)}
              className={buttonVariants({ variant: 'secondary', size: 'default' })}
            >
              Older →
            </button>
          ) : <span />}
        </div>
      )}
    </div>
  )
}
