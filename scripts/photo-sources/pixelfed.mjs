/**
 * Pixelfed adapter: a public account's photo posts, token optional.
 *
 * Pixelfed speaks the Mastodon client API. Endpoints, per the routes file that defines them
 * (https://github.com/pixelfed/pixelfed/blob/dev/routes/api.php) and the Mastodon reference
 * for the shapes (https://docs.joinmastodon.org/methods/accounts/):
 *   GET /api/v1/accounts/lookup?acct=<user>          public (throttled only): the account id
 *   GET /api/v1/accounts/:id/statuses?only_media=true&limit=40&max_id=…
 *                                                    the documented listing; on Pixelfed it sits
 *                                                    behind auth:sanctum,api, so it needs
 *                                                    PIXELFED_TOKEN as a Bearer token
 *   GET /api/pixelfed/v1/accounts/:id/statuses?…    the web client's own route, same status
 *                                                    shape, served WITHOUT a token by
 *                                                    pixelfed.social (verified 2026-09-01);
 *                                                    used when no token is set
 * A status's media_attachments follow https://docs.joinmastodon.org/entities/MediaAttachment/:
 * `url` (the original upload), `preview_url`, `meta.original.{width,height}`, `description`
 * (alt text), `blurhash` (its DC term gives the dominant color for free).
 *
 * Lossy: no EXIF (Pixelfed strips it on upload), the caption keeps its hashtags, and a
 * multi-photo post becomes one record per image (`-2`, `-3` suffixes on the id).
 */
import { NEUTRAL_COLOR, SourceError, blurhashAverageColor, emptyExif, fetchJson, isoDate, normalizeBase, stripHtml } from './_shared.mjs'

export const kind = 'pixelfed'
// The Mastodon route takes up to 40 per page; the web client's route rejects anything over 24
// (422 "The limit may not be greater than 24", pixelfed.social 2026-09-01).
const PAGE_WITH_TOKEN = 40
const PAGE_PUBLIC = 24
const MAX_PAGES = 100

export async function fetchPhotos(source, env = {}) {
  const base = normalizeBase(source.instance, 'pixelfed.instance')
  const user = String(source.user ?? '').trim().replace(/^@/, '').replace(/@.*$/, '')
  if (!user) throw new SourceError('pixelfed: `user` is empty (the account handle, without the @)')
  const token = String(env.PIXELFED_TOKEN ?? '').trim() || null
  const headers = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }

  const account = await fetchJson(`${base}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`, { headers }, 'Pixelfed lookup')
    .catch((err) => {
      if (err.status === 404) throw new SourceError(`Pixelfed: no account "${user}" on ${base}`, 404)
      throw err
    })
  if (!account?.id) throw new SourceError(`Pixelfed: lookup of "${user}" on ${base} answered without an account id`)

  const path = token
    ? `/api/v1/accounts/${account.id}/statuses`
    : `/api/pixelfed/v1/accounts/${account.id}/statuses`
  const pageSize = token ? PAGE_WITH_TOKEN : PAGE_PUBLIC
  const photos = []
  const seenStatus = new Set()
  let maxId = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ only_media: 'true', limit: String(pageSize) })
    if (maxId) qs.set('max_id', maxId)
    let statuses
    try {
      statuses = await fetchJson(`${base}${path}?${qs}`, { headers }, 'Pixelfed statuses')
    } catch (err) {
      if (err.status === 401 && !token) {
        throw new SourceError(`Pixelfed: ${base} does not serve ${path} without a token. Create one at ${base}/settings/applications (Personal Access Tokens) and set PIXELFED_TOKEN.`, 401)
      }
      throw err
    }
    if (!Array.isArray(statuses)) throw new SourceError(`Pixelfed: ${path} answered with something other than a status array`)
    if (statuses.length === 0) break
    for (const status of statuses) {
      if (!status?.id || seenStatus.has(status.id)) continue
      seenStatus.add(status.id)
      photos.push(...fromStatus(status))
    }
    const last = statuses[statuses.length - 1].id
    if (last === maxId || statuses.length < pageSize) break
    maxId = last
  }
  return photos
}

function fromStatus(status) {
  // Reblogs are someone else's photos; anything below unlisted is not for a public site.
  if (status.reblog) return []
  if (status.visibility && status.visibility !== 'public' && status.visibility !== 'unlisted') return []
  const caption = (status.content_text ?? stripHtml(status.content)).trim() || null
  const images = (status.media_attachments ?? []).filter((m) => m?.type === 'image' && m.url)
  return images
    .map((m, i) => ({
      id: i === 0 ? `pixelfed-${status.id}` : `pixelfed-${status.id}-${i + 1}`,
      created_at: isoDate(status.created_at),
      description: caption,
      alt_description: (m.description ?? '').trim() || null,
      color: blurhashAverageColor(m.blurhash) ?? NEUTRAL_COLOR,
      width: Number(m.meta?.original?.width) || 0,
      height: Number(m.meta?.original?.height) || 0,
      urls: { regular: m.url, small: m.preview_url || m.url },
      exif: emptyExif(),
      source: kind,
      link: status.url ?? status.uri,
    }))
    .filter((p) => p.width > 0 && p.height > 0 && p.link)
}
