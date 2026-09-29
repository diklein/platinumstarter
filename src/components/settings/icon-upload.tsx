'use client'

import { useId, useRef, useState } from 'react'
import { DEFAULTS } from './schema-helpers'
import { Button } from '@/components/ui/button'
import { useSettings } from './store'
import { DESC, Field, MONO } from './primitives'
import { InlineText } from './controls'

/* The site icon, in the Brand section. One SVG becomes the header mark and every icon file
   (the tab, iOS and Android home screens, install, the feed image), through the dev-only
   /api/settings/icon route, which runs the same code as `npm run icons` (src/lib/icons.ts).

   The previews are CSS backgrounds rather than images: the files change under the same URL
   while the page is open, so each render carries its own cache key, and next/image does not
   take query strings on local files. */

async function postIcon(body: { svg?: string; background?: string }): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const res = await fetch('/api/settings/icon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as { files?: string[]; error?: string }
  return res.ok ? { ok: true, count: json.files?.length ?? 0 } : { ok: false, error: json.error ?? `The server answered ${res.status}.` }
}

/** Rebuild the icon set from the current mark, for callers outside this file (the mark picker). */
export async function rebuildIcons(): Promise<void> {
  await postIcon({})
}

function Preview({ src, label, size, tile, round }: { src: string; label: string; size: number; tile?: boolean; round?: boolean }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        role="img"
        aria-label={label}
        className={`shrink-0 bg-contain bg-center bg-no-repeat ${tile ? 'img-outline' : ''} ${round ? 'rounded-full' : tile ? 'rounded-[22%]' : ''}`}
        style={{ width: size, height: size, backgroundImage: `url("${src}")` }}
      />
      <figcaption className={MONO}>{label}</figcaption>
    </figure>
  )
}

export function IconUploadField() {
  const { snap, refresh } = useSettings()
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // A stable key on first render (server and client must agree); each upload bumps it.
  const [version, setVersion] = useState(0)

  const mark = snap.config.brand.mark
  const hasVector = mark === 'starter' || (mark.startsWith('/') && mark.toLowerCase().endsWith('.svg'))

  async function run(body: { svg?: string; background?: string }, done: string) {
    setBusy(true)
    setError(null)
    setStatus(null)
    const result = await postIcon(body)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
    setVersion((n) => n + 1)
    setStatus(`${done} ${result.count} files written; commit them with the config.`)
  }

  async function take(file: File | undefined) {
    if (!file) return
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
      setError('That is not an SVG. Every icon size is drawn from the vector, so export an SVG from your design tool.')
      return
    }
    await run({ svg: await file.text() }, `${file.name} is the mark and the icon now.`)
  }

  const v = `?v=${version}`
  return (
    <Field
      label="Site icon"
      path="brand.mark"
      htmlFor={inputId}
      hint="Upload one SVG and it becomes the header mark and every icon: the browser tab, home screens, the install icon, and the feed image. Square art with no text works best. Claude can do the same from chat with npm run icons."
    >
      <div className="space-y-5">
        {hasVector && (
          <div className="flex flex-wrap items-end gap-6">
            <Preview src={`/icon.svg${v}`} label="Tab, 16" size={16} />
            <Preview src={`/icon.svg${v}`} label="Tab, 32" size={32} />
            <Preview src={`/apple-touch-icon.png${v}`} label="iPhone" size={60} tile />
            <Preview src={`/icon-maskable-512.png${v}`} label="Android" size={60} round />
          </div>
        )}
        <label
          htmlFor={inputId}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void take(e.dataTransfer.files[0]) }}
          className={`flex cursor-pointer flex-col items-start gap-3 border border-dashed p-4 transition-colors ${dragging ? 'border-foreground bg-[var(--color-surface)]' : 'border-border'}`}
        >
          <span className={DESC}>Drop an SVG here, or choose one.</span>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={(e) => { e.preventDefault(); fileRef.current?.click() }}>
            {busy ? 'Making icons…' : 'Choose SVG…'}
          </Button>
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            accept=".svg,image/svg+xml"
            className="sr-only"
            onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }}
          />
        </label>
        {!hasVector && (
          <p className={DESC}>The current mark has no SVG to draw icons from, so the icons stay as they were. Upload one to make them match.</p>
        )}
        <p role="alert" className={`${DESC} text-[var(--color-accent)] ${error ? '' : 'sr-only'}`}>{error}</p>
        <p aria-live="polite" className={`${MONO} ${status ? '' : 'sr-only'}`}>{status}</p>
      </div>
    </Field>
  )
}

/** The tile behind the home-screen icons. Changing it rebuilds the set from the current mark. */
export function IconTileField() {
  const { snap, refresh } = useSettings()
  const id = useId()
  const value = snap.config.brand.iconBackground
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function commit(next: string): Promise<boolean> {
    setError(null)
    const result = await postIcon({ background: next })
    if (!result.ok) setError(result.error)
    await refresh()
    setDraft(null)
    return result.ok
  }

  // The picker fires on every drag step; redraw the icons once the color settles.
  function pick(next: string) {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void commit(next), 300)
  }

  return (
    <Field label="Icon tile" path="brand.iconBackground" htmlFor={id} hint="The square behind the home-screen and install icons (iOS and Android need an opaque tile). Changing it redraws the icons.">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border" style={{ backgroundColor: draft ?? value }}>
            <input
              type="color"
              aria-label="Icon tile picker"
              value={/^#[0-9a-f]{6}$/i.test(draft ?? value) ? (draft ?? value) : DEFAULTS.brand.iconBackground}
              onChange={(e) => pick(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </span>
          <InlineText id={id} value={draft ?? value} placeholder={DEFAULTS.brand.iconBackground} mono commit={(v) => commit(String(v ?? DEFAULTS.brand.iconBackground))} />
        </div>
        <p role="alert" className={`${DESC} text-[var(--color-accent)] ${error ? '' : 'sr-only'}`}>{error}</p>
      </div>
    </Field>
  )
}
