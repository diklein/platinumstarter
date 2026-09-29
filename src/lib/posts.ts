import readingTime from 'reading-time'
import matter from 'gray-matter'
import fs from 'fs'
import path from 'path'
import GithubSlugger from 'github-slugger'

export interface Post {
  slug: string
  title?: string  // omit for photo-only and note-only posts
  date: string    // ISO 8601 from frontmatter
  type: 'article' | 'photo' | 'note' | 'link'
  description?: string  // hand-crafted or AI-generated SEO meta description (150-160 chars)
  excerpt?: string
  body?: string   // full plain text for notes, shown untruncated in feed
  image?: string  // cover image URL, used in homepage feed without loading MDX
  tags?: string[]
  toc?: boolean   // opt-in: show table of contents sidebar on long posts
  imageBorders?: boolean  // opt-in: subtle border around images (posts of white-edged slides/screenshots)
  example?: boolean  // template example content; `npm run clear-examples` removes files that set it
  scheduled?: boolean  // dated after today: hidden from production until the date (dev and preview show it)
}

/**
 * Today as a `YYYY-MM-DD` UTC calendar date, the same clock `formatDate` renders with.
 * `PLATINUM_TODAY` overrides it so the scheduled-posts test can build "yesterday" and then
 * start the server "today"; nothing else sets it.
 */
export function todayUtc(): string {
  return process.env.PLATINUM_TODAY || new Date().toISOString().slice(0, 10)
}

/**
 * Scheduling is the date: a post dated after today is a scheduled post. Production hides it
 * (list, feed, sitemap, search, its own URL) until the date; a daily cron then revalidates the
 * cached pages so it appears without a push (`/api/cron/scheduled-posts`). Development and
 * preview deployments show scheduled posts so the owner can read them before they go out.
 */
function hideScheduled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'
}

export interface TocItem {
  depth: 2 | 3
  text: string
  slug: string
}

export interface RelatedPost {
  slug: string
  title: string
  similarity?: number
}

export function extractHeadings(content: string): TocItem[] {
  const slugger = new GithubSlugger()
  // Headings inside MDX comments ({/* ... */}) are hidden from the rendered
  // post, so they must not surface in the TOC either.
  const visible = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const pattern = /^(#{2,3})\s+(.+)$/gm
  const headings: TocItem[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(visible)) !== null) {
    const depth = match[1].length as 2 | 3
    const text = match[2].trim()
    headings.push({ depth, text, slug: slugger.slug(text) })
  }
  return headings
}

/**
 * Derive a short excerpt from the first paragraph of MDX content.
 * Strips leading heading markers, trims, and caps at 200 chars.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')  // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links → link text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')   // reference links → text
    .replace(/!\[\]\[[^\]]*\]/g, '')             // empty-alt reference images → remove
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // bold
    .replace(/__([^_]+)__/g, '$1')               // bold (underscore)
    .replace(/\*([^*]+)\*/g, '$1')               // italic
    .replace(/_([^_]+)_/g, '$1')                 // italic (underscore)
    .replace(/`([^`]+)`/g, '$1')                 // inline code
    .replace(/~~([^~]+)~~/g, '$1')               // strikethrough
    .trim()
}

/** MDX body → readable plain text: strips JSX/MDX tags, import/export lines, and
 *  markdown syntax. Used by getPostPlainText. */
export function contentToPlainText(content: string): string {
  return content
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')      // MDX comments — hidden content must not reach search bodies or word counts
    .replace(/<[A-Za-z][^>]*\/>/g, '')         // self-closing JSX/MDX tags
    .replace(/<[A-Za-z][^>]*>[\s\S]*?<\/[A-Za-z][^>]*>/g, ' ')  // JSX/MDX elements
    .replace(/^import\s.+$/gm, '')              // MDX import statements
    .replace(/^export\s.+$/gm, '')              // MDX export statements
    .split(/\n\n+/)
    .map((block) => stripMarkdown(block.replace(/^#{1,6}\s+/, '')))
    .filter(Boolean)
    .join(' ')
}

// Raw MDX source by slug, shared by every consumer that needs the body after
// getAllPosts() has run (plain text, lead image, reading time, feed HTML, stats).
// Memoized in production only: content is immutable there, while `next dev`
// must re-read per request so edits show up without a restart.
const sourceCache = new Map<string, string | null>()

function readPostSource(slug: string): string | null {
  // Two literal readFileSync call sites, deliberately NOT a loop over candidate
  // paths: Next's file tracer can only resolve fs paths it can statically
  // evaluate. A loop variable made the read fully dynamic, so the tracer globbed
  // the ENTIRE repo (Misc/, bezels/, ...) into every function importing this
  // module — /api/md hit 360MB and the deploy failed (2026-08-25).
  const dir = path.join(process.cwd(), 'src/content/writing')
  try {
    return fs.readFileSync(path.join(dir, `${slug}.mdx`), 'utf-8')
  } catch {}
  // Dev drafts live one directory down (see getAllPosts).
  try {
    return fs.readFileSync(path.join(dir, 'drafts', `${slug}.mdx`), 'utf-8')
  } catch {}
  return null
}

export function getPostSource(slug: string): string | null {
  if (process.env.NODE_ENV !== 'production') return readPostSource(slug)
  if (!sourceCache.has(slug)) sourceCache.set(slug, readPostSource(slug))
  return sourceCache.get(slug)!
}

export function getPostPlainText(slug: string): string {
  const raw = getPostSource(slug)
  return raw === null ? '' : contentToPlainText(matter(raw).content)
}

/**
 * Convert a content image reference to a site-absolute path. Body images are
 * authored as repo-relative paths (../../../public/images/...) that map to
 * /images/... once served. Passes through http(s) URLs and already-absolute paths.
 */
function normalizeContentImage(src: string): string | null {
  if (/^https?:\/\//.test(src)) return src
  const i = src.indexOf('/public/')
  if (i !== -1) return src.slice(i + '/public'.length)
  if (src.startsWith('/')) return src
  return null
}

/**
 * The post's lead image as a site-absolute path (e.g. "/images/writing/foo/01.jpg")
 * or full URL, or null when the post has no image. Prefers a frontmatter `image:`,
 * otherwise the first markdown image in the body. Lets OG/Twitter cards show the
 * post's own image instead of the generated text card.
 */
function leadImageFromRaw(raw: string | null): string | null {
  if (raw === null) return null
  const { data, content } = matter(raw)
  const candidate =
    (typeof data.image === 'string' && data.image) ||
    content.match(/!\[[^\]]*\]\(([^)\s]+)/)?.[1]
  return candidate ? normalizeContentImage(candidate) : null
}

export function getPostLeadImage(slug: string): string | null {
  return leadImageFromRaw(getPostSource(slug))
}

export function getDesignLeadImage(slug: string): string | null {
  try {
    return leadImageFromRaw(fs.readFileSync(path.join(process.cwd(), 'src/content/designs', `${slug}.mdx`), 'utf-8'))
  } catch {
    return null
  }
}

function deriveBody(content: string): string {
  return content
    .replace(/<[A-Za-z][^>]*\/>/g, '')
    .replace(/<[A-Za-z][^>]*>[\s\S]*?<\/[A-Za-z][^>]*>/g, ' ')
    .replace(/^import\s.+$/gm, '')
    .replace(/^export\s.+$/gm, '')
    .split(/\n\n+/)
    .map((block) => stripMarkdown(block.replace(/^#{1,6}\s+/, '')))
    .filter(Boolean)
    .join('\n\n')
}

function deriveExcerpt(content: string): string {
  const paragraphs = content.split(/\n\n+/)
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    // Skip headings, images, horizontal rules, reference definitions, MDX-specific
    // blocks (imports/exports and JSX component tags), and LINK-ONLY paragraphs —
    // a bare [Title](url) line strips down to the post's own title, which made the
    // link-post excerpts read as the title with an ellipsis (2026-08-25).
    // Blockquotes are NOT skipped: link posts open on the source's pull-quote, and
    // that quote is the excerpt (same day) — the '>' markers strip off.
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('!') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('<') ||
      /^\[[^\]]+\]:\s/.test(trimmed) ||
      /^\[[^\]]+\]\([^)]*\)$/.test(trimmed)
    ) continue
    const unquoted = trimmed
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
    const text = stripMarkdown(unquoted.replace(/^#+\s*/, ''))
    if (text.length > 0) {
      const truncated = text.length > 200 ? text.slice(0, 200).replace(/\s\S*$/, '') : text
      return truncated.replace(/\.$/, '') + '…'
    }
  }
  return ''
}

// Production-only memo (same rationale as sourceCache): every article page calls
// this five times (params, metadata, post, enriched, related), so an unmemoized
// build re-parsed all ~161 MDX files per call — ~130k reads across a full build.
// Keyed by the UTC day: a function instance that lives across midnight must see the post that
// just became due when the cron revalidates a page it renders.
let postsCache: { day: string; posts: Post[] } | null = null

export function getAllPosts(): Post[] {
  if (process.env.NODE_ENV !== 'production') return loadAllPosts()
  const day = todayUtc()
  if (postsCache?.day !== day) postsCache = { day, posts: loadAllPosts() }
  return postsCache.posts
}

/** Every post on disk, scheduled ones included, read fresh. The cron route uses it. */
export function getAllPostsIncludingScheduled(): Post[] {
  return loadAllPosts({ includeScheduled: true })
}

function loadAllPosts({ includeScheduled = !hideScheduled() }: { includeScheduled?: boolean } = {}): Post[] {
  const dir = path.join(process.cwd(), 'src/content/writing')

  // WR-05: return empty array when content directory doesn't exist yet
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'))

  // Dev-only drafts lane: local drafts render at their real URL while writing (list pages
  // included, which is the point — see the post in situ). Production builds never see them:
  // the folder is gitignored, so this branch reads an empty dir even before the env check.
  const draftsDir = path.join(dir, 'drafts')
  if (process.env.NODE_ENV !== 'production' && fs.existsSync(draftsDir)) {
    // Underscore-prefixed files are scaffolding (the shipped _placeholder.mdx), never drafts.
    files.push(...fs.readdirSync(draftsDir).filter((f) => f.endsWith('.mdx') && !f.startsWith('_')).map((f) => path.join('drafts', f)))
  }

  const today = todayUtc()
  const posts: Post[] = files
    .map((filename) => {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf-8')
      const { data, content } = matter(raw)

      // CR-03: validate required fields before accepting the post
      if (!data.slug || !data.date || !data.type) {
        console.warn(`posts.ts: skipping ${filename} — missing required frontmatter fields`)
        return null
      }

      // CR-03: coerce date to string — gray-matter / js-yaml parses unquoted
      // YAML dates (e.g. `date: 2024-10-28`) as JavaScript Date objects, which
      // lack .localeCompare() and crash the sort below.
      const date =
        typeof data.date === 'string'
          ? data.date
          : new Date(data.date as Date).toISOString().slice(0, 10)

      const post: Post = {
        ...(data as Omit<Post, 'excerpt' | 'date' | 'body' | 'tags'>),
        date,
        tags: (data.tags as string[] | undefined)?.map((t) => t.toLowerCase()),
        excerpt: deriveExcerpt(content),
        ...(data.type === 'note' ? { body: deriveBody(content) } : {}),
        ...(date > today ? { scheduled: true } : {}),
      }
      return post
    })
    .filter((p): p is Post => p !== null && (includeScheduled || !p.scheduled))

  // Sort newest-first
  return posts.sort((a, b) => b.date.localeCompare(a.date))
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((p) => p.slug === slug)
}

export function getEnrichedPost(slug: string): Post & { readingTime: number; headings: TocItem[] } {
  const raw = getPostSource(slug)
  if (raw === null) throw new Error(`Post source not found: ${slug}`)
  const { content } = matter(raw)

  const post = getPostBySlug(slug)
  if (!post) {
    throw new Error(`Post not found: ${slug}`)
  }

  // Reading time counts prose only. Fenced code blocks are reference material the reader
  // scans or skips, not text read at words-per-minute; a post that ships a whole source
  // file would otherwise claim a wildly inflated number (250 lines of Swift in one post
  // more than doubled the estimate on the site this template came from).
  const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')

  return {
    ...post,
    readingTime: Math.ceil(readingTime(prose).minutes),
    headings: extractHeadings(content),
  }
}

export function getRelatedPosts(currentSlug: string): RelatedPost[] {
  const current = getPostBySlug(currentSlug)
  const currentTags = current?.tags ?? []

  return getAllPosts()
    .filter((p) => p.slug !== currentSlug && p.title !== undefined)
    .map((p) => ({
      slug: p.slug,
      title: p.title!,
      _score: (p.tags ?? []).filter((t) => currentTags.includes(t)).length,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ slug, title }) => ({ slug, title }))
}

export function getHashtagCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const post of getAllPosts()) {
    for (const tag of post.tags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1
    }
  }
  return counts
}

export function getPostsByHashtag(tag: string): Post[] {
  return getAllPosts().filter((p) => p.tags?.includes(tag))
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
