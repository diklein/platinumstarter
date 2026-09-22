import { AutoplayVideo } from './autoplay-video'

// A baked iPhone-bezel clip (the Dot post). The mp4 already has the phone frame
// and page-matched corners composited in (via ffmpeg), so there is a light and a
// dark master — the corners can't be transparent in H.264, so each matches its
// theme's page background. We render both and swap purely with CSS
// (`dark:hidden` / `hidden dark:block`): no client JS, no hydration flash.
//
// The hidden variant is display:none, so AutoplayVideo's IntersectionObserver
// never reports it as visible — it won't autoplay or fetch past metadata. On a
// theme toggle the newly-shown master starts and the other pauses. No progress
// bar (it's a device mockup, not a playback surface).
//
// Every baked master is 900x1840, and the ratio is declared so the loading shimmer
// has the right box before the clip's metadata arrives (a <video> is 300x150 until
// then, which scrunched the shimmer on any non-instant network and cost CLS).
export function BezelVideo({ name, alt }: { name: string; alt?: string }) {
  const base = `/img/dot/bezel/${name}`
  return (
    // w-full is load-bearing: `mx-auto` makes this grid item shrink-to-fit, so without a definite
    // width the figure sized itself to the <video>'s 300px default and only jumped to its real
    // width once metadata landed. A definite width keeps the box (and the shimmer inside it) at
    // full size from the first paint.
    <figure className="col-portrait mx-auto my-14 w-full" style={{ maxWidth: 460 }}>
      <div className="dark:hidden">
        <AutoplayVideo
          src={`${base}-light.mp4`}
          hiResSrc={`${base}-light-3x.mp4`}
          poster={`${base}-light.jpg`}
          loop
          ariaLabel={alt}
          progressBar={false}
          className="w-full"
          frameRadius="18% / 8.8%"
          aspectRatio="900 / 1840"
        />
      </div>
      <div className="hidden dark:block">
        <AutoplayVideo
          src={`${base}-dark.mp4`}
          hiResSrc={`${base}-dark-3x.mp4`}
          poster={`${base}-dark.jpg`}
          loop
          ariaLabel={alt}
          progressBar={false}
          className="w-full"
          frameRadius="18% / 8.8%"
          aspectRatio="900 / 1840"
        />
      </div>
    </figure>
  )
}
