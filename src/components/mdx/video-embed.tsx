interface VideoEmbedProps {
  src?: string
  poster?: string
  caption?: string
  width?: number
  height?: number
  /** The clip's intrinsic ratio, e.g. `16 / 9`. A <video> has no size until its metadata
   *  arrives, so the declared ratio reserves the right box on the first paint (same contract
   *  as AutoplayVideo/BezelVideo). width/height derive it too; with neither, 16/9. */
  aspectRatio?: string
  /** Optional WebVTT captions file, rendered as a <track kind="captions">. */
  captions?: string
}

export function VideoEmbed({ src, poster, caption, width, height, aspectRatio, captions }: VideoEmbedProps) {
  // Guard: render inline error block if src is missing
  if (!src) {
    if (process.env.NODE_ENV === 'development') {
      return (
        <figure className="col-span-12 md:col-start-4 md:col-span-6 my-8 p-4 border-2 border-[var(--color-destructive)] rounded">
          <p className="font-sans text-label text-[var(--color-destructive)]">
            VideoEmbed: missing required `src` attribute
          </p>
        </figure>
      )
    }
    return null
  }

  // Dev-mode guard: render inline error block if poster is missing
  // process.env.NODE_ENV === 'development' is dead-stripped in production builds
  if (!poster && process.env.NODE_ENV === 'development') {
    return (
      <figure className="my-8 p-4 border-2 border-[var(--color-destructive)] rounded">
        <p className="font-sans text-label text-[var(--color-destructive)]">
          VideoEmbed: missing required `poster` attribute (MEDIA-04)
        </p>
      </figure>
    )
  }

  return (
    // col-media + the 56px media beat — this predated the col-* system and sat on its own
    // narrower, tighter grid placement.
    <figure className="col-media my-14">
      <video
        src={src}
        poster={poster}
        controls
        // Without playsInline, iPhones hijack the play tap into fullscreen; with it,
        // playback starts in the article and fullscreen stays a deliberate choice.
        playsInline
        // The one sound-bearing player with native controls — AssetLightbox must not retag
        // it "Enlarge video" or hijack its clicks, so it opts out of the figure-video sweep.
        data-no-lightbox=""
        style={{ aspectRatio: aspectRatio ?? (width && height ? `${width} / ${height}` : '16 / 9') }}
        className="w-full rounded"
      >
        {captions && <track kind="captions" src={captions} srcLang="en" default />}
      </video>
      {caption && (
        <figcaption className="section-label mt-3 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
