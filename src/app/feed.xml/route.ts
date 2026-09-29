import { getAllPosts, getPostLeadImage, getPostSource } from '@/lib/posts'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import { toHtml } from 'hast-util-to-html'
import type { Root } from 'hast'
import matter from 'gray-matter'
import { site, siteUrl } from '@/lib/site-config'

const BASE = siteUrl

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function mimeType(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return 'image/png'
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp'
  if (/\.gif(\?|$)/i.test(url)) return 'image/gif'
  return 'image/jpeg'
}

function stripMdxSpecific(content: string): string {
  return content
    .replace(/^import\s.+$/gm, '')
    .replace(/^export\s.+$/gm, '')
    .replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, '')
    .replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, '')
    .trim()
}

// Replace the site's video components (Video / PortraitVideo / GifVideo) with a
// text token, stashing each clip's absolute mp4 + poster URLs. Tokens survive the
// markdown pipeline (which drops raw HTML); we swap them back to real <video>
// elements after rendering so the feed shows a poster + playable clip.
function extractVideos(content: string, videos: { mp4: string; poster: string }[]): string {
  const abs = (p: string) => (p.startsWith('http') ? p : `${BASE}${p}`)
  return content.replace(
    /<(?:Video|PortraitVideo|GifVideo)\b[^>]*?\bsrc="([^"]+)"[^>]*?(?:\/>|>[\s\S]*?<\/(?:Video|PortraitVideo|GifVideo)>)/g,
    (_m, src: string) => {
      const base = src.replace(/\.(mp4|webm)$/i, '')
      videos.push({ mp4: abs(`${base}.mp4`), poster: abs(`${base}.jpg`) })
      return `\n\n@@VIDEO${videos.length - 1}@@\n\n`
    }
  )
}

async function getPostHtml(slug: string): Promise<string> {
  try {
    const raw = getPostSource(slug)
    if (raw === null) return ''
    const { content } = matter(raw)
    const videos: { mp4: string; poster: string }[] = []
    const stripped = stripMdxSpecific(extractVideos(content, videos))
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype)
    const mdast = processor.parse(stripped)
    const hast = await processor.run(mdast) as Root
    // Rewrite content image srcs to absolute URLs so feed readers can load them
    // (posts author images as repo-relative ../../../public/... paths).
    return toHtml(hast)
      .replace(/src="[^"]*\/public\//g, `src="${BASE}/`)
      .replace(/src="\/(?!\/)/g, `src="${BASE}/`)
      // Swap video tokens (now wrapped in a <p>) back to playable <video> elements.
      .replace(/<p>@@VIDEO(\d+)@@<\/p>/g, (_m, i: string) => {
        const v = videos[Number(i)]
        return v
          ? `<video controls muted loop playsinline preload="metadata" poster="${v.poster}"><source src="${v.mp4}" type="video/mp4" /></video>`
          : ''
      })
  } catch {
    return ''
  }
}

export async function GET() {
  const articles = getAllPosts().filter((p) => p.type === 'article')

  const htmlContents = await Promise.all(articles.map((p) => getPostHtml(p.slug)))
  const leadImages = articles.map((p) => {
    const l = getPostLeadImage(p.slug)
    return l ? (l.startsWith('http') ? l : `${BASE}${l}`) : null
  })

  const items = articles
    .map((post, i) => {
      const pubDate = new Date(post.date).toUTCString()
      const link = `${BASE}/writing/${post.slug}`
      const image = leadImages[i]
      // Encourage replies: feed readers render this as a pre-addressed email
      // with the post title prefilled as the subject. Only when there is an address
      // to reply to and the site wants the affordance.
      const email = site.identity.email
      const replyHtml = email && site.writing.replyByEmail
        ? `<hr /><p><a href="mailto:${email}?subject=${encodeURIComponent(post.title ?? '')}">Reply via email</a></p>`
        : ''
      return `
    <item>
      <title>${escapeXml(post.title ?? '')}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.excerpt ?? '')}</description>${image ? `
      <enclosure url="${escapeXml(image)}" type="${mimeType(image)}" />
      <media:content medium="image" url="${escapeXml(image)}" />` : ''}
      <content:encoded><![CDATA[${htmlContents[i]}${replyHtml}]]></content:encoded>
    </item>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(site.identity.name)}</title>
    <link>${BASE}</link>
    <description>${escapeXml(site.identity.tagline)}</description>
    <language>${site.identity.locale.replace('_', '-').toLowerCase()}</language>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <!-- ?v busts feed-reader caches: readers key this image by URL and many never
           refetch it, so a mark change must change the URL. Bump on redesigns. -->
      <url>${BASE}/feed-icon.png?v=3</url>
      <title>${escapeXml(site.identity.name)}</title>
      <link>${BASE}</link>
    </image>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
