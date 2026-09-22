import { NextResponse } from 'next/server'
import { defineConfig } from '@/lib/site-config-schema'
import { ConfigPathError, applyChange, readConfig, toInput, writeConfig } from '@/lib/site-config-writer'
import { PRESET_IDS, applyPreset, type PresetId } from '@/lib/presets'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { loadSnapshot } from '@/app/settings/_lib/snapshot'

/* The settings API. Dev-only: every handler answers 404 outside `next dev`, and the proxy
   never lets the request this far anyway (src/proxy.ts). Nothing here is cached. */

export const dynamic = 'force-dynamic'

/** The full snapshot: resolved config, defaults, readouts, git state. */
export async function GET() {
  if (!isDev) return notAvailable()
  return NextResponse.json(await loadSnapshot())
}

/**
 * One change: `{ path, value }` sets a dotted config path (`value: null` clears it back to
 * its default); `{ preset }` applies one of src/lib/presets.ts. Both rewrite site.config.ts
 * and answer with the fresh snapshot.
 */
export async function PATCH(request: Request) {
  if (!isDev) return notAvailable()
  const body = (await request.json().catch(() => null)) as { path?: unknown; value?: unknown; preset?: unknown } | null
  if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 })

  try {
    const current = await readConfig()
    let next
    if (typeof body.preset === 'string') {
      if (!(PRESET_IDS as readonly string[]).includes(body.preset)) {
        return NextResponse.json({ error: `unknown preset: ${body.preset}` }, { status: 400 })
      }
      next = defineConfig(applyPreset(toInput(current), body.preset as PresetId))
    } else if (typeof body.path === 'string') {
      next = applyChange(current, body.path, body.value === undefined ? null : body.value)
    } else {
      return NextResponse.json({ error: 'path or preset required' }, { status: 400 })
    }
    writeConfig(next)
    return NextResponse.json(await loadSnapshot())
  } catch (err) {
    if (err instanceof ConfigPathError) return NextResponse.json({ error: err.message }, { status: 400 })
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
