'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ModuleId, PhotoSource, PhotoSourceKind, SiteConfig } from '@/lib/site-config-schema'
import { MODULE_IDS, MODULE_META, PHOTO_SOURCE_LABELS } from './schema-helpers'
import { useSettings } from './store'
import { Field, MONO, Meta, SettingsSection } from './primitives'
import { InlineText, OrderedList, SelectControl, SelectField, SwitchField, TextField, type Option } from './controls'

/* The "Content" sections: Modules, Home, Sources, Photos, Writing, Publishing. */

const LAB_OPTIONS: Option[] = [
  { value: 'preview', label: 'Dev and preview deployments' },
  { value: 'dev', label: 'Local dev only' },
  { value: 'off', label: 'Off' },
]

export function ModulesSection({ children }: { children?: React.ReactNode }) {
  const { snap, patch } = useSettings()
  const modules = snap.config.modules
  const lab = modules.lab
  return (
    <SettingsSection id="modules" title="Modules" lead="Every optional route group. Off hides it everywhere it is registered: nav, palette, search, sitemap, home cells. Deleting the folder is a job for Claude Code: say remove the photos module.">
      {children}
      {MODULE_IDS.filter((id): id is Exclude<ModuleId, 'lab'> => id !== 'lab').map((id) => (
        <SwitchField
          key={id}
          label={MODULE_META[id].label}
          path={`modules.${id}`}
          value={modules[id] === true}
          // On: the page is live and linked, and the nav carries it. Off: the address it would have.
          hint={modules[id] === true
            ? <span className="font-mono">Live at <a href={MODULE_META[id].href} className="accent-link">{MODULE_META[id].href}</a>{snap.config.nav.some((e) => e === id) ? ', and in the nav' : ''}</span>
            : <span className="font-mono">{MODULE_META[id].href}</span>}
          // Turning a module on also seats it in the nav, before About, when the nav does not
          // list it yet; off leaves the nav alone (a listed module that is off drops out by itself).
          onChange={async (next) => {
            const ok = await patch(`modules.${id}`, next)
            if (!ok || !next) return ok
            const nav = snap.config.nav
            if (nav.some((e) => e === id)) return ok
            const at = nav.indexOf('about')
            return patch('nav', at === -1 ? [...nav, id] : [...nav.slice(0, at), id, ...nav.slice(at)])
          }}
        />
      ))}
      <SelectField
        label="Lab"
        path="modules.lab"
        value={lab === false ? 'off' : lab.gate}
        options={LAB_OPTIONS}
        hint="The lab is a gated sketchbook; production never sees it either way."
        onChange={(v) => patch('modules.lab', v === 'off' ? false : { gate: v })}
      />
    </SettingsSection>
  )
}

type Cell = SiteConfig['home']['grid'][number]
const CELL_LABEL: Record<Cell, string> = {
  latestPost: 'Latest post',
  reading: 'Reading',
  now: 'Now',
  photos: 'Photos',
  social: 'Social',
  calendar: 'Calendar',
}
const CELL_NEEDS: Record<Cell, string> = {
  latestPost: 'always renders',
  reading: 'needs the books module',
  now: 'needs the books module or a titled post',
  photos: 'needs the photos module and a photo',
  social: 'needs a filled network',
  calendar: 'needs GITHUB_TOKEN',
}

export function HomeSection() {
  const { snap, patch } = useSettings()
  const home = snap.config.home
  const remaining = (Object.keys(CELL_LABEL) as Cell[]).filter((c) => !home.grid.includes(c))
  return (
    <SettingsSection id="home" title="Home" lead="The grid of cells under the hero. Cells whose module is off, or whose data is absent, hide themselves.">
      <SelectField label="Preset" path="home.preset" value={home.preset} options={[{ value: 'default', label: 'Hero and grid' }, { value: 'minimal', label: 'Hero only' }]} />
      <Field label="Grid cells" path="home.grid" hint="In order. Each cell notes what it needs to render." wide>
        <OrderedList<Cell>
          items={home.grid}
          keyOf={(c) => c}
          labelOf={(c) => CELL_LABEL[c]}
          subOf={(c) => `${c}, ${CELL_NEEDS[c]}`}
          onChange={(next) => patch('home.grid', next)}
          addOptions={{ options: remaining.map((c) => ({ value: c, label: CELL_LABEL[c] })), make: (v) => v as Cell }}
          addLabel="Add a cell"
        />
      </Field>
    </SettingsSection>
  )
}

export function SourcesSection() {
  const { snap } = useSettings()
  const sources = snap.config.sources
  const readout = (key: keyof SiteConfig['sources']) => snap.sources.find((s) => s.key === key)
  const row = (key: 'writing' | 'designs' | 'images' | 'photos', label: string, hint: string) => {
    const r = readout(key)
    return (
      <TextField
        key={key}
        label={label}
        path={`sources.${key}`}
        value={sources[key]}
        mono
        hint={<>{hint}{r && <Meta>{r.summary}</Meta>}</>}
      />
    )
  }
  return (
    <SettingsSection id="sources" title="Sources" lead="Where the content lives, relative to the repo root. The loaders and the convention checks read these; the readouts under each are live from disk.">
      {row('writing', 'Writing', 'Posts as MDX with frontmatter.')}
      {row('designs', 'Designs', 'Case studies as MDX.')}
      {row('images', 'Images', 'Article images, referenced from posts.')}
      {row('photos', 'Photos', 'The local photo folder /photos renders.')}
      <TextField label="Obsidian vault" path="sources.obsidianVault" value={sources.obsidianVault} placeholder="My Vault" hint="The vault name for obsidian:// edit links, a dev-only affordance." />
    </SettingsSection>
  )
}

/* ── Photo sources ───────────────────────────────────────────────────────── */

const KIND_OPTIONS: Option[] = (Object.keys(PHOTO_SOURCE_LABELS) as PhotoSourceKind[]).map((k) => ({ value: k, label: PHOTO_SOURCE_LABELS[k] }))

/** Field names per kind, in the schema's order. `user` on Unsplash is optional. */
const KIND_FIELDS: Record<PhotoSourceKind, Array<{ key: string; placeholder: string; optional?: boolean }>> = {
  unsplash: [{ key: 'user', placeholder: 'defaults to social.unsplash', optional: true }],
  glass: [{ key: 'profile', placeholder: 'profile' }],
  pixelfed: [{ key: 'instance', placeholder: 'pixelfed.social' }, { key: 'user', placeholder: 'handle' }],
  immich: [{ key: 'url', placeholder: 'https://photos.example.com' }, { key: 'album', placeholder: 'album (optional)', optional: true }],
  photoprism: [{ key: 'url', placeholder: 'https://photoprism.example.com' }, { key: 'album', placeholder: 'album (optional)', optional: true }],
}

function sourceSummary(s: PhotoSource): string {
  const rest = Object.entries(s).filter(([k]) => k !== 'kind').map(([k, v]) => `${k}: ${v}`)
  return rest.length ? rest.join(', ') : 'account from social.unsplash'
}

function PhotoSourcesField() {
  const { snap, patch } = useSettings()
  const sources = snap.config.photos.sources ?? []
  const [kind, setKind] = useState<PhotoSourceKind | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const write = (next: PhotoSource[]) => patch('photos.sources', next.length ? next : null)
  const update = (i: number, key: string, value: string | number | null) => {
    const next = sources.map((s, j) => {
      if (j !== i) return s
      const copy = { ...s } as Record<string, unknown>
      if (value === null) delete copy[key]
      else copy[key] = String(value)
      return copy as unknown as PhotoSource
    })
    return write(next)
  }
  const draftValid = kind !== null && KIND_FIELDS[kind].every((f) => f.optional || draft[f.key]?.trim())
  const add = () => {
    if (!kind || !draftValid) return
    const entry: Record<string, string> = { kind }
    for (const f of KIND_FIELDS[kind]) {
      const v = draft[f.key]?.trim()
      if (v) entry[f.key] = v
    }
    setKind(null)
    setDraft({})
    void write([...sources, entry as unknown as PhotoSource])
  }
  return (
    <Field label="Remote sources" path="photos.sources" hint="Services the sync pulls into /photos, merged with the local folder. Keys never live here: UNSPLASH_ACCESS_KEY, PIXELFED_TOKEN, IMMICH_API_KEY, PHOTOPRISM_TOKEN go in .env.local." wide>
      <ol className="divide-y divide-border border-y border-border">
        {sources.map((s, i) => (
          <li key={`${s.kind}-${i}`} className="flex flex-wrap items-center gap-3 py-3">
            <div className="w-28 shrink-0">
              <div className="font-sans text-label text-foreground">{PHOTO_SOURCE_LABELS[s.kind]}</div>
              <div className={MONO}>{s.kind}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {KIND_FIELDS[s.kind].map((f) => (
                <div key={f.key} className="w-56">
                  <InlineText
                    value={(s as unknown as Record<string, string | undefined>)[f.key]}
                    placeholder={f.placeholder}
                    mono
                    ariaLabel={`${PHOTO_SOURCE_LABELS[s.kind]} ${f.key}`}
                    commit={(v) => (v === null && !f.optional ? Promise.resolve(false) : update(i, f.key, v))}
                  />
                  <div className={MONO}>{f.key}</div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${sourceSummary(s)}`} onClick={() => write(sources.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </li>
        ))}
        {sources.length === 0 && <li className={`${MONO} py-3`}>Local folder only</li>}
      </ol>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <SelectControl value={kind} options={KIND_OPTIONS} placeholder="Add a source" onChange={(v) => { setKind(v as PhotoSourceKind); setDraft({}) }} />
        </div>
        {kind && KIND_FIELDS[kind].map((f) => (
          <div key={f.key} className="w-56">
            <label htmlFor={`photo-source-${f.key}`} className={MONO}>{f.key}</label>
            <Input id={`photo-source-${f.key}`} value={draft[f.key] ?? ''} placeholder={f.placeholder} className="mt-1 font-mono" onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          </div>
        ))}
        {kind && (
          <Button variant="outline" onClick={add} disabled={!draftValid}>
            <Plus data-icon="inline-start" /> Add {PHOTO_SOURCE_LABELS[kind]}
          </Button>
        )}
      </div>
    </Field>
  )
}

export function PhotosSection() {
  const { snap } = useSettings()
  const photos = snap.config.photos
  return (
    <SettingsSection id="photos" title="Photos" lead="Where photos come from and what the photo pages show with them. The local folder always renders; remote services are synced in beside it.">
      <TextField label="Description" path="photos.description" value={photos.description} hint="The sentence under the Photos title, and its meta description." />
      <PhotoSourcesField />
      <SwitchField label="Alt text" path="photos.altText" value={photos.altText} hint="AI alt text for synced photos (needs an intelligence provider key)." />
      <SwitchField label="EXIF" path="photos.exif" value={photos.exif} hint="Camera and exposure under each photo." />
      <SwitchField label="Attribution" path="photos.attribution" value={photos.attribution} hint="A View on Service link for synced photos." />
    </SettingsSection>
  )
}

export function WritingSection() {
  const { snap } = useSettings()
  const writing = snap.config.writing
  return (
    <SettingsSection id="writing" title="Writing" lead="How the writing index treats the two kinds of post.">
      <TextField label="Description" path="writing.description" value={writing.description} hint="The sentence under the Writing title, and its meta description." />
      <SelectField label="Post types" path="writing.postTypes" value={writing.postTypes} options={[{ value: 'titled', label: 'Titled posts only' }, { value: 'notes', label: 'Titled posts and short notes' }]} hint="Notes are untitled posts shown as short entries in the index." />
      <SwitchField label="Reply by email" path="writing.replyByEmail" value={writing.replyByEmail} hint="A Reply via email link under posts. Needs identity.email." />
    </SettingsSection>
  )
}

export function PublishingSection() {
  const { snap } = useSettings()
  const publishing = snap.config.publishing
  return (
    <SettingsSection id="publishing" title="Publishing" lead="The feed, likes, and affiliate links. A newsletter is a `buttondown` handle under Social: it links out.">
      <SwitchField label="RSS feed" path="publishing.rss" value={publishing.rss} hint="/feed.xml." />
      <SwitchField label="Likes" path="publishing.likes" value={publishing.likes} hint="Like buttons on posts. Needs DATABASE_URL." />
      <TextField label="Amazon affiliate tag" path="publishing.amazonAffiliateTag" value={publishing.amazonAffiliateTag} mono placeholder="yourtag-20" hint="Appended to ProductCard links built from an ASIN. Empty = plain Amazon links." />
    </SettingsSection>
  )
}
