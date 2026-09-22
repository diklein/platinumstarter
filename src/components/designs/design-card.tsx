import Image from 'next/image'
import Link from 'next/link'
import { GifVideoPlayer } from '@/components/mdx/gif-video'
import { Badge } from '@/components/ui/badge'
import type { Design } from '@/lib/designs'

// Live canvas heroes, by slug: a component registered here fills the card's image slot with
// a theme-aware drawing instead of a baked asset. Empty by default; add `'my-study': MyHero`.
const LIVE_HEROES: Record<string, React.ComponentType> = {}

export function DesignCard({ design, index = 0 }: { design: Design; index?: number }) {
  const isVideo = design.image?.endsWith('.mp4') || design.image?.endsWith('.webm')
  const LiveHero = LIVE_HEROES[design.slug]
  return (
    <div>
      {LiveHero && (
        // Same quiet opacity affordance as the image heroes, so the drawing reads as a link.
        <Link href={`/designs/${design.slug}`} className="block transition-opacity hover:opacity-90 active:opacity-90">
          <LiveHero />
        </Link>
      )}
      {!LiveHero && design.image && (
        isVideo ? (
          // The player is interactive (tap to pause) — it must NOT nest inside the card's
          // anchor, so it stands as a sibling block in the same slot; the title and
          // "View case study" links below carry the navigation.
          <GifVideoPlayer
            src={design.image}
            alt={design.title}
            className="w-full h-auto"
            progressBar={false}
          />
        ) : (
          <Link href={`/designs/${design.slug}`} className="block">
            <Image
              src={design.image}
              alt={design.title}
              // The hero's real dimensions (designs.ts) — a hardcoded 1200x768 reserved the
              // wrong aspect box and the grid shifted as each hero decoded.
              width={design.imageWidth ?? 1200}
              height={design.imageHeight ?? 768}
              sizes="(max-width: 768px) 100vw, 50vw"
              // hover dim = the same quiet opacity affordance the case-study list uses
              // (related-designs.tsx), so the image reads as a link.
              className={`w-full h-auto transition-opacity hover:opacity-90 active:opacity-90${design.imageBlurred ? ' blur-[2px]' : ''}`}
              priority={index === 0}
            />
          </Link>
        )
      )}

      <div className="mt-10">
        <p className="section-label mb-2">
          {design.role}<span className="mx-1.5">·</span>{design.company}<span className="mx-1.5">·</span>{design.year}
          {/* The badge's h-5 + items-center give an inline-flex its own centered baseline, which
              does not sit on the meta line's baseline. Make it a plain inline box that inherits
              the line's size and baseline instead. */}
          {design.passwordProtected && (
            <><span className="mx-1.5">·</span><Badge
              variant="secondary"
              className="inline h-auto rounded-full px-1.5 py-px align-baseline text-[length:inherit] leading-[inherit]"
            >
              Password required
            </Badge></>
          )}
        </p>
        <h2 className="font-sans font-medium text-h2 leading-[1.15] tracking-[-0.02em] text-foreground mb-4">
          <Link href={`/designs/${design.slug}`} className="link-quiet">
            {design.title}
          </Link>
        </h2>
        <p className="font-sans text-prose leading-[1.45] tracking-[-0.01em] text-foreground mb-4">
          {design.description}
        </p>
        <Link
          href={`/designs/${design.slug}`}
          className="font-sans text-prose accent-link"
        >
          View case study
        </Link>
      </div>
    </div>
  )
}
