import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/page-shell'
import { SetupGuide } from '@/components/setup/setup-guide'
import { setupPageVisible } from '@/lib/site-config'

/* The first-run Setup page: the three ways in and the checklist, in the nav before Writing
   while `setup.completed` is false. Decided at build time (setupPageVisible), so a set-up site
   answers 404 here and carries no nav entry. Never indexed: nothing on it is the owner's. */

export const metadata: Metadata = {
  title: 'Setup',
  robots: { index: false, follow: false },
}

export default function SetupPage() {
  if (!setupPageVisible()) notFound()
  return (
    <PageShell title="Setup" subtitle="Three ways to make this site yours." headerClassName="col-prose">
      <SetupGuide />
    </PageShell>
  )
}
