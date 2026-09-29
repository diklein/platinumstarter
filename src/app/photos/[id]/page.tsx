import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShareButton } from '@/components/ui/share-button'
import { buttonVariants } from '@/components/ui/button'
import { getAllPhotos, getPhotoById } from '@/lib/photo-feed'
import { formatCamera, photoSourceLink } from '@/lib/unsplash-photos'
import { formatDate } from '@/lib/posts'
import { pageMetadata, SITE } from '@/lib/seo'
import { site } from '@/lib/site-config'

// One page per photo — the permalink Openfeed items point at (and the lightbox's
// "Permalink" link). Statically generated for every photo in the merged /photos set.
// Laid out like a writing post: back link + Copy URL row, date, and caption in the
// standard prose column ABOVE the photo, then the photo across all twelve columns.
// EXIF renders as the /lab/shot-data spec plate: photo and plate share one hairline
// frame, tiny tracked labels over mono tabular values, hairline rules between cells.
export const dynamicParams = false

export function generateStaticParams() {
  return getAllPhotos().map((p) => ({ id: p.id }))
}

/** The sharp rendition: same recipe as the lightbox's hi-res layer (2048px, auto=format so
 *  Unsplash serves AVIF/WebP). Local photos go through the optimizer instead. */
function displayUrl(regular: string): string {
  return regular.replace(/([&?])w=\d+/, '$1w=2048').replace('fm=jpg', 'auto=format')
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = getPhotoById(id)
  if (!photo) return {}
  const caption = photo.description ?? photo.alt_description ?? null
  const image = photo.urls.regular.startsWith('/')
    ? `${SITE.url}${photo.urls.regular}`
    : photo.urls.regular
  const meta = pageMetadata({
    title: caption ?? 'Photo',
    description: caption ?? 'A photo from the journal.',
    path: `/photos/${id}`,
    images: [{ url: image, width: photo.width, height: photo.height }],
  })
  return {
    ...meta,
    // Openfeed discovery: any photo page URL leads a reader to the feed.
    alternates: {
      ...meta.alternates,
      types: { 'application/feed+json': `${SITE.url}/photos/feed.json` },
    },
  }
}

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = getPhotoById(id)
  if (!photo) notFound()

  const caption = photo.description ?? photo.alt_description ?? null
  const date = photo.created_at ? formatDate(photo.created_at) : null
  // Unsplash keeps "Download on Unsplash"; other synced sources get "View on <Service>".
  const sourceLink = photoSourceLink(photo)

  // The spec plate's cells, only for fields this photo actually carries. Camera reads
  // like a photographer ("Fujifilm X-T4"), the rest are the raw numbers in the units
  // the camera speaks.
  const exifCells: Array<{ label: string; value: string }> = []
  const camera = formatCamera(photo.exif?.make ?? null, photo.exif?.model ?? null)
  if (camera) exifCells.push({ label: 'Camera', value: camera })
  if (photo.exif?.focal_length) exifCells.push({ label: 'Focal', value: `${photo.exif.focal_length}mm` })
  if (photo.exif?.aperture) exifCells.push({ label: 'Aperture', value: `ƒ/${photo.exif.aperture}` })
  if (photo.exif?.exposure_time) exifCells.push({ label: 'Shutter', value: `${photo.exif.exposure_time}s` })
  if (photo.exif?.iso) exifCells.push({ label: 'ISO', value: String(photo.exif.iso) })


  return (
    <div className="px-6 md:px-12 pt-36 pb-32 grid grid-cols-12 gap-x-6">
      {/* The page's one heading — visually the photo speaks for itself, so it stays sr-only. */}
      <h1 className="sr-only">{caption ?? `Photo by ${site.identity.name}`}</h1>
      <div className="col-prose mb-12">
        <div className="flex items-center justify-between mb-6">
          <Link href="/photos" className="link-subtle font-sans text-sm">
            <span aria-hidden="true" className="mr-1 inline-block">←</span>Photos
          </Link>
          <div className="flex items-center gap-2">
            {sourceLink && (
              // The source link as a gray button beside Copy URL — buttonVariants is the
              // sanctioned anchor-as-button path (see button.tsx).
              <a
                href={sourceLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'secondary', size: 'default' })}
              >
                {sourceLink.label}
              </a>
            )}
            <ShareButton />
          </div>
        </div>
        {date && <p className="section-label mb-5">{date}</p>}
        {caption && (
          <p className="font-sans text-prose leading-prose text-foreground">{caption}</p>
        )}
      </div>
      {/* EXIF sits ABOVE the photo, in flow: the shot-data cell anatomy (tracked label
          over mono tabular value) as a quiet borderless row on the page background —
          nothing overlaps the photograph. Without EXIF the photo stands alone. */}
      {exifCells.length > 0 && (
        <dl className="col-prose mb-4 flex flex-wrap justify-between gap-y-2">
          {exifCells.map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <dt className="section-label">{f.label}</dt>
              <dd className="font-mono text-label leading-[1.1] tabular-nums text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <figure className="col-span-12">
        <Image
          src={displayUrl(photo.urls.regular)}
          alt={photo.alt_description ?? photo.description ?? ''}
          width={photo.width}
          height={photo.height}
          sizes="100vw"
          priority
          // Remote Unsplash files are already optimizer output (auto=format above);
          // re-optimizing them would double-process. Local files use the optimizer.
          unoptimized={!photo.urls.regular.startsWith('/')}
          className="block h-auto w-full img-outline"
        />
      </figure>
    </div>
  )
}
