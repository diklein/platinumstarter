/**
 * Live readouts for the Sources section: what each configured folder holds right now, read
 * with fs on the server ("9 posts, newest 3 days ago"). Never cached; the page is dev-only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { ROOT } from '@/lib/site-config-writer'
import type { SiteConfig } from '@/lib/site-config-schema'

export type SourceReadout = {
  key: keyof SiteConfig['sources']
  path: string
  exists: boolean
  /** "9 posts, newest 3 days ago" or "folder missing". */
  summary: string
}

const IMAGE = /\.(jpe?g|png|webp|avif|gif|heic|svg)$/i

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function ago(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${plural(months, 'month')} ago`
  return `${plural(Math.floor(days / 365), 'year')} ago`
}

function newestFrontmatterDate(dir: string, files: string[]): Date | null {
  let newest: Date | null = null
  for (const f of files) {
    try {
      const { data } = matter(readFileSync(join(dir, f), 'utf8'))
      const raw = data.date
      const d = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null
      if (d && !Number.isNaN(d.getTime()) && (!newest || d > newest)) newest = d
    } catch {
      /* unreadable file: skip */
    }
  }
  return newest
}

function newestMtime(dir: string, files: string[]): Date | null {
  let newest: Date | null = null
  for (const f of files) {
    const m = statSync(join(dir, f)).mtime
    if (!newest || m > newest) newest = m
  }
  return newest
}

function countFiles(dir: string, keep: (f: string) => boolean): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name), keep)
    else if (keep(entry.name)) n++
  }
  return n
}

export function sourceReadouts(sources: SiteConfig['sources']): SourceReadout[] {
  const out: SourceReadout[] = []
  const rows: Array<[keyof SiteConfig['sources'], string | undefined]> = [
    ['writing', sources.writing],
    ['designs', sources.designs],
    ['images', sources.images],
    ['photos', sources.photos],
  ]
  for (const [key, path] of rows) {
    if (!path) continue
    const dir = join(ROOT, path)
    if (!existsSync(dir)) {
      out.push({ key, path, exists: false, summary: 'folder missing' })
      continue
    }
    if (key === 'writing' || key === 'designs') {
      const files = readdirSync(dir).filter((f) => f.endsWith('.mdx'))
      const noun = key === 'writing' ? 'post' : 'case study'
      const newest = newestFrontmatterDate(dir, files)
      out.push({
        key,
        path,
        exists: true,
        summary: files.length ? `${plural(files.length, noun, key === 'writing' ? 'posts' : 'case studies')}, newest ${newest ? ago(newest) : 'undated'}` : `no ${noun}s yet`,
      })
      continue
    }
    const files = readdirSync(dir).filter((f) => IMAGE.test(f))
    const total = key === 'images' ? countFiles(dir, (f) => IMAGE.test(f)) : files.length
    const newest = newestMtime(dir, files)
    out.push({
      key,
      path,
      exists: true,
      summary: total ? `${plural(total, key === 'photos' ? 'photo' : 'image')}, newest ${newest ? ago(newest) : 'unknown'}` : `no ${key === 'photos' ? 'photos' : 'images'} yet`,
    })
  }
  return out
}
