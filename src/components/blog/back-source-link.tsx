'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// Where a post can be reached FROM, reflected in the back link (?from=archive). Resolved
// CLIENT-side on purpose: reading searchParams in the page component opted all ~150 articles
// out of static prerendering — every article paid a function invocation so this one label
// could vary. The static HTML shows the default (Writing); an archive visitor sees it swap
// at hydration, which is cosmetic and non-SEO.
const BACK_SOURCES: Record<string, { label: string; href: string }> = {
  archive: { label: 'Archive', href: '/archive' },
}

export function BackSourceLink() {
  const from = useSearchParams().get('from')
  const back = BACK_SOURCES[from ?? ''] ?? { label: 'Writing', href: '/writing' }
  return (
    <Link href={back.href} className="link-subtle font-sans text-label">
      <span aria-hidden="true" className="mr-1 inline-block">←</span>{back.label}
    </Link>
  )
}
