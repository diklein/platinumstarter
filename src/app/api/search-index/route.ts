import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getAllPosts, getPostPlainText, contentToPlainText, extractHeadings } from '@/lib/posts'
import { DESIGNS } from '@/lib/designs'

/** H2/H3 anchors for the palette's heading deep links — the same extractHeadings the
 *  TOC uses, so the emitted slugs provably match the rendered rehype-slug ids.
 *  Takes the RAW FILE TEXT, not a path: every fs read in this route must stay a literal
 *  `readFileSync(path.join(process.cwd(), '<const dir>', …))` call site — a directory
 *  passed as a parameter is exactly the indirection that makes Next's file tracer glob
 *  the whole repo into this function (see deploy-verify: the 250MB/1.14GB incidents). */
function headingsOf(raw: string | null): { text: string; slug: string }[] {
  if (!raw) return []
  return extractHeadings(matter(raw).content).map(({ text, slug }) => ({ text, slug }))
}

// Pre-rendered at build time — served as a static asset from CDN
export const dynamic = 'force-static'

export async function GET() {
  const posts = getAllPosts().map((p) => {
    let raw: string | null = null
    try {
      raw = fs.readFileSync(path.join(process.cwd(), 'src/content/writing', `${p.slug}.mdx`), 'utf-8')
    } catch {
      /* headings stay empty if the file is missing */
    }
    return {
      slug: p.slug,
      href: `/writing/${p.slug}`,
      content: getPostPlainText(p.slug),
      headings: headingsOf(raw),
    }
  })
  // Design case-study bodies too, INCLUDING password-protected ones — an explicit
  // call (2026-07-22), tradeoff understood: this JSON is a public asset, so the protected
  // text is readable by anyone who fetches it directly. The point of the gate here is the
  // page experience: search matches against the full text, and the click lands on the
  // password UI. Do not "fix" this by filtering passwordProtected.
  const designs = DESIGNS.map((d) => {
    let content = ''
    let raw: string | null = null
    try {
      raw = fs.readFileSync(path.join(process.cwd(), 'src/content/designs', `${d.slug}.mdx`), 'utf-8')
      content = contentToPlainText(matter(raw).content)
    } catch {
      /* body stays empty if the file is missing */
    }
    return { slug: `designs/${d.slug}`, href: `/designs/${d.slug}`, content, headings: headingsOf(raw) }
  })
  return NextResponse.json([...posts, ...designs], {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}
