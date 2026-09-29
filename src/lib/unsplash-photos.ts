import { PHOTO_SOURCE_LABELS, type PhotoSourceKind } from './site-config-schema'

export interface UnsplashExif {
  make: string | null
  model: string | null
  exposure_time: string | null
  aperture: string | null
  focal_length: string | null
  iso: number | null
}

export interface UnsplashPhoto {
  id: string
  created_at: string | null
  description: string | null
  alt_description: string | null
  color: string
  width: number
  height: number
  urls: {
    regular: string
    /** Only the /about photo collage reads `small`; /photos strips it before the
     *  client boundary so ~189 unused URLs stay out of the RSC payload. */
    small?: string
  }
  exif: UnsplashExif
  /** Which sync adapter (scripts/photo-sources/<kind>.mjs) wrote the record. Absent on
   *  hand-written manual entries. Ids of non-Unsplash sources carry the kind as a prefix
   *  (`glass-…`, `immich-…`); Unsplash ids stay bare so existing /photos/<id> permalinks hold. */
  source?: PhotoSourceKind
  /** The photo's own page on its source service (the lightbox "View on <Service>" link). */
  link?: string
  /** Present only for article video clips opened in the lightbox: the mp4/webm to play.
   *  `urls.regular` then holds the poster frame (used for the fly-in clone). */
  videoSrc?: string
  /** Whether the source clip shows a progress bar in the article (mirror it in the modal). */
  videoProgress?: boolean
  /** CSS border-radius (e.g. "20% / 9.78%") for an iPhone-bezel asset's loading shimmer, so the
   *  modal placeholder reads as the phone silhouette. Carried from the in-article element's own
   *  frame radius so the two always match; absent for ordinary rectangular assets. */
  frameRadius?: string
  /** Exact URL of the origin element's already-decoded pixels (its <img>.currentSrc), captured at
   *  click. The fly-in clone and the slide's base layer reuse it verbatim, so the open paints on
   *  the first frame even on a cold cache — never a fresh optimizer fetch racing the spring. */
  flightSrc?: string
  /** Origin clip's playback position (seconds) at click — the fly-in clone resumes playing from
   *  here, and the modal video seeks to the clone's live time before it takes over. */
  videoTime?: number
  /** Canvas snapshot (data URL) of the origin clip's exact on-screen frame at click — used as
   *  the fly-in clone's poster so the clone paints on its very first commit, instead of waiting
   *  the 100-500ms a fresh <video> needs (metadata + seek) before it paints anything. */
  flightPoster?: string
}

/** The outbound link a photo earns in the lightbox caption and on its permalink page:
 *  Unsplash keeps its "Download on Unsplash" affordance (the licence invites it); every
 *  other synced source gets "View on <Service>" pointing at the photo's page there. Manual
 *  local photos, and remote ones with no known source, get nothing. Unsplash is detected by
 *  URL as well as by `source`, so pre-sync records and hand-written Unsplash entries keep
 *  their link. */
export function photoSourceLink(p: Pick<UnsplashPhoto, 'id' | 'source' | 'link' | 'urls'>): { label: string; href: string } | null {
  if (p.source === 'unsplash' || (!p.source && p.urls.regular.includes('unsplash.com'))) {
    return { label: 'Download on Unsplash', href: p.link ?? `https://unsplash.com/photos/${p.id}` }
  }
  if (p.source && p.link) return { label: `View on ${PHOTO_SOURCE_LABELS[p.source]}`, href: p.link }
  return null
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "RICOH IMAGING COMPANY, LTD." + "RICOH GR IIIx" → "Ricoh GR IIIx". Drops a leading brand
 *  word from the model that just repeats the make, so the camera never reads doubled; cameras
 *  whose model doesn't repeat the make (e.g. "X-T4") are untouched. Shared by the lightbox
 *  exif line and the photo feed's info card. */
export function formatCamera(rawMake: string | null, rawModel: string | null): string | null {
  const make = rawMake ? (/ricoh/i.test(rawMake) ? 'Ricoh' : toTitleCase(rawMake)) : null
  let model = rawModel ?? null
  if (make && model) {
    model = model.replace(new RegExp(`^${make.split(/[\s,]/)[0]}\\s+`, 'i'), '') || null
  }
  if (!make && !model) return null
  return [make, model].filter(Boolean).join(' ')
}

export function formatExif(exif: UnsplashExif): string {
  const parts: string[] = []
  const camera = formatCamera(exif.make, exif.model)
  if (camera) parts.push(camera)
  if (exif.focal_length) parts.push(`${exif.focal_length}mm`)
  if (exif.aperture) parts.push(`ƒ/${exif.aperture}`)
  if (exif.exposure_time) parts.push(`${exif.exposure_time}s`)
  if (exif.iso) parts.push(`ISO ${exif.iso}`)
  return parts.join(' · ')
}

