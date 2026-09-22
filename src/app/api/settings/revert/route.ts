import { NextResponse } from 'next/server'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { revertFile } from '@/app/settings/_lib/git'
import { loadSnapshot } from '@/app/settings/_lib/snapshot'

export const dynamic = 'force-dynamic'

/** `git checkout HEAD -- <file>` for one writable file; answers with the fresh snapshot. */
export async function POST(request: Request) {
  if (!isDev) return notAvailable()
  const body = (await request.json().catch(() => null)) as { file?: unknown } | null
  if (!body || typeof body.file !== 'string') return NextResponse.json({ error: 'file required' }, { status: 400 })
  try {
    await revertFile(body.file)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
  return NextResponse.json(await loadSnapshot())
}
