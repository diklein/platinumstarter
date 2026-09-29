import type { Post } from '@/lib/posts'
import { homeCells } from './home-cells'

interface HomeGridProps {
  posts: Post[]
}

const COL = 'home-col col-span-12 md:col-span-6 2xl:col-span-3 grid grid-cols-4 gap-x-6'

/** The cells under the hero, in `site.home.grid` order (see home-cells.tsx for what each
 *  needs). Renders nothing at all when every configured cell self-disabled. */
export async function HomeGrid({ posts }: HomeGridProps) {
  const cells = await homeCells(posts)
  if (cells.length === 0) return null
  return (
    <>
      {/* First-paint stagger: the four columns rise+fade in one after another (70ms apart), so the
          grid resolves as a cascade rather than a slab. It's the home page (seen occasionally, not
          hundreds of times a day), so a one-time entrance is warranted. `both` holds the start frame
          before the delay elapses, so nothing flashes at full opacity first. Reduced motion keeps the
          fade but drops the movement, per the house policy. Injected here rather than globals.css
          because this dev session's Turbopack won't recompile appended globals. */}
      <style>{`
        @keyframes home-rise { from { opacity: 0; transform: translateY(10px); } }
        @keyframes home-fade { from { opacity: 0; } }
        .home-col { animation: home-rise 460ms var(--ease-out) both; }
        @media (prefers-reduced-motion: reduce) {
          .home-col { animation: home-fade 300ms ease both; }
        }
      `}</style>
      <section
        aria-label="Home content"
        className="mt-auto grid grid-cols-12 gap-x-6 gap-y-12 pb-8 pt-8"
      >
        {cells.map((cell, i) => (
          <div key={i} className={COL} style={i ? { animationDelay: `${i * 70}ms` } : undefined}>
            {cell}
          </div>
        ))}
      </section>
    </>
  )
}
