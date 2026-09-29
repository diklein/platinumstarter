#!/usr/bin/env node
/**
 * Export the site's content in the shape the importers read, so leaving is as easy as arriving.
 *
 *   npm run export                       a zip in ~/Downloads (or beside the repo)
 *   npm run export -- --out ~/my-words   a folder instead
 *   npm run export -- --drafts           include src/content/writing/drafts/
 *
 * The site IS the export already (a folder of Markdown in git); this command makes a copy a
 * different tool can read without knowing this repository's layout:
 *
 *   writing/<slug>/index.md      one page bundle per post: the frontmatter as written, the
 *                                body with image paths made relative, the images beside it
 *   designs/<slug>/index.md      case studies, the same way
 *   photos/                      public/images/photos as it is
 *   site.config.ts               the one file identity lives in
 *   README.txt                   what is in here and how to bring it back
 *
 * A Hugo page bundle is what `scripts/import/markdown.mjs` (and Hugo, Astro, Eleventy, Obsidian)
 * read; the round trip back into a Platinum site is
 * `node scripts/import/markdown.mjs --src <the zip> --dry-run`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const value = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] ?? null }
if (flag('--help')) {
  console.log('usage: npm run export -- [--out <folder | file.zip>] [--drafts]')
  process.exit(0)
}

const site = (await import(path.join(ROOT, 'site.config.ts'))).default
const name = String(site.identity?.name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'
const stamp = new Date().toISOString().slice(0, 10)
const downloads = path.join(os.homedir(), 'Downloads')
const defaultOut = path.join(existsSync(downloads) ? downloads : path.dirname(ROOT), `${name}-export-${stamp}.zip`)
const OUT = path.resolve(value('--out') ?? defaultOut)
const asZip = OUT.endsWith('.zip')
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) {
  console.error(`refusing to export into the repository itself: ${OUT}`)
  process.exit(2)
}

const WRITING = path.join(ROOT, site.sources?.writing ?? 'src/content/writing')
const DESIGNS = path.join(ROOT, 'src/content/designs')
const PUBLIC = path.join(ROOT, 'public')
const stage = asZip ? path.join(os.tmpdir(), `platinum-export-${process.pid}`) : OUT
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// Images and files a body references: absolute site paths (/images/..., /videos/..., /files/...)
// and the repo-relative form some posts use (../../../public/images/...).
const REF_RE = /(!?\[[^\]]*\]\(<?)((?:\.\.\/)*public\/|\/)((?:images|videos|img|files)\/[^)\s">]+)(>?(?:\s+"(?:[^"\\]|\\.)*")?\))/g

let posts = 0
let media = 0
let missing = 0

function exportBundle(file, outDir, slugFallback) {
  const raw = readFileSync(file, 'utf-8')
  const { data, content } = matter(raw)
  const slug = String(data.slug || slugFallback)
  const dir = path.join(outDir, slug)
  mkdirSync(dir, { recursive: true })
  const body = content.replace(REF_RE, (m, open, _prefix, sitePath, close) => {
    const src = path.join(PUBLIC, sitePath)
    if (!existsSync(src)) { missing++; console.warn(`  missing: /${sitePath} (referenced by ${path.relative(ROOT, file)})`); return m }
    const base = path.basename(sitePath)
    cpSync(src, path.join(dir, base))
    media++
    return `${open}./${base}${close}`
  })
  // The frontmatter as written, minus the example flag (it means nothing outside this repo),
  // with a lead image copied beside the file like the body's images.
  const fm = { ...data }
  delete fm.example
  if (typeof fm.image === 'string' && /^\/(images|videos|img|files)\//.test(fm.image)) {
    const src = path.join(PUBLIC, fm.image)
    if (existsSync(src)) { cpSync(src, path.join(dir, path.basename(fm.image))); media++; fm.image = `./${path.basename(fm.image)}` }
  }
  writeFileSync(path.join(dir, 'index.md'), matter.stringify(body, fm))
  posts++
}

function mdxFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mdx') && !f.startsWith('_')).map((f) => path.join(dir, f)) : []
}

console.log(`exporting ${site.identity?.name ?? 'the site'} to ${OUT}`)

for (const f of mdxFiles(WRITING)) exportBundle(f, path.join(stage, 'writing'), path.basename(f, '.mdx'))
if (flag('--drafts')) {
  for (const f of mdxFiles(path.join(WRITING, 'drafts'))) exportBundle(f, path.join(stage, 'writing', 'drafts'), path.basename(f, '.mdx'))
}
for (const f of mdxFiles(DESIGNS)) exportBundle(f, path.join(stage, 'designs'), path.basename(f, '.mdx'))

const photos = path.join(PUBLIC, 'images/photos')
let photoCount = 0
if (existsSync(photos)) {
  cpSync(photos, path.join(stage, 'photos'), { recursive: true })
  photoCount = readdirSync(photos).filter((f) => statSync(path.join(photos, f)).isFile()).length
}
cpSync(path.join(ROOT, 'site.config.ts'), path.join(stage, 'site.config.ts'))

writeFileSync(path.join(stage, 'README.txt'), `${site.identity?.name ?? 'This site'}: content export, ${stamp}

writing/<slug>/index.md   one folder per post: frontmatter (title, date, slug, type, tags,
                          description) and the body in Markdown, with its images beside it
designs/<slug>/index.md   case studies, the same way
photos/                   the photo library as files
site.config.ts            the site's settings (no secrets are ever in it)

Every folder is a Hugo-style page bundle. Hugo, Astro, Eleventy, Obsidian, and most static
site tools read it as is. To bring it back into a Platinum site:

  node scripts/import/markdown.mjs --src <this folder or zip> --dry-run
  node scripts/import/markdown.mjs --src <this folder or zip>

Posts are plain Markdown apart from a few MDX components (slideshows, product cards, video)
that other tools will show as literal tags; the images and words are all here.
`)

if (asZip) {
  const AdmZip = createRequire(import.meta.url)('adm-zip')
  const zip = new AdmZip()
  zip.addLocalFolder(stage)
  mkdirSync(path.dirname(OUT), { recursive: true })
  zip.writeZip(OUT)
  rmSync(stage, { recursive: true, force: true })
}

console.log(`${posts} pages, ${media} media files, ${photoCount} photos${missing ? `, ${missing} referenced files missing` : ''} → ${OUT}`)
