import Link from 'next/link'
import { Check, Square } from 'lucide-react'
import { site, SETUP_STEPS, type SetupStep } from '@/lib/site-config'
import { CodeBlock } from '@/components/ui/code-block'

/**
 * The first-run guide: the kit introducing itself and ranking the three ways to make it
 * yours, with the setup checklist. The body of /setup, which exists while `setup.completed`
 * is false (see setupPageVisible() in site-config.ts).
 */
const STEP_LABEL: Record<SetupStep, string> = {
  identity: 'Identity: your name, tagline, and email in site.config.ts',
  shape: 'Shape: a preset picked (Writer, Photographer, Designer, Everything)',
  brand: 'Brand: an accent color and a mark, or the defaults kept',
  content: 'Content: a first post, an import, or the examples kept on purpose',
  ship: 'Ship: a git remote and a Vercel project',
}

const PROSE = 'font-sans text-prose text-foreground'
const MUTED = 'font-sans text-prose text-[var(--color-muted)]'

function Door({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-x-2">
      <span className={`${MUTED} tabular-nums`} aria-hidden="true">{n}.</span>
      <div className="flex flex-col gap-3">{children}</div>
    </li>
  )
}

export function SetupGuide() {
  const steps = site.setup.steps
  const done = SETUP_STEPS.filter((s) => steps[s]).length
  return (
    <div className="col-prose flex flex-col gap-8">
        <p className={PROSE}>
          Everything on this site is example content until you make it yours. Three ways in,
          the best first:
        </p>

        <ol className="flex flex-col gap-6">
          <Door n={1}>
            <p className={PROSE}>Open this folder in Claude Code and say:</p>
            <CodeBlock lang="text" lineNumbers={false}>set up my site</CodeBlock>
          </Door>
          <Door n={2}>
            <p className={PROSE}>
              Use the wizard at{' '}
              <Link prefetch={false} href="/settings?setup=1" className="accent-link">
                /settings?setup=1
              </Link>
              {' '}(development only). Same checklist, one screen per step.
            </p>
          </Door>
          <Door n={3}>
            <p className={PROSE}>
              Edit <code className="font-mono text-[0.9em]">site.config.ts</code> by hand.
              Every field has a comment and a default; identity first.
            </p>
          </Door>
        </ol>

        <div className="flex flex-col gap-4">
          <h3 className="section-label">
            Checklist, {done} of {SETUP_STEPS.length} done
          </h3>
          <ul className="flex flex-col gap-3">
            {SETUP_STEPS.map((step) => {
              const isDone = steps[step]
              const Icon = isDone ? Check : Square
              return (
                <li key={step} className="grid grid-cols-[1.5rem_1fr] gap-x-2 items-baseline">
                  <Icon
                    className={`size-3.5 self-center ${isDone ? 'text-foreground' : 'text-[var(--color-muted)]'}`}
                    aria-hidden="true"
                  />
                  <span className={isDone ? MUTED : PROSE}>
                    <span className="sr-only">{isDone ? 'Done: ' : 'To do: '}</span>
                    {STEP_LABEL[step]}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="section-label">
            This page and its nav entry stay until
            {' '}<code className="font-mono">setup.completed</code> is true in site.config.ts.
            A production site that is not set up shows a setup notice instead of the demo.
          </p>
        </div>
    </div>
  )
}
