import { notFound } from 'next/navigation'
import { SiteLayout } from '@/components/layout/site-layout'
import { moduleEnabled } from '@/lib/site-config'

// The module's own gate, read at request time: a module switched on in Settings opens on the
// next request in development (the off-module rewrite in next.config.mjs is fixed at build
// and, in dev, at server start). Production keeps the rewrite as the first line.
export default function BooksLayout({ children }: { children: React.ReactNode }) {
  if (!moduleEnabled('books')) notFound()
  return <SiteLayout>{children}</SiteLayout>
}
