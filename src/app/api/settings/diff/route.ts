import { NextResponse } from 'next/server'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { diffFile, dirtyFiles } from '@/app/settings/_lib/git'

export const dynamic = 'force-dynamic'

/** The Review panel: every dirty writable file with its unified diff against HEAD. */
export async function GET() {
  if (!isDev) return notAvailable()
  const dirty = await dirtyFiles()
  const files = await Promise.all(dirty.map(async (d) => ({ ...d, diff: await diffFile(d.file) })))
  return NextResponse.json({ files })
}
