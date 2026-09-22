'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { VercelResult, VercelStatus } from '@/app/api/settings/vercel/route'
import { DESC, MONO, NAME, SettingsSection } from './primitives'

/* Domains: the one thing about the deployed site that is not in site.config.ts, because it
   does not need to be. The canonical URL follows the Vercel project's production domain, so
   attaching a domain is the whole job. The section runs the Vercel CLI on this machine (logged
   in after `vercel link`) through /api/settings/vercel and shows what it says, DNS record
   included. Development only, like everything on this page. */

async function post<T>(body: Record<string, unknown>): Promise<T | { error: string }> {
  const res = await fetch('/api/settings/vercel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await res.json()) as T | { error: string }
}

export function DomainsSection() {
  const [status, setStatus] = useState<VercelStatus | null>(null)
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState<'add' | 'inspect' | null>(null)
  const [result, setResult] = useState<{ label: string; ok: boolean; output: string } | null>(null)

  useEffect(() => {
    post<VercelStatus>({ op: 'status' }).then((s) => { if (!('error' in s)) setStatus(s) }).catch(() => {})
  }, [])

  const run = async (op: 'add' | 'inspect') => {
    setBusy(op)
    setResult(null)
    try {
      const r = await post<VercelResult>({ op, domain })
      if ('error' in r) setResult({ label: op, ok: false, output: r.error })
      else setResult({ label: op, ok: r.ok, output: r.output })
    } catch (err) {
      setResult({ label: op, ok: false, output: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  const ready = Boolean(status?.linked && status?.loggedIn)
  const valid = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain.trim())

  return (
    <SettingsSection
      id="domains"
      title="Domain"
      lead="The site's URL follows the Vercel project: the .vercel.app address first, then a custom domain the moment one is attached, with nothing to change in site.config.ts. Attach one here; Vercel prints the DNS record to create at your registrar."
    >
      <div className="flex flex-col gap-6 py-7">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2">
          <dt className={MONO}>project</dt>
          <dd className={DESC}>{status === null ? 'checking' : status.linked ? status.projectName ?? 'linked' : 'not linked: run npx vercel link in this folder'}</dd>
          <dt className={MONO}>vercel cli</dt>
          <dd className={DESC}>{status === null ? 'checking (the first check downloads the Vercel CLI)' : status.loggedIn ? `logged in${status.user ? ` as ${status.user}` : ''}` : 'not logged in: run npx vercel login'}</dd>
        </dl>

        <div className="flex flex-col gap-3">
          <label htmlFor="domain-name" className={NAME}>Custom domain</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="domain-name"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="yourname.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="h-9 w-full max-w-xs border border-border bg-transparent px-3 font-mono text-[0.875rem] text-foreground outline-none focus-visible:border-foreground"
            />
            <Button variant="default" size="sm" onClick={() => run('add')} disabled={!ready || !valid || busy !== null}>
              {busy === 'add' ? 'Attaching' : 'Attach to this project'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => run('inspect')} disabled={!status?.loggedIn || !valid || busy !== null}>
              {busy === 'inspect' ? 'Checking' : 'Check DNS'}
            </Button>
          </div>
          <p className={DESC}>
            Attach adds the domain to the project and prints the record to create (an A record for the
            apex, a CNAME for www). Check DNS asks Vercel whether it has resolved yet. The next deploy
            after that carries the domain in every URL.
          </p>
        </div>

        {result && (
          <div role="status" className="flex flex-col gap-2">
            <span className={`${MONO} ${result.ok ? '' : 'text-[var(--color-accent)]'}`}>{result.label}: {result.ok ? 'done' : 'failed'}</span>
            <pre className="max-h-72 overflow-auto border border-border bg-[var(--color-surface-subtle)] p-4 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap">{result.output}</pre>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
