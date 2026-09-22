/**
 * Glass adapter: a public profile's RSS feed, zero keys.
 *
 * Glass has no public API. The documented way to read a profile from outside is its RSS feed:
 * "just add /rss after your Glass URL", with Public Profile switched on
 * (https://glass.photo/highlights/profile-rss-feeds). Feed shape as served on 2026-09-01
 * (https://glass.photo/tom/rss): RSS 2.0, newest first, the latest 100 posts, no pagination
 * (?page=N answers with the same items). Each <item> carries <link> (the post page), <guid>,
 * <pubDate>, the caption as <title> and <description>, a <content:encoded> block holding one
 * <img src width height>, and an <enclosure type="image/jpeg" url>. The image is a signed
 * imgproxy URL on cdn.glass.photo at rs:fit:3072:3072, the only rendition the feed offers, so
 * `regular` and `small` are the same string (the CDN serves it once; the browser caches it).
 *
 * Lossy by nature: no EXIF, no dominant color (a neutral placeholder), no alt text separate
 * from the caption, and only the newest 100 posts.
 */
import { NEUTRAL_COLOR, SourceError, decodeEntities, emptyExif, fetchText, isoDate } from './_shared.mjs'

export const kind = 'glass'
/** Where the feed's images live; next.config.mjs trusts it whenever a glass source is configured. */
export const CDN_HOST = 'cdn.glass.photo'

export async function fetchPhotos(source) {
  const profile = String(source.profile ?? '')
    .trim()
    .replace(/^https?:\/\/glass\.photo\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
  if (!profile) throw new SourceError('glass: `profile` is empty (the handle in glass.photo/<profile>)')

  const url = `https://glass.photo/${encodeURIComponent(profile)}/rss`
  let xml
  try {
    xml = await fetchText(url, { headers: { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.1' } }, 'Glass')
  } catch (err) {
    if (err.status === 404) throw new SourceError(`Glass: no public profile at glass.photo/${profile} (Public Profile must be on for the feed to exist)`, 404)
    throw err
  }
  if (!/<rss[\s>]/i.test(xml)) throw new SourceError(`Glass: ${url} did not answer with an RSS feed`)

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  const photos = []
  const seen = new Set()
  for (const item of items) {
    const photo = parseItem(item)
    if (!photo || seen.has(photo.id)) continue
    seen.add(photo.id)
    photos.push(photo)
  }
  return photos
}

/** Text of the first <name>…</name> in the item, CDATA unwrapped and entities decoded. */
function tag(item, name) {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return decodeEntities(cdata ? cdata[1] : m[1]).trim()
}

function attr(element, name) {
  const m = (element ?? '').match(new RegExp(`\\b${name}="([^"]*)"`))
  return m ? decodeEntities(m[1]) : null
}

function parseItem(item) {
  const link = tag(item, 'link')
  const enclosure = item.match(/<enclosure\b[^>]*>/)?.[0]
  const img = (tag(item, 'content:encoded') ?? '').match(/<img\b[^>]*>/)?.[0]
  const src = attr(enclosure, 'url') ?? attr(img, 'src')
  const width = Number(attr(img, 'width'))
  const height = Number(attr(img, 'height'))
  if (!link || !src || !(width > 0) || !(height > 0)) return null
  const postId = link.replace(/\/+$/, '').split('/').pop()
  const caption = tag(item, 'description') || tag(item, 'title') || null
  return {
    id: `glass-${postId}`,
    created_at: isoDate(tag(item, 'pubDate')),
    description: caption,
    alt_description: null,
    color: NEUTRAL_COLOR,
    width,
    height,
    urls: { regular: src, small: src },
    exif: emptyExif(),
    source: kind,
    link,
  }
}
