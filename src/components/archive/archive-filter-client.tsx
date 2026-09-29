'use client'

import { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react'
import Link from 'next/link'
import { SearchInput } from '@/components/ui/search-input'
import { loadSearchIndex } from '@/lib/search-index-client'

export type ArchiveItem = {
  kind: 'post'
  slug: string
  date: string
  type: 'article' | 'photo' | 'note' | 'link'
  title?: string
  excerpt?: string
  tags?: string[]
  content?: string
}

// One formatter + a permanent cache: all 161 rows re-render on every search
// keystroke, and toLocaleDateString with an options bag builds a fresh
// Intl.DateTimeFormat each call. Dates are immutable, so format each once.
const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const dateCache = new Map<string, string>()

function fullDate(iso: string): string {
  let formatted = dateCache.get(iso)
  if (formatted === undefined) {
    formatted = DATE_FMT.format(new Date(iso + 'T00:00:00Z'))
    dateCache.set(iso, formatted)
  }
  return formatted
}

function matchesQuery(item: ArchiveItem, q: string): boolean {
  return (
    item.title?.toLowerCase().includes(q) ||
    item.excerpt?.toLowerCase().includes(q) ||
    item.tags?.some((t) => t.toLowerCase().includes(q)) ||
    // content arrives pre-lowercased from the shared index (see search-index-client).
    item.content?.includes(q) ||
    false
  )
}

export function ArchiveFilterClient({ groupedItems }: { groupedItems: [string, ArchiveItem[]][] }) {
  const [query, setQuery] = useState('')
  const [contentMap, setContentMap] = useState<Map<string, string> | null>(null)

  const allItems = useMemo(
    () => groupedItems.flatMap(([, items]) => items),
    [groupedItems]
  )

  const enrichedItems = useMemo(() => {
    if (!contentMap) return allItems
    return allItems.map((item) => ({ ...item, content: contentMap.get(item.slug) ?? '' }))
  }, [allItems, contentMap])

  // Shared module-level fetch (also feeds ⌘K and /writing) — safe to call per
  // keystroke, only the first caller pays.
  const loadIndex = useCallback(() => {
    loadSearchIndex()
      .then((items) => setContentMap((prev) => prev ?? new Map(items.map((i) => [i.slug, i.contentLower]))))
      .catch(() => {})
  }, [])

  /* The URL carries ?q= so a search is deep-linkable and back/forward restore it —
     the /writing pattern: read from the URL on mount (not via useSearchParams, which
     would client-side-render the prerendered list out of the initial HTML), write
     with the native history API, which this Next version keeps in sync. */
  const readUrl = useCallback(() => {
    const q = new URLSearchParams(window.location.search).get('q') ?? ''
    setQuery(q)
    if (q) loadIndex()
  }, [loadIndex])

  useEffect(() => {
    // Mount-time restore from an external input (the URL). Lazy state init can't do it:
    // the server rendered the unfiltered list, and hydration must match that markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.search) readUrl()
    window.addEventListener('popstate', readUrl)
    return () => window.removeEventListener('popstate', readUrl)
  }, [readUrl])

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value)
      loadIndex()
      window.history.replaceState(null, '', window.location.pathname + (value ? `?q=${encodeURIComponent(value)}` : ''))
    },
    [loadIndex]
  )

  // Deferred: the filter walks every full post body over the unpaginated archive,
  // so it follows the keystroke at transition priority instead of blocking the
  // input's urgent update.
  const deferredQuery = useDeferredValue(query)
  const filteredItems = useMemo(() => {
    if (!deferredQuery) return allItems
    const q = deferredQuery.toLowerCase()
    return enrichedItems.filter((item) => matchesQuery(item, q))
  }, [deferredQuery, enrichedItems, allItems])

  const filteredGrouped = useMemo(() => {
    const groups = new Map<string, ArchiveItem[]>()
    for (const item of filteredItems) {
      const year = item.date.slice(0, 4)
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year)!.push(item)
    }
    return Array.from(groups.entries())
  }, [filteredItems])

  return (
    <div>
      <div className="mb-16">
        <SearchInput
          value={query}
          onValueChange={handleChange}
          placeholder="Search archive…"
          ariaLabel="Search archive"
          resultsCount={query ? filteredItems.length : undefined}
        />
      </div>

      {filteredGrouped.length === 0 ? (
        <p className="font-sans text-label text-[var(--color-muted)]">
          No results for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        filteredGrouped.map(([year, items]) => (
          <div key={year} className="mb-12">
            <h2 className="font-sans font-medium text-h2 leading-[1.2] tracking-[-0.02em] mb-6">
              {year}
            </h2>
            {items.map((item) => (
              <div
                key={item.slug}
                className="cv-auto-row border-b border-[var(--color-border)] py-3 flex items-baseline gap-6"
              >
                {/* /writing's list register: 13px label date, prose-size title — the old
                    16px text-base belonged to neither type register. */}
                <span className="font-sans text-label text-[var(--color-muted)] w-44 shrink-0">
                  {fullDate(item.date)}
                </span>
                <Link
                  href={`/writing/${item.slug}?from=archive`}
                  className="font-sans text-prose accent-link"
                >
                  {item.title ?? '(untitled)'}
                </Link>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
