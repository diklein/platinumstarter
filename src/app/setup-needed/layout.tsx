import { SiteLayout } from '@/components/layout/site-layout'

export default function SetupNeededLayout({ children }: { children: React.ReactNode }) {
  return <SiteLayout>{children}</SiteLayout>
}
