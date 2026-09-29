import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/page-shell'
import { SettingsProvider } from '@/components/settings/store'
import { SettingsPage } from '@/components/settings/settings-page'
import { SetupWizard } from '@/components/settings/setup-wizard'
import { isDev } from './_lib/guard'
import { loadSnapshot } from './_lib/snapshot'

/* Dev-only. This page writes site.config.ts on disk through /api/settings, which only a
   local `next dev` can do, so it exists ONLY when NODE_ENV is development: the proxy
   rewrites the route to a 404 elsewhere (src/proxy.ts), and this notFound() is the second
   lock. Never cached: every render reads the file, the folders, and git. */

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Settings({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  if (!isDev) notFound()
  // Independent reads, started together (no waterfall).
  const [{ setup }, snapshot] = await Promise.all([searchParams, loadSnapshot()])
  const wizard = setup === '1'

  return (
    <PageShell
      title={wizard ? 'Set up' : 'Settings'}
      subtitle={wizard ? 'Six short steps, saved as you go' : 'Every field in site.config.ts'}
      headerClassName={wizard ? 'col-span-12 xl:col-start-4 xl:col-span-6' : 'col-span-12 xl:col-start-4 xl:col-span-9'}
    >
      <SettingsProvider initial={snapshot}>
        {wizard ? <SetupWizard /> : <SettingsPage />}
      </SettingsProvider>
    </PageShell>
  )
}
