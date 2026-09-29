import { pageMetadata } from '@/lib/seo'
import { PageShell } from '@/components/layout/page-shell'
import { TableOfContents } from '@/components/blog/table-of-contents'
import { DESIGNS, PATENTS } from '@/lib/designs'
import { DesignCard } from '@/components/designs/design-card'

export const metadata = pageMetadata({
  title: 'Designs',
  description: 'Selected design work and case studies.',
  path: '/designs',
})

const toc = [
  ...DESIGNS.map((d) => ({ depth: 2 as const, text: d.title, slug: d.slug })),
  ...(PATENTS.length > 0 ? [{ depth: 2 as const, text: 'Patents', slug: 'patents' }] : []),
]

export default function DesignsPage() {
  return (
    <PageShell title="Designs" headerClassName="col-prose" className="has-toc" subtitle="Selected design work and case studies">
      <TableOfContents toc={toc} />

      <div className="col-prose flex flex-col">
        {DESIGNS.map((design, i) => (
          <div key={design.slug} id={design.slug}>
            {i > 0 && (
              <div className="my-24">
                <hr className="section-rule" />
              </div>
            )}
            <DesignCard design={design} index={i} />
          </div>
        ))}

        <div className="my-24">
          <hr className="section-rule" />
        </div>
        {PATENTS.length > 0 && <section id="patents">
          <h2 className="font-sans font-medium text-h2 leading-[1.15] tracking-[-0.02em] text-foreground mb-8">
            Patents
          </h2>
          {/* The article-body ul register: flush-hung "— " markers (.list-dash). The
              prose size sits on the UL, not the li — .list-dash's padding is in em, and
              it must resolve at the same size as the li dash offset. */}
          <ul className="list-dash space-y-5 font-sans text-prose leading-prose tracking-[-0.01em]">
            {PATENTS.map((p) => (
              <li key={p.num}>
                <a
                  href={`https://patents.google.com/patent/${p.num}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="accent-link"
                >
                  {p.num} · {p.title}
                </a>
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </PageShell>
  )
}
