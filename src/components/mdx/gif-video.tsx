import { AutoplayVideo } from './autoplay-video'
import { aspectFor } from '@/lib/video-aspect'

interface GifVideoProps {
  src: string
  alt?: string
  children?: React.ReactNode
  /** Hide the red progress bar (short decorative loops often don't want it). */
  noProgress?: boolean
  /** Force a hairline border on this clip (a page without the imageBorders flag). */
  border?: boolean
  /** Drop the border on this clip (a page WITH the imageBorders flag). */
  noBorder?: boolean
}

// Given any video src, derive the sibling asset paths. GifVideo authors point at
// the .mp4; the .webm (smaller, preferred) and .jpg (first-frame poster) sit
// beside it. Tolerant of a .webm src too (used by some design card images).
function siblings(src: string) {
  const base = src.replace(/\.(mp4|webm)$/i, '')
  return { mp4: `${base}.mp4`, webm: `${base}.webm`, poster: `${base}.jpg` }
}

// Kept as a named export: /designs cards (design-card.tsx) render video previews
// through this. Routes through AutoplayVideo so cards get the same poster +
// shimmer + no-controls treatment as in-article clips.
export function GifVideoPlayer({ src, alt, className, progressBar = true }: { src: string; alt?: string; className?: string; progressBar?: boolean }) {
  const { mp4, webm, poster } = siblings(src)
  return <AutoplayVideo src={mp4} webm={webm} poster={poster} loop ariaLabel={alt} className={className} progressBar={progressBar} aspectRatio={aspectFor(mp4)} />
}

export function GifVideo({ src, alt, children, noProgress, border, noBorder }: GifVideoProps) {
  const borderClass = border ? ' img-bordered' : noBorder ? ' img-no-border' : ''
  return (
    <figure className={`col-media w-full mx-auto my-14${borderClass}`}>
      <GifVideoPlayer src={src} alt={alt} className="w-full" progressBar={!noProgress} />
      {children && (
        <figcaption className="section-label mt-3 text-center">
          {children}
        </figcaption>
      )}
    </figure>
  )
}
