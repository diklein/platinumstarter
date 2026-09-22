import Image from 'next/image'

interface ImageRowItem {
  src: string
  alt: string
}

interface ImageRowProps {
  images: ImageRowItem[]
  /** Above-the-fold use only: preloads + eager-loads the row. Everything else lazy-loads. */
  priority?: boolean
}

const TEXT_COL = 'col-media'

export function ImageRow({ images, priority = false }: ImageRowProps) {
  return (
    <div className={`${TEXT_COL} flex items-center gap-4 my-14`}>
      {images.map((img, i) => (
        <div key={i} className="flex-1 min-w-0">
          <Image
            src={img.src}
            alt={img.alt}
            width={600}
            height={800}
            sizes="(max-width: 768px) 33vw, 20vw"
            className="w-full h-auto"
            priority={priority}
          />
        </div>
      ))}
    </div>
  )
}
