#!/usr/bin/env node
/**
 * The site icon: favicon, home-screen and install icons, the RSS image, and the mark downloads,
 * all generated from one SVG (src/lib/icons.ts has the list and the reasons).
 *
 *   npm run icons                          rebuild the set from the current mark (brand.mark)
 *   npm run icons -- path/to/logo.svg      make that SVG the site's mark AND its icon
 *   npm run icons -- logo.svg --background "#101418"   ...on a tile of that color
 *
 * With a file, the SVG is checked (no scripts, outside links, or live text), copied to
 * public/brand/mark.svg, and site.config.ts gets `brand.mark: '/brand/mark.svg'` (plus
 * `brand.iconBackground` when given), so the header and the icons are the same drawing. The
 * /settings Brand section's upload runs the same code. Commit the files it lists; nothing is
 * generated at build time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyChange, readConfig, writeConfig, ROOT } from '../src/lib/site-config-writer.ts'
import { IconSourceError, cleanSvg, markSource, renderIcons, writeIcons } from '../src/lib/icons.ts'

const args = process.argv.slice(2)
const bgAt = args.indexOf('--background')
const background = bgAt >= 0 ? args[bgAt + 1] : undefined
const file = args.find((a, i) => !a.startsWith('--') && i !== bgAt + 1)

if (background !== undefined && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background)) {
  console.error(`--background wants a hex color like #e8ecef; got ${background ?? 'nothing'}.`)
  process.exit(1)
}

try {
  let config = await readConfig()
  let source

  if (file) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) throw new IconSourceError(`No file at ${file}.`)
    if (!/\.svg$/i.test(path)) throw new IconSourceError('The icon has to be an SVG: every size is drawn from the vector. Export an SVG from your design tool.')
    source = cleanSvg(readFileSync(path, 'utf8'))
    mkdirSync(resolve(ROOT, 'public/brand'), { recursive: true })
    writeFileSync(resolve(ROOT, 'public/brand/mark.svg'), source)
    config = applyChange(config, 'brand.mark', '/brand/mark.svg')
  } else {
    source = markSource(ROOT, config.brand.mark)
    if (!source) {
      throw new IconSourceError(
        config.brand.mark === 'wordmark'
          ? 'The mark is the wordmark (the name as text), which has no drawing to make icons from. Give an SVG: npm run icons -- path/to/logo.svg'
          : `The mark (${config.brand.mark}) is not an SVG under public/. Give an SVG: npm run icons -- path/to/logo.svg`,
      )
    }
  }

  if (background) config = applyChange(config, 'brand.iconBackground', background)
  if (file || background) writeConfig(config)

  const written = writeIcons(ROOT, renderIcons(source, { background: config.brand.iconBackground }))
  if (file) console.log(`public/brand/mark.svg              the mark (header and icons), brand.mark updated`)
  for (const f of written) console.log(`${f.path.padEnd(34)} ${f.note}`)
  console.log('\nCommit these files; the icons are static and nothing regenerates them at build time.')
} catch (err) {
  console.error(err instanceof IconSourceError ? err.message : err)
  process.exit(1)
}
