import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/page-shell'
import { CodeBlock } from '@/components/ui/code-block'
import { site } from '@/lib/site-config'

/**
 * The production first-run state. A site created from the Deploy button is live before its
 * owner has edited a file; until `setup.completed` is true, production serves this page for
 * every route (the rewrite lives in next.config.mjs, decided at build time from the same
 * flag) instead of the template's demo content. Development and preview keep the demo and
 * the Setup page, since that is where the owner works. Not indexed: nothing here is the
 * owner's yet.
 */

export const metadata: Metadata = {
  title: `${site.identity.name}: not set up yet`,
  description: 'This site has been created but not set up. Open it in Claude Code and say "set up my site".',
  robots: { index: false, follow: false },
}

/** The repository Vercel built from, when it told us (a Deploy-button site always does). */
function repositoryUrl(): string | null {
  const provider = process.env.VERCEL_GIT_PROVIDER
  const owner = process.env.VERCEL_GIT_REPO_OWNER
  const slug = process.env.VERCEL_GIT_REPO_SLUG
  if (!owner || !slug) return null
  const host = provider === 'gitlab' ? 'gitlab.com' : provider === 'bitbucket' ? 'bitbucket.org' : 'github.com'
  return `https://${host}/${owner}/${slug}`
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

export default function SetupNeededPage() {
  const repo = repositoryUrl()
  return (
    <PageShell title={site.identity.name} subtitle="This site is live, but not set up yet">
      <div className="col-content flex flex-col gap-8">
        <p className={PROSE}>
          It was created from the Platinum template and is running as the template until it
          has an owner. Nothing here is indexed. Three ways to make it yours, the best first:
        </p>

        <ol className="flex flex-col gap-6">
          <Door n={1}>
            <p className={PROSE}>
              Get the code on your computer and run it. In a terminal, with Node 24 installed:
            </p>
            <CodeBlock lang="bash" lineNumbers={false}>{[
              `git clone ${repo ?? '<this repository>'} my-site`,
              'cd my-site',
              'npm ci',
              'npm run dev',
            ].join('\n')}</CodeBlock>
            <p className={PROSE}>
              The site will live at <code className="font-mono text-[0.9em]">http://localhost:3000</code>, with a
              setup panel on its home page. In a second terminal in the same folder, start your agent
              (Claude Code, Codex, Cursor, or Gemini CLI all read the instructions here) and say:
            </p>
            <CodeBlock lang="text" lineNumbers={false}>set up my site</CodeBlock>
            <p className={MUTED}>
              About a minute to a site that says your name, a few more to a first post. The
              push at the end replaces this page with your site.
            </p>
          </Door>
          <Door n={2}>
            <p className={PROSE}>
              Run <code className="font-mono text-[0.9em]">npm run dev</code> in the clone and use the
              wizard at <code className="font-mono text-[0.9em]">/settings?setup=1</code>. Same steps, one
              screen each.
            </p>
          </Door>
          <Door n={3}>
            <p className={PROSE}>
              Edit <code className="font-mono text-[0.9em]">site.config.ts</code> by hand. Every field has a
              comment and a default. Set <code className="font-mono text-[0.9em]">setup.completed: true</code>{' '}
              when you are done, and push.
            </p>
          </Door>
        </ol>

        {repo ? (
          <p className={MUTED}>
            The repository is{' '}
            <a href={repo} className="accent-link" rel="noopener noreferrer">
              {repo.replace(/^https:\/\//, '')}
            </a>
            .
          </p>
        ) : null}
      </div>
    </PageShell>
  )
}
