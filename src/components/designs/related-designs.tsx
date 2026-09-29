import Link from 'next/link'
import type { Design } from '@/lib/designs'

interface Props {
  designs: Design[]
  currentSlug: string
}

export function RelatedDesigns({ designs, currentSlug }: Props) {
  if (designs.length === 0) return null
  return (
    <section aria-label="Case studies">
      <h2 className="section-label mb-6">
        Case studies
      </h2>
      <ul className="space-y-4">
        {designs.map((design) => {
          const isCurrent = design.slug === currentSlug
          return (
            <li key={design.slug}>
              {isCurrent ? (
                <span className="font-sans text-prose text-[var(--color-muted)]">
                  {design.title}
                </span>
              ) : (
                <Link
                  href={`/designs/${design.slug}`}
                  className="plain-link font-sans text-prose text-foreground hover:opacity-60 active:opacity-60 transition-opacity no-underline"
                >
                  {design.title}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
