import { ImgModal } from './img-modal'

// A still portrait screenshot framed in the iPhone bezel. The bezel + screenshot are BAKED
// into one flat PNG (transparent screen corners → the page/modal background shows through in
// any theme, like the H.264 clips but with real transparency). That makes it a plain image
// everywhere, so the lightbox fly-in, sizing, and shimmer are identical to every other asset
// — no masked-screen / frame-overlay / aspect-ratio layering to jitter or resize mid-animation.
// Baked assets live at /img/dot/bezel/<name>-framed.png (the Dot post's originals) or
// anywhere the image watcher writes them (public/images/writing/<name>-framed.png): a src
// already ending in -framed.png is used as-is; any other src keeps the legacy Dot rewrite.
export function BezelImage({ src, alt, width = 900, height = 1840 }: { src: string; alt?: string; width?: number; height?: number }) {
  const name = src.match(/([^/]+?)(?:@2x)?\.(?:png|jpe?g)$/i)?.[1] ?? ''
  const baked = /-framed\.png$/i.test(src) ? src : `/img/dot/bezel/${name}-framed.png`
  return (
    <figure className="col-portrait my-14">
      <div className="mx-auto" style={{ maxWidth: 460 }}>
        <ImgModal
          src={baked}
          alt={alt ?? ''}
          width={width}
          height={height}
          sizes="(max-width: 460px) 100vw, 460px"
          className="h-auto w-full"
        />
      </div>
    </figure>
  )
}
