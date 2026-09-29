import VIDEO_DIMS from '@/generated/video-dimensions.json'

/**
 * The declared aspect ratio for a clip, e.g. `886 / 1920`.
 *
 * A <video> has NO intrinsic size until its metadata downloads, so the browser falls back to the
 * default 300x150 replaced-element box (ratio 2). The loading shimmer is absolute inset-0 inside
 * that box, so without this it paints at the wrong shape until metadata lands — badly wrong for
 * portrait clips (a 0.46 ratio rendered at 2.0) — and the box then jumps to full size, which is
 * real CLS. Declaring the ratio reserves the correct box on the first paint.
 *
 * Dimensions come from scripts/generate-video-dimensions.mjs (read from each clip's poster, which
 * shares its aspect ratio). Keyed off the .mp4: authors point GifVideo at either the .mp4 or the
 * .webm, so normalise before looking up. An unknown src returns undefined, which leaves the old
 * behaviour untouched.
 *
 * BezelVideo does not use this: every baked master is 900x1840 and it declares that directly.
 */
export function aspectFor(src?: string): string | undefined {
  if (!src) return undefined
  const key = src.replace(/\.(mp4|webm)$/i, '') + '.mp4'
  const d = (VIDEO_DIMS as Record<string, { w: number; h: number }>)[key]
  return d ? `${d.w} / ${d.h}` : undefined
}
