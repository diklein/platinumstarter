import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = pageMetadata({
  title: 'Podcasts',
  description: 'Shows worth a subscription, with a line on why.',
  path: '/podcasts',
})

const A = 'text-foreground link-accent-hover underline underline-offset-[3px]'

// Example data: three FICTIONAL shows with generated placeholder art
// (scripts/generate-example-covers.mjs); the links point at example.com, the domain reserved
// for examples. Replace the entries with what you listen to; descriptions take *italics*,
// **bold**, and [links](url).
const podcasts = [
  {
    example: true,
    name: 'The Grid Hour',
    image: 'example-grid-hour.png',
    description: '*The Grid Hour* is a weekly conversation about layout systems, from newspaper columns to CSS grid, and why twelve keeps winning.',
    link: { label: 'example.com', href: 'https://example.com/the-grid-hour' },
  },
  {
    example: true,
    name: 'Ship Notes',
    image: 'example-ship-notes.png',
    description: '*Ship Notes* is fifteen minutes on one publishing tool per episode: what it does, what it costs, and whether it stays in the workflow.',
    link: { label: 'example.com', href: 'https://example.com/ship-notes' },
  },
  {
    example: true,
    name: 'Darkroom Radio',
    image: 'example-darkroom-radio.png',
    description: '*Darkroom Radio* has photographers talk through one picture each: where they stood, what they metered, and what they would do differently.',
    link: { label: 'example.com', href: 'https://example.com/darkroom-radio' },
  },
]

function renderDescription(text: string) {
  // Parse inline markdown: *italic* and [label](url)
  const parts = text.split(/(\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return <Link key={i} href={linkMatch[2]} className={A} target="_blank" rel="noopener noreferrer">{linkMatch[1]}<span className="sr-only"> (opens in new tab)</span></Link>
    }
    return part
  })
}

export default function PodcastsPage() {
  return (
    <PageShell title="Podcasts" headerClassName="col-span-12" subtitle="Shows worth a subscription">

      {/* Full-width nested grid mirroring the page grid (grid-cols-12 gap-x-6) so the
          .col-gallery-item nth-child placements count only items, never the header. */}
      <div className="col-span-12 grid grid-cols-12 gap-x-6 gap-y-20">
        {podcasts.map((podcast, index) => (
          <div key={podcast.name} className="col-gallery-item">
            {/* Same 176px art slot as /books so both galleries share one rhythm. */}
            <div className="relative w-44 h-44 mb-6 overflow-hidden">
              <Image
                src={`/images/podcasts/${podcast.image}`}
                alt=""
                fill
                sizes="176px"
                className="object-cover"
                loading={index < 6 ? 'eager' : 'lazy'}
              />
            </div>
            <h2 className="font-sans font-semibold text-prose leading-prose tracking-[-0.01em] text-foreground mb-2">
              {podcast.name}
            </h2>
            <p className="font-sans text-[1.125rem] leading-normal text-foreground mb-4">
              {renderDescription(podcast.description)}
            </p>
            <Link
              href={podcast.link.href}
              className="font-sans text-[1.125rem] text-primary underline underline-offset-[3px] decoration-primary hover:opacity-70 active:opacity-70 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {podcast.link.label}<span className="sr-only"> (opens in new tab)</span>
            </Link>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
