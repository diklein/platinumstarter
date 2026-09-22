'use client'

import { SectionRail, type SectionRailGroup } from '@/components/layout/section-rail'
import { MobileToc } from '@/components/blog/mobile-toc'
import { LEAD } from './primitives'
import { DirtyStrip } from './dirty-strip'
import { BrandSection, FooterSection, HeaderSection, IdentitySection, NavigationSection, SocialSection } from './sections-site'
import { HomeSection, ModulesSection, PhotosSection, PublishingSection, SourcesSection, WritingSection } from './sections-content'
import { CodeSection, IntelligenceSection, PaletteSection } from './sections-system'
import { ConnectionsSection } from './connections-section'
import { DomainsSection } from './domains-section'
import { SetupSection } from './setup-section'

/* The settings page body: the design system's two-pane anatomy. The rail on the left
   tracks the section in view; every section is an anchor. Settings WRITES the tokens the
   design system READS: two halves of one system, so the page borrows its shape. */

export const SETTINGS_NAV: SectionRailGroup[] = [
  {
    label: 'Site',
    items: [
      { text: 'Identity', slug: 'identity' },
      { text: 'Brand', slug: 'brand' },
      { text: 'Social', slug: 'social' },
      { text: 'Header', slug: 'header' },
      { text: 'Navigation', slug: 'navigation' },
      { text: 'Footer', slug: 'footer' },
    ],
  },
  {
    label: 'Content',
    items: [
      { text: 'Modules', slug: 'modules' },
      { text: 'Home', slug: 'home' },
      { text: 'Sources', slug: 'sources' },
      { text: 'Photos', slug: 'photos' },
      { text: 'Writing', slug: 'writing' },
      { text: 'Publishing', slug: 'publishing' },
    ],
  },
  {
    label: 'System',
    items: [
      { text: 'Intelligence', slug: 'intelligence' },
      { text: 'Code', slug: 'code' },
      { text: 'Search palette', slug: 'palette' },
    ],
  },
  {
    label: 'Services',
    items: [
      { text: 'Connections', slug: 'connections' },
      { text: 'Domain', slug: 'domains' },
      { text: 'Setup', slug: 'setup' },
    ],
  },
]

export function SettingsPage() {
  return (
    <>
      <SectionRail groups={SETTINGS_NAV} label="Settings sections" />
      <MobileToc toc={SETTINGS_NAV.flatMap((g) => g.items.map((i) => ({ depth: 2 as const, text: i.text, slug: i.slug })))} />

      <div className="col-span-12 xl:col-start-4 xl:col-span-9">
        <DirtyStrip />
        <p className={LEAD}>
          Every control here is one line in site.config.ts, and every change saves automatically.
          The path under each label is the same thing you would ask Claude to change.
        </p>

        <div className="mt-16 space-y-24">
          <IdentitySection />
          <BrandSection />
          <SocialSection />
          <HeaderSection />
          <NavigationSection />
          <FooterSection />
          <ModulesSection />
          <HomeSection />
          <SourcesSection />
          <PhotosSection />
          <WritingSection />
          <PublishingSection />
          <IntelligenceSection />
          <CodeSection />
          <PaletteSection />
          <ConnectionsSection />
          <DomainsSection />
          <SetupSection />
        </div>
      </div>
    </>
  )
}
