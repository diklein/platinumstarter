import path from 'path'
import exifr from 'exifr'
import photosJson from '@/lib/synced-photos.json'
import { manualPhotos } from '@/lib/manual-photos'
import { formatCamera, type UnsplashPhoto } from '@/lib/unsplash-photos'
import { SITE } from '@/lib/seo'

// Server-only photo data for the /photos/[id] permalink pages and the Openfeed JSON Feed
// (/photos/feed.json). Everything derives from repo files at build time — the committed sync
// JSON (src/lib/synced-photos.json, written by scripts/fetch-photos.mjs from every source in
// site.photos.sources), the manual-photos list, and the local image files themselves — so the
// feed regenerates on every build with no external API access (the build-from-repo rule).

/** Openfeed's `_photoring.exif` info card: display-formatted strings, only what's known. */
export interface FeedExif {
  camera?: string
  lens?: string
  shutter?: string
  aperture?: string
  iso?: string
  focal?: string
}

export interface FeedItem {
  photo: UnsplashPhoto
  /** Absolute permalink of the photo's page on this site (feed `id` + `url`). */
  permalink: string
  /** Absolute URL of the FULL-SIZE image file (feed `image`). */
  image: string
  /** RFC 3339 publish date: EXIF DateTimeOriginal for local files, else the entry's date. */
  datePublished: string
  exif: FeedExif | null
}

/** Every photo on /photos — manual entries merged with the synced sources — newest first.
 *  The same merge+sort as src/app/photos/page.tsx, so the feed and the grid always agree. */
export function getAllPhotos(): UnsplashPhoto[] {
  return [...manualPhotos, ...(photosJson as UnsplashPhoto[])].sort((a, b) => {
    const ts = (p: UnsplashPhoto) => (p.created_at ? Date.parse(p.created_at) : 0)
    return ts(b) - ts(a)
  })
}

export function getPhotoById(id: string): UnsplashPhoto | undefined {
  return getAllPhotos().find((p) => p.id === id)
}

/** The full-size file. Unsplash photos: the source URL with the `w` resize param dropped —
 *  Unsplash then serves the original dimensions. Other synced sources carry no `w` param, so
 *  their `regular` rendition (the best one the service hands out) passes through untouched.
 *  Local photos: the file itself, absolute. */
export function fullSizeUrl(p: UnsplashPhoto): string {
  if (p.urls.regular.startsWith('/')) return `${SITE.url}${p.urls.regular}`
  const u = new URL(p.urls.regular)
  u.searchParams.delete('w')
  return u.toString()
}

const trimNum = (n: number | string) => String(parseFloat(String(n)))

/** 0.00625 → "1/160"; 1.3 → "1.3" (display style matches what Unsplash reports as strings). */
function formatShutter(t: number): string {
  return t >= 1 ? trimNum(t) : `1/${Math.round(1 / t)}`
}

/** The site's UnsplashExif (API strings, also used by hand-written manual entries) → info card. */
function exifFromEntry(p: UnsplashPhoto): FeedExif | null {
  const e = p.exif
  if (!e) return null
  const out: FeedExif = {}
  const camera = formatCamera(e.make, e.model)
  if (camera) out.camera = camera
  if (e.exposure_time) out.shutter = e.exposure_time
  if (e.aperture) out.aperture = `ƒ/${trimNum(e.aperture)}`
  if (e.iso) out.iso = String(e.iso)
  if (e.focal_length) out.focal = `${trimNum(e.focal_length)}mm`
  return Object.keys(out).length ? out : null
}

interface RawExif {
  Make?: string
  Model?: string
  LensModel?: string
  ExposureTime?: number
  FNumber?: number
  ISO?: number
  FocalLength?: number
  DateTimeOriginal?: Date
}

/** EXIF read from the ORIGINAL local file — exports/resizes usually strip it, so this is the
 *  only trustworthy source for the manual photos. Returns null when the file has none.
 *  Joined against the literal photos dir (not all of public/) and basename'd: a variable
 *  path under `public` made Vercel's file tracer bundle the whole 562MB public/ tree into
 *  the feed function. Runs at build only — the routes are static — and next.config.mjs
 *  additionally excludes public/** from these routes' traces. */
async function readLocalExif(publicPath: string): Promise<RawExif | null> {
  try {
    const file = path.join(process.cwd(), 'public/images/photos', path.basename(publicPath))
    const data: RawExif | undefined = await exifr.parse(file, {
      pick: ['Make', 'Model', 'LensModel', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'DateTimeOriginal'],
    })
    return data ?? null
  } catch {
    return null
  }
}

function exifFromFile(raw: RawExif): FeedExif | null {
  const out: FeedExif = {}
  const camera = formatCamera(raw.Make ?? null, raw.Model ?? null)
  if (camera) out.camera = camera
  if (raw.LensModel) out.lens = raw.LensModel
  if (raw.ExposureTime) out.shutter = formatShutter(raw.ExposureTime)
  if (raw.FNumber) out.aperture = `ƒ/${trimNum(raw.FNumber)}`
  if (raw.ISO) out.iso = String(raw.ISO)
  if (raw.FocalLength) out.focal = `${trimNum(raw.FocalLength)}mm`
  return Object.keys(out).length ? out : null
}

/** Feed items, newest first. Local photos read their original file's EXIF (camera card +
 *  DateTimeOriginal → date_published), falling back to the manual entry's hand-recorded data
 *  when the file was stripped. Unsplash photos carry the EXIF their API read from the upload
 *  (we hold no original file for those) and publish at their Unsplash `created_at`. */
export async function getFeedItems(): Promise<FeedItem[]> {
  const items = await Promise.all(
    getAllPhotos().map(async (photo): Promise<FeedItem> => {
      const isLocal = photo.urls.regular.startsWith('/')
      const raw = isLocal ? await readLocalExif(photo.urls.regular) : null
      const exif = (raw && exifFromFile(raw)) ?? exifFromEntry(photo)
      const datePublished =
        raw?.DateTimeOriginal?.toISOString() ??
        (photo.created_at ? new Date(photo.created_at).toISOString() : new Date(0).toISOString())
      return {
        photo,
        permalink: `${SITE.url}/photos/${photo.id}`,
        image: fullSizeUrl(photo),
        datePublished,
        exif,
      }
    }),
  )
  return items.sort((a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished))
}
