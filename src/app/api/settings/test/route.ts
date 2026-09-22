import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { CONNECTIONS, smokePath } from '@/app/settings/_lib/connections'
import { ROOT } from '@/lib/site-config-writer'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 30_000

export type TestResult =
  | { available: false }
  | { available: true; ok: true; detail?: string }
  | { available: true; ok: false; kind: string; message: string }

/**
 * The Connections "Test" button: runs qa/smoke/<id>.mjs with the server's environment in a
 * child Node process (the same way qa/run.mjs does) and reports the SmokeError kind on
 * failure. The smoke scripts are private tooling that the public template does not ship,
 * so a missing script is `available: false`, never an error.
 */
export async function POST(request: Request) {
  if (!isDev) return notAvailable()
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const connection = CONNECTIONS.find((c) => c.id === body?.id)
  if (!connection) return NextResponse.json({ error: 'unknown connection' }, { status: 400 })

  const file = smokePath(connection.id)
  if (!existsSync(file)) return NextResponse.json({ available: false } satisfies TestResult)
  if (!process.env[connection.env]?.trim()) {
    return NextResponse.json({ available: true, ok: false, kind: 'missing-key', message: `${connection.env} is not set` } satisfies TestResult)
  }

  const script = [
    'process.removeAllListeners("warning")',
    `const m = await import(${JSON.stringify(pathToFileURL(file).href)})`,
    'const out = (r) => process.stdout.write("\\n@@" + JSON.stringify(r))',
    'try { const r = await m.run(process.env); out({ ok: true, detail: r?.detail }) }',
    'catch (e) { out({ ok: false, kind: e?.kind ?? "error", message: e?.message ?? String(e) }) }',
  ].join('\n')

  try {
    const { stdout } = await execFileAsync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
      cwd: ROOT,
      timeout: TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    })
    const marker = stdout.lastIndexOf('\n@@')
    if (marker === -1) throw new Error('the smoke test produced no result')
    const result = JSON.parse(stdout.slice(marker + 3)) as { ok: true; detail?: string } | { ok: false; kind: string; message: string }
    const out: TestResult = result.ok ? { available: true, ok: true, detail: result.detail } : { available: true, ...result }
    return NextResponse.json(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const kind = /timed out|ETIMEDOUT|killed/i.test(message) ? 'network' : 'error'
    return NextResponse.json({ available: true, ok: false, kind, message } satisfies TestResult)
  }
}
