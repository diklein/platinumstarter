/**
 * Unsplash adapter: a user's public photos, with EXIF.
 *
 * The original photo sync (scripts/fetch-unsplash-photos.mjs, 2026), moved here unchanged in
 * behaviour. API per https://unsplash.com/documentation:
 *   GET /users/:username/photos?per_page=30&page=N&order_by=latest   the listing
 *   GET /photos/:id                                                    EXIF (not in listings)
 * with `Authorization: Client-ID <UNSPLASH_ACCESS_KEY>`. Demo apps get 50 requests/hour, so a
 * 200-photo profile is ~7 listing calls + 200 EXIF calls: apply for production (5000/hour)
 * before the first full sync, or expect the rate-limit backoff below to do its work.
 *
 * Ids stay bare (no `unsplash-` prefix): /photos/<id> permalinks for these photos already
 * exist in the wild, and the ids are attribution.
 */
import { NEUTRAL_COLOR, SourceError, emptyExif, fetchJson } from './_shared.mjs'

export const kind = 'unsplash'
const PER_PAGE = 30
const MAX_EXIF_RETRIES = 3
const CONCURRENCY = 5
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchPhotos(source, env = {}, ctx = {}) {
  const key = String(env.UNSPLASH_ACCESS_KEY ?? '').trim()
  if (!key) throw new SourceError('unsplash: UNSPLASH_ACCESS_KEY is not set (https://unsplash.com/oauth/applications → your app → Keys → Access Key)')
  const username = String(source.user ?? ctx.site?.social?.unsplash ?? '')
    .trim().replace(/^https?:\/\/unsplash\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '')
  if (!username) throw new SourceError('unsplash: no account: set `user` on the source or `social.unsplash` in site.config.ts')
  const headers = { Authorization: `Client-ID ${key}` }
  const api = (path) => fetchJson(`https://api.unsplash.com${path}`, { headers }, 'Unsplash').catch((err) => {
    if (err.status === 401) throw new SourceError('Unsplash rejected UNSPLASH_ACCESS_KEY (401): copy the Access Key, not the Secret key', 401)
    if (err.status === 403 && /rate limit/i.test(err.message)) throw new SourceError('Unsplash rate limit hit (demo apps get 50 requests/hour); try again later or apply for production', 403)
    if (err.status === 404) throw new SourceError(`Unsplash has no user "${username}"`, 404)
    throw err
  })

  const photos = []
  // Unsplash pages are a live window: an upload mid-pagination shifts photos across page
  // boundaries, so the same photo can arrive on two consecutive pages (six landed twice in
  // one 2026 sync, duplicate React keys across /photos). Hence the id set.
  const seen = new Set()
  for (let page = 1; ; page++) {
    const data = await api(`/users/${encodeURIComponent(username)}/photos?per_page=${PER_PAGE}&page=${page}&order_by=latest`)
    if (!Array.isArray(data)) throw new SourceError('Unsplash: expected a JSON array of photos')
    if (data.length === 0) break
    for (const p of data) {
      if (!p?.id || seen.has(p.id)) continue
      seen.add(p.id)
      photos.push({
        id: p.id,
        created_at: p.created_at ?? null,
        description: p.description ?? null,
        alt_description: p.alt_description ?? null,
        color: p.color ?? NEUTRAL_COLOR,
        width: p.width,
        height: p.height,
        urls: { regular: stripVolatile(p.urls.regular), small: stripVolatile(p.urls.small) },
        exif: null, // filled in below
        source: kind,
        link: p.links?.html ?? `https://unsplash.com/photos/${p.id}`,
      })
    }
    if (data.length < PER_PAGE) break
  }

  for (let i = 0; i < photos.length; i += CONCURRENCY) {
    const batch = photos.slice(i, i + CONCURRENCY)
    const exifs = await Promise.all(batch.map((p) => fetchExif(p.id, headers)))
    batch.forEach((p, j) => { p.exif = exifs[j] })
    if (ctx.progress) ctx.progress(`EXIF ${Math.min(i + CONCURRENCY, photos.length)}/${photos.length}`)
  }
  return photos
}

/** Unsplash rotates the `ixid` tracking token on every API response. Keeping it would make the
 *  committed JSON diff on every scheduled sync (a commit and a deploy each time) even when
 *  nothing changed. Strip it so the file only changes when a photo actually did. */
function stripVolatile(url) {
  const u = new URL(url)
  u.searchParams.delete('ixid')
  return u.toString()
}

/** One photo's EXIF, resilient by design: rate limits (403/429) and 5xx retry with backoff, and
 *  any ultimate failure returns all-null EXIF rather than throwing, so one bad photo never
 *  aborts the sync. The dispatcher keeps any previously committed EXIF over an all-null result. */
async function fetchExif(id, headers) {
  const url = `https://api.unsplash.com/photos/${id}`
  for (let attempt = 1; attempt <= MAX_EXIF_RETRIES; attempt++) {
    let res
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      if (attempt === MAX_EXIF_RETRIES) {
        console.warn(`\n  ⚠ ${id}: network error after ${attempt} tries (${err.message}), leaving EXIF null`)
        return emptyExif()
      }
      await sleep(attempt * 800)
      continue
    }
    if (res.ok) {
      const data = await res.json()
      return {
        make: data.exif?.make ?? null,
        model: data.exif?.model ?? null,
        exposure_time: data.exif?.exposure_time ?? null,
        aperture: data.exif?.aperture ?? null,
        focal_length: data.exif?.focal_length ?? null,
        iso: data.exif?.iso ?? null,
      }
    }
    const retryable = res.status === 403 || res.status === 429 || res.status >= 500
    if (retryable && attempt < MAX_EXIF_RETRIES) {
      await sleep(attempt * 1200)
      continue
    }
    console.warn(`\n  ⚠ ${id}: HTTP ${res.status} ${res.statusText}, leaving EXIF null`)
    return emptyExif()
  }
  return emptyExif()
}
