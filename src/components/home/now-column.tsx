import Link from 'next/link'
import type { ReactNode } from 'react'
import type { NowData } from '@/lib/now'

/* The homepage "now" column — a quiet right-hand rail of current signals, promoted from
 * /lab/now-sidebar. One even vertical rhythm (a single gap-9), no rules between sections. All
 * static text on the theme tokens (correct in light AND dark), so it stays a Server Component
 * with no client JS. Data comes from getNowData() — see src/lib/now.ts. */

const COLUMN_LABEL = 'section-label'
const SECTION_LABEL = 'font-sans text-[12px] tracking-[0.01em] text-[var(--color-muted)]'
const VALUE = 'text-[15px] leading-snug text-foreground'
// Trim a section's last line flush to its baseline so every content→next-label gap reads equal
// under the single gap-9 rhythm.
const TRIM_END = '[text-box-trim:trim-end] [text-box-edge:cap_alphabetic]'

/** One section shell: a label with a fixed gap to its content, so label→content spacing is
 *  identical everywhere and the equal gap between sections (on the column) carries the rhythm. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className={`${SECTION_LABEL} mb-1`}>{label}</p>
      {children}
    </section>
  )
}

export function NowColumn({ data, className }: { data: NowData; className?: string }) {
  return (
    <aside className={className}>
      <div className="flex flex-col gap-9">
        {/* Column name. text-box-trim pins its cap-top to the column's top padding, which is set
            (in page.tsx) to land exactly on the hero's first-line cap. No negative margin, so it
            sits the same gap-9 above Reading that separates every other section — uniform rhythm. */}
        <p className={`${COLUMN_LABEL} [text-box-trim:trim-both] [text-box-edge:cap_alphabetic]`}>
          The latest
        </p>

        {data.reading && (
          <Section label="Reading">
            <p className={VALUE}>{data.reading.title}</p>
            <p className={`mt-1 text-label leading-snug text-[var(--color-muted)] ${TRIM_END}`}>
              by {data.reading.author}
            </p>
          </Section>
        )}

        {data.post && (
          <Section label="Latest post">
            <Link href={data.post.href} className={`link-subtle block text-[15px] leading-snug ${TRIM_END}`}>
              {data.post.title}
            </Link>
          </Section>
        )}
      </div>
    </aside>
  )
}
