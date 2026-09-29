import Image from 'next/image'

type Variant = 'full' | 'portrait' | 'narrow' | 'default' | (string & {})

interface PhotoCaptionProps {
  src?: string
  alt?: string
  caption?: string
  width?: number
  height?: number
  variant?: Variant
  /** Above-the-fold use only: preloads + eager-loads the image. Everything else lazy-loads. */
  priority?: boolean
}

function resolveLayout(variant?: Variant): { maxW: number | null; sizes: string } {
  if (!variant || variant === 'default') return { maxW: 800, sizes: '(max-width: 800px) 100vw, 800px' }
  if (variant === 'full') return { maxW: null, sizes: '100vw' }
  if (variant === 'portrait') return { maxW: 480, sizes: '(max-width: 480px) 100vw, 480px' }
  if (variant === 'narrow') return { maxW: 620, sizes: '(max-width: 620px) 100vw, 620px' }
  const n = Number(variant)
  if (!isNaN(n)) return { maxW: n, sizes: `(max-width: ${n}px) 100vw, ${n}px` }
  return { maxW: 800, sizes: '(max-width: 800px) 100vw, 800px' }
}

export function PhotoCaption({ src, alt, caption, width = 1200, height = 800, variant, priority = false }: PhotoCaptionProps) {
  if (!src) return null

  const { maxW, sizes } = resolveLayout(variant)
  const isFullBleed = maxW === null

  return (
    <figure
      className="col-span-12 my-14"
      style={!isFullBleed ? { maxWidth: maxW!, marginLeft: 'auto', marginRight: 'auto' } : undefined}
    >
      <Image
        src={src}
        alt={alt ?? ''}
        width={width}
        height={height}
        sizes={sizes}
        className="max-w-full h-auto rounded"
        priority={priority}
      />
      {caption && (
        <figcaption className="section-label mt-3 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
