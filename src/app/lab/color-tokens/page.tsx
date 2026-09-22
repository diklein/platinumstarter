import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/page-shell'

export const metadata: Metadata = {
  title: 'Lab · Color tokens',
  robots: { index: false, follow: false },
}

// THE RUNTIME COLOR TOKENS, one row each. Names and roles only: the swatches paint from the
// live CSS variables (`var(--color-bg)` and so on), so nothing here is a copied value and a
// change in globals.css shows up on the next reload. The @theme inline bridge tokens
// (--color-primary, --color-sidebar-*) are build-time aliases that never reach :root, so
// they are not listed; they resolve to rows below.
const GROUPS: { label: string; tokens: { name: string; use: string }[] }[] = [
  {
    label: 'Roles',
    tokens: [
      { name: '--color-bg', use: 'Page background' },
      { name: '--color-surface', use: 'Lifted panels and quiet fills' },
      { name: '--color-surface-subtle', use: 'Borderless fields (derived from surface and bg)' },
      { name: '--color-fg', use: 'Primary text and icons' },
      { name: '--color-muted', use: 'Secondary text, labels, captions' },
      { name: '--color-accent', use: 'Links, hover, selection, errors' },
      { name: '--color-accent-fill', use: 'The accent as a fill under light text' },
      { name: '--color-destructive', use: 'Alias of accent' },
      { name: '--color-border', use: 'Hairlines and dividers' },
      { name: '--color-border-strong', use: 'Boundaries of inputs whose border is their only edge' },
      { name: '--color-rule-strong', use: 'The article body-to-footer divider (derived)' },
      { name: '--color-secondary-bg', use: 'Secondary button fill' },
      { name: '--color-mark-mute', use: 'The site mark when it is not the active page' },
    ],
  },
  {
    label: 'Charts',
    tokens: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      name: `--chart-${n}`,
      use: n === 1 ? 'Leads with the accent' : n === 7 ? 'The quiet tail' : 'A distinct hue at matched weight',
    })),
  },
  {
    label: 'Contribution calendar',
    tokens: [0, 1, 2, 3, 4].map((n) => ({ name: `--contrib-l${n}`, use: n === 0 ? 'No activity' : `Level ${n}` })),
  },
]

function SwatchList() {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="section-label mb-3">{group.label}</p>
          <ul className="space-y-2">
            {group.tokens.map((token) => (
              <li key={token.name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="block h-9 w-12 shrink-0 border border-border"
                  style={{ backgroundColor: `var(${token.name})` }}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-label text-foreground">{token.name}</span>
                  <span className="block font-sans text-label leading-label text-[var(--color-muted)]">{token.use}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** One theme panel. The `.light` / `.dark` classes from globals.css pin the variables inside,
 *  and the panel paints its own page background so each column reads as that theme. */
function ThemePanel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={`${theme} border border-border bg-[var(--color-bg)] p-6`}>
      <p className="section-label mb-6 capitalize">{theme}</p>
      <SwatchList />
    </div>
  )
}

export default function ColorTokensPage() {
  return (
    <PageShell title="Color tokens" subtitle="Every runtime color token from globals.css, painted live in both themes">
      <div className="col-prose">
        <p className="max-w-prose font-sans text-prose leading-prose text-foreground">
          Each swatch is a box whose background is <code className="font-mono">var(--token)</code>, nothing more. The
          left panel carries the <code className="font-mono">.light</code> class and the right one{' '}
          <code className="font-mono">.dark</code>, the same classes the site&rsquo;s theme toggle puts on the
          document, so both columns show what a component would get in that theme.
        </p>
        <p className="mt-5 max-w-prose font-sans text-prose leading-prose text-foreground">
          One honest gap to riff on: <code className="font-mono">.light</code> in globals.css pins only the six core
          roles (bg, surface, fg, muted, accent, border). While your own theme is dark, the light panel shows the
          dark values for the support, chart, and calendar tokens. Extending that pin is a fine first change to make.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <ThemePanel theme="light" />
          <ThemePanel theme="dark" />
        </div>
      </div>
    </PageShell>
  )
}
