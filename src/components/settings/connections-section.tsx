'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@/app/settings/_lib/connections'
import type { TestResult } from '@/app/api/settings/test/route'
import { useSettings } from './store'
import { DESC, MONO, NAME, SettingsSection } from './primitives'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

/* Connections: one status card per environment variable the code reads. Presence only; the
   value never leaves the server. Test runs the private smoke script when this checkout has
   one, and says so plainly when it does not. */

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch { /* clipboard unavailable */ }
      }}
      title="Copy"
      className="group/copy flex w-full cursor-pointer items-center justify-between gap-3 bg-[var(--color-surface-subtle)] px-3 py-2 text-left font-mono text-[0.75rem] text-foreground"
    >
      <span className="truncate">{text}</span>
      {copied ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-accent)]" /> : <Copy aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-muted)] opacity-60 transition-opacity group-hover/copy:opacity-100" />}
      <span className="sr-only">{copied ? 'Copied' : 'Copy command'}</span>
    </button>
  )
}

function ConnectionCard({ c }: { c: ConnectionStatus }) {
  const [state, setState] = useState<{ running: boolean; result?: TestResult }>({ running: false })
  const test = async () => {
    setState({ running: true })
    try {
      const res = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
      const result = (await res.json()) as TestResult
      setState({ running: false, result })
    } catch (err) {
      setState({ running: false, result: { available: true, ok: false, kind: 'network', message: err instanceof Error ? err.message : String(err) } })
    }
  }
  const r = state.result
  const verdict = !r ? null : !r.available ? 'Test not available in this build' : r.ok ? `OK${r.detail ? `: ${r.detail}` : ''}` : `${r.kind}: ${r.message}`
  return (
    <Card className="gap-5 rounded-none border-border bg-transparent py-5 shadow-none">
      <CardHeader className="gap-1 px-5">
        <CardTitle className={NAME}>{c.name}</CardTitle>
        <CardDescription className={MONO}>{c.env}</CardDescription>
        {/* Only a connected key gets a badge: an absent one is the normal state for most
            owners, not something they did wrong. */}
        {c.present && (
          <CardAction>
            <Badge variant="outline" className={`${MONO} gap-1.5 rounded-none border-border px-2.5 py-1 font-normal`}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-accent)]" />
              connected
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">
        <ul className={`${DESC} max-w-none list-disc space-y-1 pl-4`}>
          {c.unlocks.map((u) => <li key={u}>{u}</li>)}
        </ul>
        <CopyLine text={`vercel env add ${c.env}`} />
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 rounded-none px-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={test} disabled={state.running || !c.testable}>
            {state.running ? 'Testing' : 'Test'}
          </Button>
          <a href={c.docs} target="_blank" rel="noopener noreferrer" className={`${MONO} accent-link`}>get a key</a>
        </div>
        {!c.testable && !r && <span className={MONO}>Test not available in this build</span>}
        {verdict && <span role="status" className={`${MONO} ${r && r.available && !r.ok ? 'text-[var(--color-accent)]' : ''}`}>{verdict}</span>}
      </CardFooter>
    </Card>
  )
}

export function ConnectionsSection() {
  const { snap } = useSettings()
  return (
    <SettingsSection id="connections" title="Connections" lead="Every environment variable the code reads, and what having it unlocks. None is required. The agent you write with usually comes with one of the first three keys: Claude Code with Anthropic, Codex with OpenAI, anything else through the Vercel AI Gateway. Keys live in .env.local (and on Vercel); this page only ever sees whether one is set.">
      <div className="flex flex-col gap-4 pt-8">
        {snap.connections.map((c) => <ConnectionCard key={c.id} c={c} />)}
      </div>
    </SettingsSection>
  )
}
