import { pageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/site-config'
import { PageShell } from '@/components/layout/page-shell'
import { PhotosGrid } from '@/components/photos/photos-grid'
import { PhotosInteractive } from '@/components/photos/photos-interactive'
import photos from '@/lib/synced-photos.json'
import { manualPhotos } from '@/lib/manual-photos'
import type { UnsplashPhoto } from '@/lib/unsplash-photos'
import { site } from '@/lib/site-config'

const baseMetadata = pageMetadata({
  title: 'Photos',
  description: site.photos.description,
  path: '/photos',
})

// The photo feed (Openfeed) is discoverable from its home page as well as from
// every photo permalink page (src/app/photos/[id]/page.tsx does the same).
export const metadata = {
  ...baseMetadata,
  alternates: {
    ...baseMetadata.alternates,
    types: { 'application/feed+json': absoluteUrl('/photos/feed.json') },
  },
}

export default function PhotosPage() {
  const sorted = [...manualPhotos, ...(photos as UnsplashPhoto[])]
    .sort((a, b) => {
      const ts = (p: UnsplashPhoto) => p.created_at ? Date.parse(p.created_at) : 0
      return ts(b) - ts(a)
    })
    // The grid and lightbox only ever read urls.regular; urls.small would otherwise
    // ride the client-component boundary as ~25KB of dead weight in the RSC payload.
    .map(({ urls: { regular }, ...rest }) => ({ ...rest, urls: { regular } }))

  return (
    <PageShell title="Photos" headerClassName="col-span-12" subtitle="Photographs, with the camera and settings behind each one">
      <PhotosInteractive>
        <PhotosGrid photos={sorted} />
      </PhotosInteractive>
    </PageShell>
  )
}
