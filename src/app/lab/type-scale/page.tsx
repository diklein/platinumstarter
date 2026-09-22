import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/page-shell'
import { TypeScaleClient, type Step } from './type-scale-client'

export const metadata: Metadata = {
  title: 'Lab · Type scale',
  robots: { index: false, follow: false },
}

// The fluid text tokens from the @theme block in globals.css, smallest first. Only the names
// live here; the sizes come from the tokens themselves at render time.
const STEPS: Step[] = [
  { token: '--text-label', use: 'Labels, captions, and metadata. The one static step.' },
  { token: '--text-prose', use: 'Body copy.' },
  { token: '--text-entry-title', use: 'A list entry title, as on /writing.', heading: true },
  { token: '--text-h2', use: 'Section headings.', heading: true },
  { token: '--text-title', use: 'An article h1.', heading: true },
  { token: '--text-listing-title', use: 'A listing page h1.', heading: true },
  { token: '--hero-text', use: 'The home hero statement.', heading: true },
]

export default function TypeScalePage() {
  return (
    <PageShell title="Type scale" subtitle="The fluid clamp() steps at their live size, with the pixel value each one resolves to right now">
      <div className="col-prose">
        <p className="max-w-prose font-sans text-prose leading-prose text-foreground">
          Every step is a <code className="font-mono">clamp()</code> in globals.css, and every specimen below simply
          sets <code className="font-mono">font-size: var(--token)</code>. Drag the window narrower and wider: the sizes
          glide between each token&rsquo;s minimum and maximum, and the readout follows.
        </p>
        <div className="mt-12">
          <TypeScaleClient steps={STEPS} />
        </div>
      </div>
    </PageShell>
  )
}
