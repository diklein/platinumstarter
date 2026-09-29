import { NextResponse } from 'next/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyChange, readConfig, writeConfig, ROOT } from '@/lib/site-config-writer'
import { IconSourceError, cleanSvg, markSource, renderIcons, writeIcons } from '@/lib/icons'
import { isDev, notAvailable } from '@/app/settings/_lib/guard'
import { loadSnapshot } from '@/app/settings/_lib/snapshot'

/* The site icon, from the Brand section of /settings. Dev-only like the rest of the settings
   API. It does what `npm run icons` does (src/lib/icons.ts is shared): an uploaded SVG is
   checked, saved as public/brand/mark.svg, made the header mark (brand.mark), and every icon
   size is written from it. With no `svg`, it rebuilds the set from the current mark, which is
   what a changed tile color needs. */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isDev) return notAvailable()
  const body = (await request.json().catch(() => null)) as { svg?: unknown; background?: unknown } | null
  if (!body) return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  if (body.background !== undefined && (typeof body.background !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(body.background))) {
    return NextResponse.json({ error: 'The tile color should be a hex color like #e8ecef.' }, { status: 400 })
  }

  try {
    let config = await readConfig()
    let source: string | null
    if (typeof body.svg === 'string') {
      source = cleanSvg(body.svg)
      mkdirSync(join(ROOT, 'public/brand'), { recursive: true })
      writeFileSync(join(ROOT, 'public/brand/mark.svg'), source)
      config = applyChange(config, 'brand.mark', '/brand/mark.svg')
    } else {
      source = markSource(ROOT, config.brand.mark)
      if (!source) throw new IconSourceError('The mark has no SVG to draw icons from. Upload one.')
    }
    if (typeof body.background === 'string') config = applyChange(config, 'brand.iconBackground', body.background)
    writeConfig(config)
    const files = writeIcons(ROOT, renderIcons(source, { background: config.brand.iconBackground }))
    return NextResponse.json({ files: files.map((f) => f.path), snapshot: await loadSnapshot() })
  } catch (err) {
    const status = err instanceof IconSourceError ? 400 : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status })
  }
}
