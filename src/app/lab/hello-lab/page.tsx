import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Lab · Hello, lab',
  robots: { index: false, follow: false },
}

// THE SMALLEST SKETCH THAT COUNTS. Copy this folder to start a new one: a page, a PageShell,
// and the site's own components. No layout.tsx (lab pages are footerless by design), no
// custom styling, no data. The page explains the three things every sketch needs.
export default function HelloLabPage() {
  return (
    <PageShell title="Hello, lab" subtitle="The smallest possible sketch, and the three things every sketch needs">
      <div className="col-content space-y-12">
        <section className="space-y-5 font-sans text-prose leading-prose text-foreground">
          <h2 className="section-title">1. A folder</h2>
          <p>
            This page is one file, <code className="font-mono">src/app/lab/hello-lab/page.tsx</code>. Every sketch is a
            folder under <code className="font-mono">src/app/lab</code> with a <code className="font-mono">page.tsx</code>{' '}
            inside, wrapped in the same <code className="font-mono">PageShell</code> the rest of the site uses, so the
            title, the grid, and the spacing are already right before you type anything.
          </p>
          <p>
            Interactive parts go in a sibling file that starts with <code className="font-mono">{"'use client'"}</code>; the
            page itself stays a server component. Build with the site&rsquo;s own components (<code className="font-mono">src/components</code>) and the tokens in <code className="font-mono">globals.css</code>, and the sketch looks like the site from the first render.
          </p>
        </section>

        <section className="space-y-5 font-sans text-prose leading-prose text-foreground">
          <h2 className="section-title">2. A row in the index</h2>
          <p>
            The <code className="font-mono">ITEMS</code> array at the top of <code className="font-mono">src/app/lab/page.tsx</code>{' '}
            is the only way anyone finds a sketch. Add one row with a <code className="font-mono">date</code>, the{' '}
            <code className="font-mono">route</code>, a <code className="font-mono">name</code>, and a one-paragraph{' '}
            <code className="font-mono">blurb</code>, newest first. The build checks that every sketch folder has a row and
            fails if one is missing.
          </p>
        </section>

        <section className="space-y-5 font-sans text-prose leading-prose text-foreground">
          <h2 className="section-title">3. The gate</h2>
          <p>
            Nothing under <code className="font-mono">/lab</code> reaches production. <code className="font-mono">src/proxy.ts</code>{' '}
            checks <code className="font-mono">modules.lab</code> in <code className="font-mono">site.config.ts</code> on every
            request: the default <code className="font-mono">{"{ gate: 'preview' }"}</code> allows local dev and preview
            deployments, <code className="font-mono">{"{ gate: 'dev' }"}</code> allows local dev only, and{' '}
            <code className="font-mono">false</code> switches the lab off. Set{' '}
            <code className="font-mono">robots: {'{ index: false }'}</code> in the page metadata as well, as this page does.
          </p>
          <p>
            When a sketch wins, port it into the real page and delete the folder and its row. When it loses, delete it
            sooner.
          </p>
        </section>

        <div>
          <Button variant="secondary" nativeButton={false} render={<Link href="/lab" />}>
            Back to the lab
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
