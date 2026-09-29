'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { bleedsShimmer } from '@/lib/image-transparency'

interface ImgModalProps {
  src: string
  alt: string
  width: number
  height: number
  sizes: string
  className?: string
  priority?: boolean
  loading?: 'lazy' | 'eager'
}

/**
 * An article/store image that opens in the shared lightbox. Presentational: it renders a
 * zoomable button carrying the src/alt and a loading shimmer sized to the image; the
 * page-level <AssetLightbox> delegates the click and builds the gallery (images + clips)
 * from every asset on the page. Kept its own file so the shimmer's `use client` never
 * leaks into mdx-components.
 */
export function ImgModal({ src, alt, width, height, sizes, className, priority, loading }: ImgModalProps) {
  const [loaded, setLoaded] = useState(false)
  // `onLoad` fires asynchronously EVEN FOR AN IMAGE THAT IS ALREADY CACHED AND DECODED, so the
  // shimmer got a frame or two on screen before the image covered it — a near-white blink in
  // light mode on every revisit. A ref callback runs during commit, before paint, so an image
  // that is already complete skips the shimmer entirely and never blinks. Images that really
  // are still loading are unaffected: they have no frame yet, so `complete` is false.
  const measureIfCached = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setLoaded(true)
  }, [])
  // Baked iPhone bezels have transparent corners — round the shimmer to the phone (its outer
  // radius is ~20% of width) so it doesn't flash a hard rectangle behind them while loading.
  // The vertical % is aspect-corrected so the corners stay uniform on the portrait box.
  const isBezel = src.includes('/bezel/')
  const bezelRadius = isBezel ? `20% / ${((20 * width) / height).toFixed(2)}%` : undefined
  return (
    <button
      data-img-modal
      data-src={src}
      data-alt={alt}
      // Carried into the lightbox so the modal's loading shimmer rounds to the same phone
      // silhouette as this in-article bezel (see AssetShimmer).
      data-frame-radius={bezelRadius}
      // hover dim = the same quiet opacity affordance the case-study cards use
      // (design-card.tsx), so the image reads as zoomable before the cursor confirms it.
      className="relative block w-full cursor-zoom-in transition-opacity hover:opacity-90 active:opacity-90"
      aria-label={alt ? `Enlarge: ${alt}` : 'View enlarged'}
    >
      {/* Shimmer sits behind; an OPAQUE image covers it as it decodes (no flash). An image with
          real transparency does not cover it — the shimmer shows straight through, so you see the
          shimmer and the picture at once and it reads as a shimmer that will not go away. Those
          images get no shimmer at all (bleedsShimmer, measured at build time). Bezel screenshots
          are alpha only at their rounded corners, so they stay below the threshold and keep it. */}
      {!loaded && !bleedsShimmer(src) && (
        <span aria-hidden className="shimmer absolute inset-0 z-0" style={bezelRadius ? { borderRadius: bezelRadius } : undefined} />
      )}
      <Image
        ref={measureIfCached}
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={`relative z-10${className ? ` ${className}` : ''}`}
        priority={priority}
        loading={priority ? undefined : loading}
        onLoad={() => setLoaded(true)}
      />
    </button>
  )
}
