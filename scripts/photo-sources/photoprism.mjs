/**
 * PhotoPrism adapter: a self-hosted library, one album or every public photo.
 *
 * REST API per https://docs.photoprism.app/developer-guide/api/ (JSON in and out; the docs warn
 * that routes "may change", so every call is checked for shape). Exercised against the public
 * demo (https://demo.photoprism.app) on 2026-09-01:
 *   GET /api/v1/config                 previewToken ("public" on public instances) and
 *                                      contentUri, the base thumbnails are served from: the
 *                                      demo hands out a CDN host (demo-cdn.photoprism.app), a
 *                                      home install answers "/api/v1"
 *   GET /api/v1/photos?count&offset&order=newest&type=image&public=true[&album=…]
 *                                      filters per https://docs.photoprism.app/user-guide/search/filters/
 *                                      (album: "Album UID or name", public: "Excludes private
 *                                      content"); each row has UID, Hash, Width, Height,
 *                                      TakenAt, Title, Caption, Color, CameraMake, CameraModel,
 *                                      Exposure, FNumber, FocalLength, Iso
 *   <contentUri>/t/<Hash>/<previewToken>/<size>
 *                                      https://docs.photoprism.app/developer-guide/api/thumbnails/;
 *                                      fit_1920 and tile_500 are pre-generated sizes
 * Auth: PHOTOPRISM_TOKEN in `Authorization: Bearer`, an app password from Settings → Account →
 * Apps and Devices (or `photoprism auth add`), per
 * https://docs.photoprism.app/user-guide/users/client-credentials/. Public instances need none.
 *
 * Color: `Color` is an index into pkg/media/colors (Black = 0 … Pink = 15, the iota order in
 * https://github.com/photoprism/photoprism/blob/develop/pkg/media/colors/colors.go); the hex
 * values are that package's ColorExamples (examples.go, same directory).
 */
import { NEUTRAL_COLOR, SourceError, emptyExif, exifString, fetchJson, isoDate, normalizeBase } from './_shared.mjs'

export const kind = 'photoprism'
const COLOR_HEX = [
  '#212121', '#9E9E9E', '#A1887F', '#D4AF37', '#F5F5F5', '#AB47BC', '#2196F3', '#00BCD4',
  '#009688', '#66BB6A', '#CDDC39', '#FDD835', '#FF00FF', '#FFA726', '#EF5350', '#EC407A',
]
const REGULAR_SIZE = 'fit_1920'
const SMALL_SIZE = 'tile_500'
const PAGE = 500
const MAX_PAGES = 200

export async function fetchPhotos(source, env = {}) {
  const base = normalizeBase(source.url, 'photoprism.url')
  const token = String(env.PHOTOPRISM_TOKEN ?? '').trim() || null
  const headers = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  const unauthorized = (err) => {
    if (err.status === 401) {
      throw new SourceError(token
        ? `PhotoPrism: ${base} rejected PHOTOPRISM_TOKEN (401). Create an app password under Settings → Account → Apps and Devices.`
        : `PhotoPrism: ${base} needs a token. Create an app password under Settings → Account → Apps and Devices and set PHOTOPRISM_TOKEN.`, 401)
    }
    throw err
  }

  const config = await fetchJson(`${base}/api/v1/config`, { headers }, 'PhotoPrism config').catch(unauthorized)
  const previewToken = String(config?.previewToken || 'public')
  const contentUri = String(config?.contentUri || '/api/v1')
  const contentBase = (/^https?:\/\//i.test(contentUri) ? contentUri : `${base}/${contentUri.replace(/^\/+/, '')}`).replace(/\/+$/, '')

  const photos = []
  const seen = new Set()
  for (let i = 0, offset = 0; i < MAX_PAGES; i++, offset += PAGE) {
    const qs = new URLSearchParams({ count: String(PAGE), offset: String(offset), order: 'newest', type: 'image', public: 'true' })
    if (source.album) qs.set('album', String(source.album))
    const page = await fetchJson(`${base}/api/v1/photos?${qs}`, { headers }, 'PhotoPrism photos').catch(unauthorized)
    if (!Array.isArray(page)) throw new SourceError('PhotoPrism: /api/v1/photos answered with something other than a photo list')
    for (const p of page) {
      if (!p?.UID || !p.Hash || seen.has(p.UID)) continue
      if (!(p.Width > 0 && p.Height > 0)) continue
      seen.add(p.UID)
      photos.push(toPhoto(base, contentBase, previewToken, p))
    }
    if (page.length < PAGE) break
  }
  return photos
}

const known = (v) => (v && !/^unknown$/i.test(String(v)) ? String(v) : null)

function toPhoto(base, contentBase, previewToken, p) {
  return {
    id: `photoprism-${p.UID}`,
    created_at: isoDate(p.TakenAt),
    description: (p.Caption ?? p.Description ?? '').trim() || null,
    alt_description: (p.Title ?? '').trim() || null,
    color: COLOR_HEX[p.Color] ?? NEUTRAL_COLOR,
    width: p.Width,
    height: p.Height,
    urls: {
      regular: `${contentBase}/t/${p.Hash}/${previewToken}/${REGULAR_SIZE}`,
      small: `${contentBase}/t/${p.Hash}/${previewToken}/${SMALL_SIZE}`,
    },
    exif: {
      ...emptyExif(),
      make: known(p.CameraMake),
      model: known(p.CameraModel),
      exposure_time: exifString(p.Exposure),
      aperture: p.FNumber ? String(p.FNumber) : null,
      focal_length: p.FocalLength ? String(p.FocalLength) : null,
      iso: p.Iso || null,
    },
    source: kind,
    link: `${base}/library/browse?q=${encodeURIComponent(`uid:${p.UID}`)}`,
  }
}
