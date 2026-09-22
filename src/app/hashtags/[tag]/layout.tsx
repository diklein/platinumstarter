import { notFound } from 'next/navigation'
import { SiteLayout } from '@/components/layout/site-layout'
import { moduleEnabled } from '@/lib/site-config'

// The module's own gate, read at request time (see the other module layouts).
export default function HashtagLayout({ children }: { children: React.ReactNode }) {
  if (!moduleEnabled('hashtags')) notFound()
  return <SiteLayout>{children}</SiteLayout>
}
