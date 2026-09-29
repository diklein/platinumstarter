import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/page-shell'
import { MotionEasingClient } from './motion-easing-client'

export const metadata: Metadata = {
  title: 'Lab · Motion easing',
  robots: { index: false, follow: false },
}

export default function MotionEasingPage() {
  return (
    <PageShell title="Motion easing" subtitle="The house spring and the easing tokens, each moving the same box across the same track">
      <div className="col-prose">
        <p className="max-w-prose font-sans text-prose leading-prose text-foreground">
          The site has one spring, <code className="font-mono">SPRING</code> in{' '}
          <code className="font-mono">src/lib/motion.ts</code>, and a few CSS easing tokens in globals.css for the
          transitions a CSS rule owns. The rows below apply each one to the same move so the character of every curve
          is visible next to the others. Replay as often as you like; with{' '}
          <code className="font-mono">prefers-reduced-motion</code> on, the spring is critically damped and the CSS
          rows jump to the end.
        </p>
        <div className="mt-12">
          <MotionEasingClient />
        </div>
      </div>
    </PageShell>
  )
}
