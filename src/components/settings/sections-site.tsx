'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MODULE_META, SOCIAL_NETWORKS, moduleEnabledIn } from './schema-helpers'
import type { ModuleId, SiteConfig, SocialNetwork } from '@/lib/site-config-schema'
import { useSettings } from './store'
import { Field, MONO, SettingsSection } from './primitives'
import { InlineText, OrderedList, SelectField, SwitchField, TextField, type Option, ColorField } from './controls'

/* The "Site" sections: Identity, Brand, Social, Header, Navigation, Footer. Each control
   is one config path; the copy under each label says what the code does with it. */

export function IdentitySection() {
  const { snap } = useSettings()
  const id = snap.config.identity
  return (
    <SettingsSection id="identity" title="Identity" lead="Who this site belongs to. The name is the header wordmark and every title; the tagline and intro feed metadata, the home hero, and the About lede.">
      <TextField label="Name" path="identity.name" value={id.name} hint="The wordmark, the title template, og:site_name, and the JSON-LD Person." />
      <TextField label="Tagline" path="identity.tagline" value={id.tagline} hint="One line under the name. Also the fallback for the description and the intro." />
      <TextField label="Description" path="identity.description" value={id.description} hint="Metadata descriptions. Falls back to the tagline; cleared, it follows the tagline again." />
      <TextField label="Intro" path="identity.intro" value={id.intro} multiline hint="One paragraph in your own voice for the home hero and the About lede." />
      <TextField label="URL" path="identity.url" value={id.url} type="url" mono hint="Leave empty on Vercel: the build uses the project's production domain. Set it to pin a different host or when hosting elsewhere." />
      <TextField label="Locale" path="identity.locale" value={id.locale} mono hint="BCP 47 with an underscore, as og:locale wants it." />
      <TextField label="Language" path="identity.lang" value={id.lang} mono hint="The html lang attribute." />
      <TextField label="Email" path="identity.email" value={id.email} type="email" placeholder="you@example.com" hint="Reply-by-email links, the palette's email command, like notifications. Empty = none of those render." />
      <TextField label="Portrait" path="identity.portrait" value={id.portrait} mono placeholder="/images/portrait.jpg" hint="Path under /public. Empty = no portrait anywhere." />
      <TextField label="Location" path="identity.location" value={id.location} placeholder="City, Country" hint="Free text for the About header and JSON-LD." />
    </SettingsSection>
  )
}

const MARK_OPTIONS: Option[] = [
  { value: 'starter', label: 'The Platinum mark' },
  { value: 'wordmark', label: 'Wordmark (the name as text)' },
  { value: 'custom', label: 'A file under /public' },
]

export function BrandSection() {
  const { snap, patch } = useSettings()
  const brand = snap.config.brand
  const markKind = brand.mark === 'starter' || brand.mark === 'wordmark' ? brand.mark : 'custom'
  return (
    <SettingsSection id="brand" title="Brand" lead="The mark in the header and the two colors the design system does not decide for you: the accent and the browser's theme-color pair. Spacing, type, and motion are not settings.">
      <SelectField
        label="Mark"
        path="brand.mark"
        value={markKind}
        options={MARK_OPTIONS}
        hint="What the header shows at the far left."
        onChange={(v) => patch('brand.mark', v === 'custom' ? '/images/mark.svg' : v)}
      />
      {markKind === 'custom' && (
        <TextField label="Mark file" path="brand.mark" value={brand.mark} mono placeholder="/images/mark.svg" hint="An SVG or PNG under /public, written as a site path." />
      )}
      <ColorField label="Accent" path="brand.accent" value={brand.accent} placeholder="#d70000 or oklch(0.51 0.27 27)" hint="One accent color for both themes, as a hex or any CSS color; pick it or type it. Empty = the house red." />
      <TextField label="Theme color, light" path="brand.themeColor.light" value={brand.themeColor.light} mono hint="The meta theme-color for light mode; the theme toggle and the lightboxes read the same value." />
      <TextField label="Theme color, dark" path="brand.themeColor.dark" value={brand.themeColor.dark} mono hint="The same, for dark mode." />
    </SettingsSection>
  )
}

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  bluesky: 'Bluesky',
  x: 'X',
  mastodon: 'Mastodon',
  buttondown: 'Buttondown',
  unsplash: 'Unsplash',
  youtube: 'YouTube',
  github: 'GitHub',
}

export function SocialSection() {
  const { snap, patch } = useSettings()
  const social = snap.config.social
  const order = social.order ?? [...SOCIAL_NETWORKS]
  const rows: SocialNetwork[] = [...order, ...SOCIAL_NETWORKS.filter((n) => !order.includes(n))]
  return (
    <SettingsSection id="social" title="Social" lead="Handles or full URLs per network. Only filled networks render, in this order, in the footer row and the About directory.">
      <Field label="Networks" path="social.order" hint="A handle (no @) or a full profile URL. Mastodon needs the full URL. Arrows set the render order." wide>
        <OrderedList<SocialNetwork>
          items={rows}
          keyOf={(n) => n}
          labelOf={(n) => NETWORK_LABEL[n]}
          subOf={(n) => `social.${n}`}
          removable={false}
          onChange={(next) => patch('social.order', next)}
          extra={(n) => (
            <InlineText value={social[n]} placeholder="handle" ariaLabel={`${NETWORK_LABEL[n]} handle`} commit={(v) => patch(`social.${n}`, v)} />
          )}
        />
      </Field>
      <SwitchField label="RSS mark" path="social.rss" value={social.rss} hint="Show the RSS mark at the end of the row." />
    </SettingsSection>
  )
}

export function HeaderSection() {
  const { snap } = useSettings()
  const header = snap.config.header
  return (
    <SettingsSection id="header" title="Header" lead="The three affordances the header can carry beside the nav.">
      <SelectField label="Search" path="header.search" value={header.search} options={[{ value: 'icon', label: 'A magnifier in the header' }, { value: 'none', label: 'None' }]} hint="The palette still opens on the keyboard shortcut either way." />
      <SwitchField label="Theme toggle" path="header.themeToggle" value={header.themeToggle} />
      <SelectField label="Default theme" path="header.defaultTheme" value={header.defaultTheme} options={[{ value: 'system', label: 'Follow the system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} hint="For visitors with no stored preference." />
    </SettingsSection>
  )
}

type NavEntry = SiteConfig['nav'][number]

function navKey(e: NavEntry, i: number): string {
  return typeof e === 'string' ? e : `${e.href}:${i}`
}

export function NavigationSection() {
  const { snap, patch } = useSettings()
  const nav = snap.config.nav
  const [href, setHref] = useState('')
  const [label, setLabel] = useState('')
  const present = new Set<string>(nav.flatMap((e) => (typeof e === 'string' ? [e] : [])))
  const candidates: Option[] = [
    ...(present.has('setup') ? [] : [{ value: 'setup', label: 'Setup (until set up)' }]),
    ...(present.has('writing') ? [] : [{ value: 'writing', label: 'Writing' }]),
    ...(present.has('about') ? [] : [{ value: 'about', label: 'About' }]),
    ...(Object.keys(MODULE_META) as ModuleId[])
      .filter((id) => id !== 'lab' && !present.has(id) && moduleEnabledIn(snap.config, id))
      .map((id) => ({ value: id, label: MODULE_META[id].label })),
  ]
  const addCustom = () => {
    const h = href.trim()
    const l = label.trim()
    if (!h || !l) return
    setHref('')
    setLabel('')
    void patch('nav', [...nav, { href: h.startsWith('/') || /^https?:/.test(h) ? h : `/${h}`, label: l }])
  }
  return (
    <SettingsSection id="navigation" title="Navigation" lead="The header links in order. Module ids resolve to their page; custom links go anywhere. A module that is off drops out of the nav even if it is listed here.">
      <Field label="Links" path="nav" hint="Writing and About are core; every other id is a module. Modules that are off are listed here but not rendered." wide>
        <OrderedList<NavEntry>
          items={nav}
          keyOf={(e) => navKey(e, nav.indexOf(e))}
          labelOf={(e) => (typeof e === 'string' ? (e === 'setup' ? 'Setup' : e === 'writing' ? 'Writing' : e === 'about' ? 'About' : MODULE_META[e].label) : e.label)}
          subOf={(e) => {
            if (typeof e === 'object') return `${e.href} (custom link)`
            const off = e !== 'setup' && e !== 'writing' && e !== 'about' && !moduleEnabledIn(snap.config, e)
            return `${e}${off ? ' (module off, hidden)' : ''}`
          }}
          onChange={(next) => patch('nav', next)}
          addOptions={{ options: candidates, make: (v) => v as NavEntry }}
          addLabel="Add a page"
        />
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <label htmlFor="nav-custom-href" className={MONO}>href</label>
            <Input id="nav-custom-href" value={href} placeholder="/now" className="mt-1 font-mono" onChange={(e) => setHref(e.target.value)} />
          </div>
          <div className="w-40">
            <label htmlFor="nav-custom-label" className={MONO}>label</label>
            <Input id="nav-custom-label" value={label} placeholder="Now" className="mt-1" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
          </div>
          <Button variant="outline" size="default" onClick={addCustom} disabled={!href.trim() || !label.trim()}>
            <Plus data-icon="inline-start" /> Add custom link
          </Button>
        </div>
      </Field>
    </SettingsSection>
  )
}

export function FooterSection() {
  const { snap } = useSettings()
  const footer = snap.config.footer
  return (
    <SettingsSection id="footer" title="Footer" lead="The byline sentence and the two small facts the footer can carry.">
      <TextField label="Byline" path="footer.byline" value={footer.byline} placeholder="Built with Platinum." hint="Empty = the footer renders without one." />
      <TextField label="Byline link" path="footer.bylineHref" value={footer.bylineHref} placeholder="https://" hint="Where the byline points. Empty = plain text." />
      <SwitchField label="Version" path="footer.version" value={footer.version} hint="Show the package version." />
      <SwitchField label="Last updated" path="footer.lastUpdated" value={footer.lastUpdated} hint="Show when the site last changed." />
    </SettingsSection>
  )
}
