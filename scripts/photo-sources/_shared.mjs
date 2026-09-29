/**
 * Shared helpers for the photo source adapters (scripts/photo-sources/<kind>.mjs). The
 * underscore prefix marks this as a helper, not an adapter. Node 24 built-ins only.
 *
 * Every adapter exports `{ kind, fetchPhotos(source, env, ctx) }` and returns records shaped
 * exactly like src/lib/unsplash-photos.ts's `UnsplashPhoto`, so the site renders every source
 * through the same grid, lightbox, permalink page, feed, and stats:
 *
 *   { id, created_at, description, alt_description, color, width, height,
 *     urls: { regular, small }, exif: { make, model, exposure_time, aperture, focal_length, iso },
 *     source: kind, link }
 *
 * `urls.regular` is the rendition the grid AND the lightbox hi-res layer load (the lightbox's
 * w=2048 rewrite only fires on Unsplash URLs), so it must be the same string everywhere a
 * photo appears: that is the byte-identical hi-res invariant the /photos performance work
 * depends on, and it is why adapters never hand out per-surface variants.
 */

/** Neutral placeholder when a source exposes no dominant color (the Unsplash sync's own fallback). */
export const NEUTRAL_COLOR = '#888888'

export const emptyExif = () => ({
  make: null, model: null, exposure_time: null, aperture: null, focal_length: null, iso: null,
})

/** An adapter failure the dispatcher can print as one line; `status` is the HTTP status if any. */
export class SourceError extends Error {
  constructor(message, status = null) {
    super(message)
    this.name = 'SourceError'
    this.status = status
  }
}

/** "photos.example.com", "https://photos.example.com/" → "https://photos.example.com". */
export function normalizeBase(value, field) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new SourceError(`${field} is empty`)
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try { url = new URL(withScheme) } catch { throw new SourceError(`${field} is not a URL: ${raw}`) }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
}

export function excerpt(text, max = 160) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

/** fetch() that maps network failures and non-2xx statuses to SourceError. Returns the body text. */
export async function fetchText(url, init = {}, label = 'request') {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'unknown'
    throw new SourceError(`${label}: could not reach ${new URL(url).host} (${cause})`)
  }
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new SourceError(`${label}: HTTP ${res.status} ${res.statusText} from ${new URL(url).host}${new URL(url).pathname}: ${excerpt(text)}`, res.status)
  }
  return text
}

export async function fetchJson(url, init = {}, label = 'request') {
  const text = await fetchText(url, init, label)
  try {
    return JSON.parse(text)
  } catch {
    throw new SourceError(`${label}: expected JSON from ${new URL(url).host}, got: ${excerpt(text)}`)
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[body.toLowerCase()] ?? m
  })
}

/** HTML → plain text: block breaks become newlines, tags go, entities decode. */
export function stripHtml(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/[ \t]+\n/g, '\n').trim()
}

/** Any date the API hands back → ISO 8601, or null when it does not parse. */
export function isoDate(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export const exifString = (v) => (v === null || v === undefined || v === '' ? null : String(v))

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
export const hexColor = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

// BlurHash's first component is the average color, stored as sRGB bytes in a 4-character
// base-83 word right after the size flag (https://github.com/woltapp/blurhash/blob/master/Algorithm.md,
// "DC value"), so the dominant color comes free of any image download.
const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

export function blurhashAverageColor(hash) {
  if (typeof hash !== 'string' || hash.length < 6) return null
  let value = 0
  for (const ch of hash.slice(2, 6)) {
    const digit = BASE83.indexOf(ch)
    if (digit === -1) return null
    value = value * 83 + digit
  }
  return hexColor(value >> 16, (value >> 8) & 255, value & 255)
}

// ThumbHash packs the average color into its 3-byte header; this is thumbHashToAverageRGBA
// from the reference implementation (https://github.com/evanw/thumbhash/blob/main/js/thumbhash.js),
// minus alpha, mapped to 8-bit sRGB.
export function thumbhashAverageColor(base64) {
  if (typeof base64 !== 'string' || !base64) return null
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length < 3) return null
  const header = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16)
  const l = (header & 63) / 63
  const p = ((header >> 6) & 63) / 31.5 - 1
  const q = ((header >> 12) & 63) / 31.5 - 1
  const b = l - (2 / 3) * p
  const r = (3 * l - b + q) / 2
  const g = r - q
  const clamp = (v) => Math.max(0, Math.min(1, v)) * 255
  return hexColor(clamp(r), clamp(g), clamp(b))
}
