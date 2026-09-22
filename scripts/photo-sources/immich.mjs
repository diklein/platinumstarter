/**
 * Immich adapter: a self-hosted library, one album or the whole timeline.
 *
 * Endpoints from the OpenAPI document that generates api.immich.app
 * (https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json); every
 * one accepts the `x-api-key` header (securitySchemes.api_key). Exercised against the public
 * demo (https://demo.immich.app, server 3.1.0) on 2026-09-01:
 *   GET  /api/albums                    [{ id, albumName, assetCount, … }]
 *   POST /api/search/metadata           { size ≤ 1000, page (cursor from 3.2), type, order,
 *                                         withExif, albumIds } → { assets: { items, nextPage,
 *                                         nextCursor } }; items carry exifInfo, thumbhash,
 *                                         width/height, fileCreatedAt, visibility
 *   GET  /api/shared-links[?albumId=]   POST /api/shared-links   PUT /api/shared-links/:id/assets
 *   GET  /api/assets/:id/thumbnail?size=preview|thumbnail&key=<shared link key>
 *
 * Every asset route needs credentials, and a browser loading <img src> sends none, so the sync
 * keeps one public shared link (docs.immich.app/features/sharing) and puts its `key` on each
 * image URL: the ALBUM link for an album source, or one INDIVIDUAL link, topped up each run,
 * for a timeline source. The key is public by design (it IS the share URL), so it is fine in
 * the committed JSON; it reveals exactly the photos the site shows and nothing else.
 *
 * The API key (Immich web app: avatar → Account Settings → API Keys) needs album.read,
 * asset.read, sharedLink.read and sharedLink.create; "all" also works.
 */
import { NEUTRAL_COLOR, SourceError, emptyExif, exifString, fetchJson, isoDate, normalizeBase, thumbhashAverageColor } from './_shared.mjs'

export const kind = 'immich'
/** How the sync labels the shared links it creates, so re-runs (and the smoke test) find them. */
export const SHARED_LINK_DESCRIPTION = 'Platinum photos sync (site images)'
const PAGE = 500
const MAX_PAGES = 200

export async function fetchPhotos(source, env = {}) {
  const base = normalizeBase(source.url, 'immich.url')
  const key = String(env.IMMICH_API_KEY ?? '').trim()
  if (!key) throw new SourceError('immich: IMMICH_API_KEY is not set (Immich web app → avatar → Account Settings → API Keys)')
  const headers = { 'x-api-key': key, accept: 'application/json' }

  const album = source.album ? await resolveAlbum(base, headers, source.album) : null
  const assets = await listAssets(base, headers, album?.id)
  const link = await ensureSharedLink(base, headers, album, assets)
  return assets.map((asset) => toPhoto(base, asset, link.key))
}

async function resolveAlbum(base, headers, ref) {
  const albums = await fetchJson(`${base}/api/albums`, { headers }, 'Immich albums').catch(rethrow)
  if (!Array.isArray(albums)) throw new SourceError('Immich: /api/albums answered with something other than an album list')
  const wanted = String(ref).trim()
  const album = albums.find((a) => a.id === wanted) ?? albums.find((a) => a.albumName?.toLowerCase() === wanted.toLowerCase())
  if (!album) throw new SourceError(`Immich: no album "${wanted}" (albums: ${albums.map((a) => a.albumName).join(', ') || 'none'})`, 404)
  return album
}

async function listAssets(base, headers, albumId) {
  const out = []
  const seen = new Set()
  let page = 1
  let cursor = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = {
      size: PAGE, type: 'IMAGE', order: 'desc', withExif: true,
      ...(albumId ? { albumIds: [albumId] } : {}),
      ...(cursor ? { cursor } : { page }),
    }
    const data = await fetchJson(`${base}/api/search/metadata`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, 'Immich search').catch(rethrow)
    const items = data?.assets?.items
    if (!Array.isArray(items)) throw new SourceError('Immich: /api/search/metadata answered without assets.items')
    for (const a of items) {
      if (seen.has(a.id) || a.isTrashed) continue
      // 'archive', 'hidden' (live-photo parts), and 'locked' never belong on a public site.
      if (a.visibility && a.visibility !== 'timeline') continue
      seen.add(a.id)
      out.push(a)
    }
    const next = data.assets.nextCursor ?? data.assets.nextPage
    if (!next || items.length < PAGE) break
    if (data.assets.nextCursor) cursor = next
    else page = Number(next)
  }
  return out
}

async function ensureSharedLink(base, headers, album, assets) {
  const listUrl = `${base}/api/shared-links${album ? `?albumId=${encodeURIComponent(album.id)}` : ''}`
  const links = await fetchJson(listUrl, { headers }, 'Immich shared links').catch(rethrow)
  const usable = (l) => !l.password && (!l.expiresAt || Date.parse(l.expiresAt) > Date.now())
  let link = album
    ? links.find((l) => l.type === 'ALBUM' && l.album?.id === album.id && usable(l))
    : links.find((l) => l.type === 'INDIVIDUAL' && l.description === SHARED_LINK_DESCRIPTION && usable(l))

  const post = (url, method, payload, label) => fetchJson(url, {
    method, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }, label).catch(rethrow)

  if (!link) {
    const payload = album
      ? { type: 'ALBUM', albumId: album.id }
      : { type: 'INDIVIDUAL', assetIds: assets.map((a) => a.id) }
    link = await post(`${base}/api/shared-links`, 'POST', {
      ...payload, description: SHARED_LINK_DESCRIPTION, showMetadata: true, allowDownload: false, allowUpload: false,
    }, 'Immich create shared link')
  } else if (!album) {
    // The timeline grew since the link was made: add what it does not cover yet.
    const covered = new Set((link.assets ?? []).map((a) => a.id))
    const missing = assets.filter((a) => !covered.has(a.id)).map((a) => a.id)
    if (missing.length) await post(`${base}/api/shared-links/${link.id}/assets`, 'PUT', { assetIds: missing }, 'Immich shared link assets')
  }
  if (!link?.key) throw new SourceError('Immich: the shared link came back without a key')
  return link
}

function toPhoto(base, a, key) {
  const e = a.exifInfo ?? {}
  const q = `key=${encodeURIComponent(key)}`
  return {
    id: `immich-${a.id}`,
    created_at: isoDate(e.dateTimeOriginal ?? a.fileCreatedAt ?? a.localDateTime),
    description: (e.description ?? '').trim() || null,
    alt_description: null,
    color: thumbhashAverageColor(a.thumbhash) ?? NEUTRAL_COLOR,
    // The asset's own width/height follow edits (crops); EXIF dimensions are the fallback.
    width: Number(a.width) || Number(e.exifImageWidth) || 0,
    height: Number(a.height) || Number(e.exifImageHeight) || 0,
    urls: {
      regular: `${base}/api/assets/${a.id}/thumbnail?size=preview&${q}`,
      small: `${base}/api/assets/${a.id}/thumbnail?size=thumbnail&${q}`,
    },
    exif: {
      ...emptyExif(),
      make: exifString(e.make?.trim()),
      model: exifString(e.model?.trim()),
      exposure_time: exifString(e.exposureTime),
      aperture: exifString(e.fNumber),
      focal_length: exifString(e.focalLength),
      iso: Number.isFinite(e.iso) ? e.iso : null,
    },
    source: kind,
    link: `${base}/photos/${a.id}`,
  }
}

function rethrow(err) {
  if (err.status === 401) throw new SourceError('Immich: the server rejected IMMICH_API_KEY (401). Make a new key under Account Settings → API Keys.', 401)
  if (err.status === 403) throw new SourceError('Immich: IMMICH_API_KEY lacks a permission (403). It needs album.read, asset.read, sharedLink.read, and sharedLink.create, or "all".', 403)
  throw err
}
