'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { SettingsSnapshot } from '@/app/settings/_lib/snapshot'
import type { PresetId } from '@/lib/presets'

/**
 * The settings state: one snapshot (config + defaults + readouts + git state), replaced
 * wholesale by whatever the API answers. There is no save button and no local draft: every
 * control calls `patch` the moment it changes, the server rewrites site.config.ts, and the
 * fresh snapshot comes back. Git is the real save layer (see the dirty strip).
 */
type Store = {
  snap: SettingsSnapshot
  /** Set one dotted config path. `null` clears it back to its default. */
  patch: (path: string, value: unknown) => Promise<boolean>
  applyPreset: (id: PresetId) => Promise<boolean>
  revert: (file: string) => Promise<boolean>
  refresh: () => Promise<void>
  /** Number of requests in flight. */
  pending: number
}

const Ctx = createContext<Store | null>(null)

async function call(url: string, init: RequestInit): Promise<SettingsSnapshot> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = (await res.json().catch(() => null)) as (SettingsSnapshot & { error?: string }) | null
  if (!res.ok || !body || body.error) throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  return body
}

export function SettingsProvider({ initial, children }: { initial: SettingsSnapshot; children: React.ReactNode }) {
  const [snap, setSnap] = useState(initial)
  const [pending, setPending] = useState(0)

  const run = useCallback(async (label: string, work: () => Promise<SettingsSnapshot>) => {
    setPending((n) => n + 1)
    try {
      setSnap(await work())
      return true
    } catch (err) {
      toast.error(`${label} failed`, { description: err instanceof Error ? err.message : String(err) })
      return false
    } finally {
      setPending((n) => n - 1)
    }
  }, [])

  const patch = useCallback(
    (path: string, value: unknown) =>
      run(`Saving ${path}`, () => call('/api/settings', { method: 'PATCH', body: JSON.stringify({ path, value }) })),
    [run],
  )
  const applyPreset = useCallback(
    (preset: PresetId) => run(`Applying the ${preset} preset`, () => call('/api/settings', { method: 'PATCH', body: JSON.stringify({ preset }) })),
    [run],
  )
  const revert = useCallback(
    (file: string) => run(`Reverting ${file}`, () => call('/api/settings/revert', { method: 'POST', body: JSON.stringify({ file }) })),
    [run],
  )
  const refresh = useCallback(async () => {
    await run('Refreshing', () => call('/api/settings', { method: 'GET' }))
  }, [run])

  const value = useMemo(() => ({ snap, patch, applyPreset, revert, refresh, pending }), [snap, patch, applyPreset, revert, refresh, pending])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): Store {
  const store = useContext(Ctx)
  if (!store) throw new Error('useSettings needs a SettingsProvider')
  return store
}
