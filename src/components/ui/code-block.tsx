import { codeToHtml } from 'shiki'
import { CopyCodeButton } from '@/components/mdx/copy-code-button'

/**
 * The shared code block for bespoke TSX pages, unified with the article pipeline's
 * treatment (2026-08-30): the same Shiki dual theme (min-light/min-dark), the same
 * gray well, the same copy chip, and the same optional filename band. MDX articles
 * get all of this via rehype-pretty-code; pages that hand-build their layout render
 * this instead of the old monochrome <pre>.
 *
 * Server-only: Shiki runs at build/render time, no client JS. Recipe CSS lives in
 * globals.css under .code-block, sharing selectors with the article figure rules.
 */
export async function CodeBlock({
  children,
  lang = 'bash',
  title,
  lineNumbers,
  className = '',
}: {
  /** The code, as a plain string — the same children API the local Code helpers had. */
  children: string
  lang?: string
  /** Optional filename band; when present the copy chip moves into it, always visible. */
  title?: string
  /** Line numbers: defaults to on for multi-line code, off for one-liners. */
  lineNumbers?: boolean
  /** Grid seat + margin, owned by the caller (col-* classes must sit on the grid child). */
  className?: string
}) {
  const html = await codeToHtml(children, {
    lang,
    themes: { light: 'min-light', dark: 'min-dark' },
    defaultColor: false,
    cssVariablePrefix: '--shiki-',
  })
  // Shiki's own <pre> wrapper is discarded (its class/style carry theme backgrounds the
  // well replaces); the token <code> gains a data-theme attribute so the global
  // dual-theme binding in globals.css (code[data-theme*=" "]) colors the tokens, and
  // data-line-numbers when numbering. Numbers are for REFERENCEABLE code, not command
  // sequences (2026-08-31: a near-empty gutter beside two npx lines reads as a
  // fat inconsistent margin) — so the default is multi-line AND not a shell language;
  // the prop overrides in either direction.
  // Raw Shiki emits <span class="line"> rows, NOT rehype-pretty-code's [data-line] —
  // the .code-block CSS in globals targets this shape.
  const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'text'])
  const numbered = lineNumbers ?? (children.trimEnd().includes('\n') && !SHELL_LANGS.has(lang))
  const code = html
    .replace(/^<pre[^>]*><code[^>]*/, '<code data-theme="min-light min-dark"')
    .replace(/<\/code><\/pre>\s*$/, '</code>')
  // The gutter is a REAL column OUTSIDE the scroll container — only the pre scrolls, so
  // the numbers can never ride away or be slid under (the sticky-pseudo approach leaked
  // scrolled glyphs at the well edge; screenshots, 2026-08-31). Same line-height
  // and font as the code, so the rails stay in register; unselectable and aria-hidden,
  // so neither copy nor screen readers ever meet a line number.
  const lineCount = numbered ? children.trimEnd().split('\n').length : 0
  return (
    <figure className={`code-block group relative ${className}`}>
      {title && <figcaption data-code-title="">{title}</figcaption>}
      {numbered ? (
        <div className="code-gutter-row">
          <div className="code-gutter" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="Code sample"
            className="overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: code }}
          />
        </div>
      ) : (
        <pre
          tabIndex={0}
          role="region"
          aria-label="Code sample"
          className="overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: code }}
        />
      )}
      <CopyCodeButton />
    </figure>
  )
}
