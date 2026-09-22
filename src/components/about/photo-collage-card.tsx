import Image from 'next/image'
import Link from 'next/link'
import photos from '@/lib/synced-photos.json'
import type { UnsplashPhoto } from '@/lib/unsplash-photos'
import { manualPhotos } from '@/lib/manual-photos'
import { moduleEnabled } from '@/lib/site-config'

export function PhotoCollageCard({ className }: { className?: string }) {
  // The card links into the photos module; with it off (or with no photos, local or synced)
  // it goes. Local photos (manual-photos.ts) count the same way the home grid counts them.
  if (!moduleEnabled('photos')) return null
  // The cast matters on the template: an empty sync file types as never[], which has no fields.
  const latest = [...manualPhotos, ...(photos as UnsplashPhoto[])]
    .filter((p) => p.created_at)
    .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
    .slice(0, 6)
  if (latest.length === 0) return null

  return (
    <div className={`border border-[var(--color-border)] overflow-hidden${className ? ` ${className}` : ''}`}>
      <p className="px-6 pt-5 pb-4 font-sans font-medium text-prose text-foreground">
        Recent photos
      </p>
      <div className="px-6 pb-5">
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden">
        {latest.map((photo) => (
          <div key={photo.id} className="relative aspect-square" style={{ backgroundColor: photo.color }}>
            <Image
              src={photo.urls.small ?? photo.urls.regular}
              alt={photo.alt_description ?? photo.description ?? ''}
              fill
              sizes="(max-width: 767px) 33vw, 200px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      </div>
      <div className="px-6 pb-5">
        <Link href="/photos" className="font-sans text-prose accent-link">View photos</Link>
      </div>
    </div>
  )
}
