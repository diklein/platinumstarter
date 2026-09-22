import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { SectionRail, type SectionRailGroup } from '@/components/layout/section-rail'
import { MobileToc } from '@/components/blog/mobile-toc'
import { formatDate } from '@/lib/posts'

export const metadata: Metadata = {
  title: 'Lab',
  robots: { index: false, follow: false },
}

type Item = { date: string; route: string; name: string; blurb: string }

// THE SKETCHBOOK INDEX. One flat list, newest first; the date is the day the sketch landed.
// Every src/app/lab/<slug>/page.tsx must have a row here: `lab-index-registration` in
// scripts/check-conventions.mjs fails the build for an unregistered sketch, and a row whose
// page is gone prints a note so the list never lies. The five rows below are the template's
// worked examples; replace them with your own as you go (docs/lab.md has the recipe).
const ITEMS: Item[] = [
  { date: '2026-09-01', route: '/lab/post-card-variants', name: 'Post card variants', blurb: 'The /writing list item fed worst-case content: a title that runs three lines, a title with no excerpt, a note with no title, a dozen tags, and one unbroken word longer than the column. The real WritingSearchClient renders all of it, so what breaks here breaks on the live page.' },
  { date: '2026-09-01', route: '/lab/motion-easing', name: 'Motion easing', blurb: 'The house spring from src/lib/motion.ts next to its CSS stand-in and the two easing tokens, each moving the same box across the same track. Replay from a button, and see what prefers-reduced-motion turns each one into.' },
  { date: '2026-09-01', route: '/lab/type-scale', name: 'Type scale', blurb: 'Every fluid text token from globals.css set at its own size, with the token name and the pixel value it currently resolves to. Resize the window and watch the clamp() steps slide between their minimum and maximum.' },
  { date: '2026-09-01', route: '/lab/color-tokens', name: 'Color tokens', blurb: 'The runtime color tokens rendered as swatches in a forced-light and a forced-dark panel side by side. The swatches read the live CSS variables, so a change in globals.css shows up here without touching the sketch.' },
  { date: '2026-09-01', route: '/lab/hello-lab', name: 'Hello, lab', blurb: 'The smallest sketch that counts: one page, one PageShell, one button. The page explains the three things every sketch needs (a folder, a row in this list, and the gate that keeps it out of production), so it doubles as the tutorial.' },
]

const slugOf = (route: string) => route.replace(/^\/lab\//, '')

const NAV: SectionRailGroup[] = [
  { label: 'Sketches', items: ITEMS.map((item) => ({ text: item.name, slug: slugOf(item.route) })) },
  { label: 'How it works', items: [{ text: 'The gate and the recipe', slug: 'how-it-works' }] },
]

const BODY = 'max-w-prose font-sans text-prose leading-prose text-foreground'

export default function LabIndexPage() {
  return (
    <PageShell
      title="Lab"
      subtitle="Sketch an idea here, pick the one that works, port it into the site, then delete the sketch"
      headerClassName="col-span-12 xl:col-start-4 xl:col-span-9"
    >
      <SectionRail groups={NAV} label="Lab sections" />
      {/* The rail hides below xl; the articles' floating Contents sheet takes over there. */}
      <MobileToc toc={NAV.flatMap((g) => g.items.map((i) => ({ depth: 2 as const, text: i.text, slug: i.slug })))} />

      <div className="col-span-12 xl:col-start-4 xl:col-span-9">
        <p className={BODY}>
          Every sketch is a self-contained page under <code className="font-mono">src/app/lab</code>, registered in
          the list this page is built from. The lab is reachable in local dev and on preview deployments and never
          in production, so anything can live here while it is being judged.
        </p>

        <div className="mt-16 divide-y divide-border">
          {ITEMS.map((item) => (
            <section key={item.route} id={slugOf(item.route)} className="scroll-mt-16 py-12 first:pt-0">
              <p className="section-label mb-2">
                <time dateTime={item.date}>{formatDate(item.date)}</time>
                {' · '}
                <span className="font-mono">{item.route}</span>
              </p>
              <h2 className="section-title">
                <Link href={item.route} className="link-quiet">
                  {item.name}
                </Link>
              </h2>
              <p className={`${BODY} mt-5`}>{item.blurb}</p>
              <p className="mt-5 font-sans text-label">
                <Link href={item.route} className="accent-link">
                  Open the sketch
                </Link>
              </p>
            </section>
          ))}

          <section id="how-it-works" className="scroll-mt-16 py-12">
            <h2 className="section-title">How it works</h2>
            <div className={`${BODY} mt-5 space-y-5`}>
              <p>
                <strong className="font-medium">The gate.</strong> <code className="font-mono">src/proxy.ts</code> asks{' '}
                <code className="font-mono">labReachable()</code> before it serves anything under{' '}
                <code className="font-mono">/lab</code>. The answer comes from <code className="font-mono">modules.lab</code> in{' '}
                <code className="font-mono">site.config.ts</code>: <code className="font-mono">{"{ gate: 'preview' }"}</code>{' '}
                allows local dev and preview deployments (the default), <code className="font-mono">{"{ gate: 'dev' }"}</code>{' '}
                allows local dev only, and <code className="font-mono">false</code> switches the lab off. Production never
                sees it.
              </p>
              <p>
                <strong className="font-medium">Adding a sketch.</strong> Create{' '}
                <code className="font-mono">src/app/lab/&lt;slug&gt;/page.tsx</code>, wrap it in{' '}
                <code className="font-mono">PageShell</code>, give it <code className="font-mono">robots: {'{ index: false }'}</code>,
                and add a row to <code className="font-mono">ITEMS</code> at the top of this file. Lab pages are footerless
                by design, so no <code className="font-mono">layout.tsx</code> is needed. The build runs{' '}
                <code className="font-mono">scripts/check-conventions.mjs</code>, which fails until the row exists.
              </p>
              <p>
                <strong className="font-medium">Harvesting.</strong> When a sketch wins, port it into the real page with
                the site&rsquo;s own components and tokens, then delete the sketch folder and its row. The lab is where
                ideas get compared, not where they live. The longer version is in{' '}
                <code className="font-mono">docs/lab.md</code>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
