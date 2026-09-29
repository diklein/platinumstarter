import { SiteLayout } from '@/components/layout/site-layout'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SiteLayout>{children}</SiteLayout>
}
