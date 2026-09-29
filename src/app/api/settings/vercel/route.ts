import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { ROOT } from '@/lib/site-config-writer'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 90_000

/**
 * The Domains section's hands: the Vercel CLI, run on the owner's machine where it is already
 * logged in after `vercel link`. Three operations, each a plain CLI call with the domain passed
 * as an argument (never through a shell):
 *   status   the linked project (.vercel/project.json) and `vercel whoami`
 *   add      `vercel domains add <domain> <project>`: attaches the domain and prints the DNS
 *            record to create at the registrar
 *   inspect  `vercel domains inspect <domain>`: what Vercel knows about it, including whether
 *            the DNS has resolved
 * Dev-only like the rest of /api/settings. The CLI's output is returned as text for the page to
 * show; nothing is parsed into promises the CLI did not make.
 */

export type VercelStatus = {
  linked: boolean
  projectName?: string
  loggedIn: boolean
  user?: string
  cli: 'local' | 'npx'
}
export type VercelResult = { ok: boolean; output: string }

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

function cli(): { cmd: string; prefix: string[]; kind: 'local' | 'npx' } {
  const local = join(ROOT, 'node_modules/.bin/vercel')
  if (existsSync(local)) return { cmd: local, prefix: [], kind: 'local' }
  return { cmd: 'npx', prefix: ['--yes', 'vercel@latest'], kind: 'npx' }
}

async function vercel(args: string[]): Promise<VercelResult> {
  const { cmd, prefix } = cli()
  try {
    const { stdout, stderr } = await execFileAsync(cmd, [...prefix, ...args], {
      cwd: ROOT,
      timeout: TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    return { ok: true, output: `${stdout}${stderr}`.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message || String(err) }
  }
}

function linkedProject(): { linked: boolean; projectName?: string } {
  const file = join(ROOT, '.vercel/project.json')
  if (!existsSync(file)) return { linked: false }
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as { projectName?: string }
    return { linked: true, projectName: json.projectName }
  } catch {
    return { linked: false }
  }
}

export async function POST(request: Request) {
  if (!isDev) return notAvailable()
  const body = (await request.json().catch(() => null)) as { op?: unknown; domain?: unknown } | null
  const op = body?.op
  if (op === 'status') {
    const who = await vercel(['whoami'])
    const user = who.ok ? who.output.split('\n').filter(Boolean).pop()?.trim() : undefined
    const status: VercelStatus = { ...linkedProject(), loggedIn: who.ok, user, cli: cli().kind }
    return NextResponse.json(status)
  }
  if (op === 'add' || op === 'inspect') {
    const domain = typeof body?.domain === 'string' ? body.domain.trim().toLowerCase() : ''
    if (!DOMAIN_RE.test(domain)) return NextResponse.json({ error: 'a domain name like yourname.com is required' }, { status: 400 })
    if (op === 'inspect') return NextResponse.json(await vercel(['domains', 'inspect', domain]))
    const { linked, projectName } = linkedProject()
    if (!linked || !projectName) return NextResponse.json({ error: 'this folder is not linked to a Vercel project yet; run npx vercel link first' }, { status: 400 })
    return NextResponse.json(await vercel(['domains', 'add', domain, projectName]))
  }
  return NextResponse.json({ error: 'op must be status, add, or inspect' }, { status: 400 })
}
