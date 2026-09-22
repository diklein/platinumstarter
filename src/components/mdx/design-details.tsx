import { ProductCard } from './product-card'

const ROWS = ['role', 'team', 'org', 'company', 'year', 'platform', 'tools'] as const
const LABELS: Record<string, string> = {
  role: 'Role',
  team: 'Team',
  org: 'Org',
  company: 'Company',
  year: 'Year',
  platform: 'Platform',
  tools: 'Tools',
}

type DetailsProps = Partial<Record<typeof ROWS[number], string>>

export function DesignDetails(props: DetailsProps) {
  const rows = ROWS.filter((key) => props[key] !== undefined)

  // A note-style ProductCard: the strip band labels the spec box the way TL;DR and
  // Retired label theirs, so every chrome-labeled aside is one component. The card
  // owns placement (col-prose) and spacing; the rows keep their key/value layout.
  return (
    <ProductCard strip="Details">
      <div className="w-full space-y-2">
        {/* shrink-0 label / min-w-0 value: a long value wraps in place instead of
            sizing the row to its longest word and clipping at the card edge. */}
        {rows.map((key) => (
          <div key={key} className="flex justify-between gap-8">
            <span className="shrink-0 tracking-[-0.01em] text-[var(--color-muted)]">{LABELS[key]}</span>
            <span className="min-w-0 tracking-[-0.01em]">{props[key]}</span>
          </div>
        ))}
      </div>
    </ProductCard>
  )
}
