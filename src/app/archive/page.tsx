import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import { BackLink } from '@/components/layout/back-link'
import { getAllPosts } from '@/lib/posts'
import { ArchiveFilterClient, type ArchiveItem } from '@/components/archive/archive-filter-client'

export const metadata = pageMetadata({
  title: 'Archive',
  description: 'Everything, in order.',
  path: '/archive',
})

const allItems: ArchiveItem[] = getAllPosts()
  .filter((p) => p.type !== 'note')
  .map((p) => ({
    kind: 'post' as const,
    slug: p.slug,
    date: p.date,
    type: p.type,
    title: p.title,
    excerpt: p.excerpt,
    tags: p.tags,
  }))
  .sort((a, b) => b.date.localeCompare(a.date))

const groupMap = new Map<string, ArchiveItem[]>()
for (const item of allItems) {
  const year = item.date.slice(0, 4)
  if (!groupMap.has(year)) groupMap.set(year, [])
  groupMap.get(year)!.push(item)
}

const groupedItems: [string, ArchiveItem[]][] = Array.from(groupMap.entries())
const totalCount = allItems.length
const earliestYear = allItems.at(-1)?.date.slice(0, 4) ?? ''

export default function ArchivePage() {
  return (
    <PageShell title="Archive" headerClassName="col-prose mb-4" subtitle={`${totalCount} posts since ${earliestYear}`} eyebrow={<BackLink href="/writing" label="Writing" />}>
      <div className="col-prose">
        <ArchiveFilterClient groupedItems={groupedItems} />
      </div>
    </PageShell>
  )
}
