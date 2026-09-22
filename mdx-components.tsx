import type { MDXComponents } from 'mdx/types'
import React from 'react'
import { makeMdxImg } from '@/components/mdx/img'
import { VideoEmbed } from '@/components/mdx/video-embed'
import { AutoplayVideo } from '@/components/mdx/autoplay-video'
import { PhotoCaption } from '@/components/mdx/photo-caption'
import { ProductCard } from '@/components/mdx/product-card'
import AMAZON_PRODUCTS from '@/lib/amazon-products.json'
import { AppList, App } from '@/components/mdx/app-list'
import { Slideshow } from '@/components/mdx/slideshow'
import { SkillCard } from '@/components/mdx/skill-card'
import { TlDr } from '@/components/mdx/tldr'
import { DesignDetails } from '@/components/mdx/design-details'
import { PhoneVideoClassic, PhoneVideoModern } from '@/components/mdx/phone-frame-video'
import { ImageRow } from '@/components/mdx/image-row'
import { GifVideo } from '@/components/mdx/gif-video'
import { BezelVideo } from '@/components/mdx/bezel-video'
import { BezelImage } from '@/components/mdx/bezel-image'
import { PostNote } from '@/components/mdx/post-note'
import { BlinkComparator } from '@/components/mdx/blink-comparator'
import { IconFamiliesDemo } from '@/components/mdx/icon-families-demo'
import { IconChaosDemo } from '@/components/mdx/icon-chaos-demo'
import { CopyCodeButton } from '@/components/mdx/copy-code-button'
import { aspectFor } from '@/lib/video-aspect'

const TEXT_COL = 'col-prose'
const MEDIA_COL = 'col-media'
const PORTRAIT_COL = 'col-portrait'
// Loading-shimmer corner radius for portrait/bezel clips. The slash form keeps the
// corners circular on the ~900:1840 phone aspect (18% of width == 8.8% of height ==
// the iPhone frame's measured ~166px outer radius) and scales with the clip — no
// container query needed, so it can't disturb the intrinsic-width sizing of the figure.
const PHONE_RADIUS = '18% / 8.8%'

// Total words in a list's rendered text, walked from the React tree (strings inside li
// elements, links, emphasis — everything). Drives the short/long list spacing rule.
function listWordCount(node: React.ReactNode): number {
  if (node == null || typeof node === 'boolean') return 0
  if (typeof node === 'string') return node.split(/\s+/).filter(Boolean).length
  if (typeof node === 'number') return 1
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + listWordCount(c), 0)
  if (React.isValidElement(node)) return listWordCount((node.props as { children?: React.ReactNode }).children)
  return 0
}

// Top-level items in the list (the li elements among ul/ol children; MDX interleaves them
// with whitespace strings, which isValidElement skips).
function listItemCount(node: React.ReactNode): number {
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + listItemCount(c), 0)
  return React.isValidElement(node) ? 1 : 0
}

// SHORT AND LONG LISTS ARE SPACED DIFFERENTLY (Marcin's rule, applied at render time — this
// runs in the RSC, so the measurement is free). The trigger is per-ITEM density, not the
// list's total: a checklist of one-line labels scans best tight no matter how many rows it
// has, while multi-line prose items read as one grey slab unless each gets air. The old
// total-word threshold (~40) misfired exactly there — ten short labels crossed it and got
// prose spacing. ~12 words is where an item starts wrapping in the prose column.
function listSpacing(children: React.ReactNode): string {
  const items = listItemCount(children)
  const avgWords = items ? listWordCount(children) / items : 0
  return avgWords >= 12 ? 'space-y-5' : 'space-y-3'
}

// Derive a first-frame poster from the video src (sibling .jpg generated from the
// mp4) so cold starts show a frame instead of a black box. An explicit poster wins.
function posterFor(src?: string, poster?: string): string | undefined {
  if (poster) return poster
  if (src && /\.mp4$/.test(src)) return src.replace(/\.mp4$/, '.jpg')
  return undefined
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className={`${TEXT_COL} font-sans font-normal text-title leading-[1.1] tracking-[var(--tracking-title)] text-foreground mt-20 mb-6`}>
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className={`${TEXT_COL} w-full font-sans font-medium text-h2 leading-[1.15] tracking-[-0.02em] text-foreground mt-40 mb-8`}>
        {children}
      </h2>
    ),
    h3: ({ children, id }) => {
      // rehype-autolink-headings wraps text in <a> — unwrap it so h3 is not a link
      const content = React.isValidElement(children) && (children as React.ReactElement).type === 'a'
        ? (children as React.ReactElement<{ children: React.ReactNode }>).props.children
        : children
      return (
        <h3 id={id} className={`${TEXT_COL} w-full font-sans font-semibold text-prose leading-[1.2] tracking-[-0.01em] text-foreground mt-24 mb-10`}>
          {content}
        </h3>
      )
    },
    p: ({ children }) => {
      // Markdown wraps standalone images in <p>. Detect by checking if the sole child
      // is a React element with a `src` prop (our img component before it renders).
      // Pass it through unwrapped so the figure's col-span-12 lands as a direct grid child.
      if (React.isValidElement(children) && 'src' in (children.props as object)) {
        return <>{children}</>
      }
      // Hang a leading curly quote into the margin. Safari does this natively via
      // body { hanging-punctuation: first }; .hang-* is the measured fallback for
      // Chrome/Firefox (see globals.css).
      const first = Array.isArray(children) ? children[0] : children
      let content: React.ReactNode = children
      let hang = ''
      if (typeof first === 'string' && first.startsWith('“')) hang = ' hang-dq'
      else if (typeof first === 'string' && first.startsWith('‘')) hang = ' hang-sq'
      else if (React.isValidElement(first) && first.type === 'a') {
        // A paragraph that opens with a link starting on a curly quote (e.g. a
        // pulled citation). Hanging the quote would drag the link's underline into
        // the margin. Split the opening quote into its own same-href anchor that
        // keeps the link's accent color (inherited from the prose-link rule) but
        // drops the underline, then hang that. The rest of the link keeps its
        // normal underline; the quote sits in the margin, red and un-underlined.
        const linkProps = first.props as { children?: React.ReactNode; href?: string }
        const linkKids = linkProps.children
        const linkText = Array.isArray(linkKids) ? linkKids[0] : linkKids
        if (typeof linkText === 'string' && (linkText.startsWith('“') || linkText.startsWith('‘'))) {
          hang = linkText.startsWith('“') ? ' hang-dq' : ' hang-sq'
          const trimmed = Array.isArray(linkKids)
            ? [linkText.slice(1), ...linkKids.slice(1)]
            : linkText.slice(1)
          const link = React.cloneElement(first as React.ReactElement<{ children?: React.ReactNode }>, undefined, trimmed)
          const rest = Array.isArray(children) ? children.slice(1) : []
          const quote = (
            <a key="hang-quote" href={linkProps.href} style={{ textDecorationLine: 'none' }}>
              {linkText[0]}
            </a>
          )
          content = [quote, link, ...rest]
        }
      }
      return (
        <p className={`${TEXT_COL} font-sans text-prose leading-prose tracking-[-0.01em] text-foreground mb-8 md:mb-10${hang}`}>
          {content}
        </p>
      )
    },
    strong: ({ children }) => (
      <strong className="font-medium">{children}</strong>
    ),
    ul: ({ children }) => (
      <ul className={`${TEXT_COL} font-sans text-prose leading-prose tracking-[-0.01em] text-foreground mb-8 md:mb-10 list-dash ${listSpacing(children)}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`${TEXT_COL} font-sans text-prose leading-prose tracking-[-0.01em] text-foreground mb-8 md:mb-10 list-decimal list-outside pl-[1.25em] ${listSpacing(children)}`}>
        {children}
      </ol>
    ),
    blockquote: ({ children }) => (
      // rule-l, not border-l: the rule is trimmed to cap height and baseline so it hangs from
      // the TYPE rather than the line boxes (see globals).
      <blockquote className={`${TEXT_COL} rule-l pl-6 font-sans font-medium text-prose leading-prose tracking-[-0.01em] text-[var(--color-muted)] mb-8 md:mb-10 [&>p]:mb-0 [&>p]:text-[inherit]`}>
        {children}
      </blockquote>
    ),
    figure: ({ children, ...props }) => {
      const p = props as Record<string, unknown>
      if ('data-rehype-pretty-code-figure' in p) {
        // The figure (not the pre wrapper) owns the group + copy button, so the button
        // can sit in the filename band when the fence carries a title (the :has() rule
        // in globals repositions it there); the click handler finds the pre by query.
        return (
          <figure className={`${TEXT_COL} group relative mb-10`} {...props}>
            {children}
            <CopyCodeButton />
          </figure>
        )
      }
      return <figure {...props}>{children}</figure>
    },
    // Inline code carries the font-mono class explicitly (not just the element default),
    // so class-scoped mono treatments — the word-spacing narrowing in globals — reach it.
    // Fenced blocks get the class too (this mapping sees every <code>), but the `pre`
    // reset in globals wins there, keeping block code's spaces at the full mono cell.
    code: ({ className, ...props }: React.ComponentProps<'code'>) => (
      <code className={className ? `font-mono ${className}` : 'font-mono'} {...props} />
    ),
    // The copy button is a SIBLING of the pre inside a relative group wrapper — inside the
    // pre it would scroll away with the code. The wrapper is invisible to the `main pre`
    // scroll-shadow styling in globals.css (descendant selectors throughout). tabIndex lets
    // Firefox/Safari keyboard users scroll an overflowing block.
    pre: ({ children, ...props }) => {
      // Pretty-code pres live inside the figure above, which carries the group wrapper
      // and the copy button; wrapping again here would double the button.
      if ('data-language' in (props as Record<string, unknown>)) {
        return (
          <pre tabIndex={0} role="region" aria-label="Code sample" className="whitespace-pre-wrap break-words" {...props}>
            {children}
          </pre>
        )
      }
      return (
        <div className="group relative">
          <pre tabIndex={0} role="region" aria-label="Code sample" className="whitespace-pre-wrap break-words" {...props}>
            {children}
          </pre>
          <CopyCodeButton />
        </div>
      )
    },
    hr: () => (
      <hr className={`${TEXT_COL} section-rule my-24`} />
    ),
    // remark-gfm emits footnotes as <section data-footnotes>. Without a mapping the section
    // is an unmapped grid child and auto-places into a stray track instead of the prose
    // column (every mapped element carries TEXT_COL itself). Styled to match the site's
    // footnote treatment: no visible "Footnotes" label,
    // definitions as quiet muted lines at prose size, red wayfinding links (see the
    // data-footnote rules in globals.css for the visited-proof ref/backref color).
    section: (props: React.ComponentProps<'section'>) => {
      if ('data-footnotes' in props) {
        return (
          <section
            {...props}
            className={`${TEXT_COL} mt-6 font-sans text-prose leading-prose [&>h2]:sr-only`}
          />
        )
      }
      return <section {...props} />
    },
    table: ({ children }) => (
      <div tabIndex={0} role="region" aria-label="Table" className={`${TEXT_COL} overflow-x-auto mb-8 md:mb-10`}>
        <table className="w-full font-sans text-prose border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-[var(--color-border)]">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="border-b border-[var(--color-border)]">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="py-2 pr-6 text-left font-sans text-label font-semibold text-[var(--color-muted)]">{children}</th>
    ),
    td: ({ children }) => (
      <td className="py-2 pr-6 text-left leading-prose">{children}</td>
    ),
    video: ({ src, poster, loop, title }: { src?: string; poster?: string; loop?: boolean; title?: string }) => {
      const isPortrait = title === 'portrait'
      return (
        <figure className={`${isPortrait ? PORTRAIT_COL : MEDIA_COL} mx-auto my-14 w-full`}>
          <AutoplayVideo
            src={src}
            poster={posterFor(src, poster)}
            loop={loop}
            className="w-full"
            frameRadius={isPortrait ? PHONE_RADIUS : undefined}
            aspectRatio={aspectFor(src)}
          />
        </figure>
      )
    },
    img: makeMdxImg(false, { count: 0 }),
    PortraitVideo: ({ src, poster, loop, noProgress }: { src?: string; poster?: string; loop?: boolean; noProgress?: boolean }) => (
      <figure className={`${PORTRAIT_COL} mx-auto my-14 w-full`} style={{ maxWidth: 480 }}>
        <AutoplayVideo src={src} poster={posterFor(src, poster)} loop={loop} progressBar={!noProgress} className="w-full" frameRadius={PHONE_RADIUS} aspectRatio={aspectFor(src)} />
      </figure>
    ),
    // Landscape in-article video. Raw <video> tags don't hit this component map
    // (literal HTML bypasses it), so content uses <Video/> to get the shared
    // no-controls + poster + shimmer + progress treatment. Add `noProgress` to
    // hide the progress bar on a specific clip.
    // w-full on the figure is load-bearing: `mx-auto` makes a grid item shrink-to-fit, so without
    // a definite width it sized itself to the <video>'s 300px default and only jumped to its real
    // width once metadata landed (same trap as BezelVideo).
    // `loose` widens the vertical margins (96px vs 56px) for demo sequences where
    // the videos ARE the content and need room to breathe between short paragraphs.
    // `darkSrc` is the same clip re-recorded in dark mode (name it `<clip>-dark.mp4`);
    // the active theme picks the source live, and the poster derives the same way.
    Video: ({ src, darkSrc, poster, darkPoster, loop, alt, noProgress, loose }: { src?: string; darkSrc?: string; poster?: string; darkPoster?: string; loop?: boolean; alt?: string; noProgress?: boolean; loose?: boolean }) => (
      <figure className={`${MEDIA_COL} mx-auto ${loose ? 'my-24' : 'my-14'} w-full`}>
        <AutoplayVideo src={src} darkSrc={darkSrc} poster={posterFor(src, poster)} darkPoster={darkSrc ? posterFor(darkSrc, darkPoster) : undefined} loop={loop} ariaLabel={alt} progressBar={!noProgress} className="w-full" aspectRatio={aspectFor(src)} />
      </figure>
    ),
    ImageRow,
    GifVideo,
    BezelVideo,
    BezelImage,
    PostNote,
    BlinkComparator,
    IconFamiliesDemo,
    IconChaosDemo,
    // Featured quote: PROSE-size Söhne Buch Kursiv (the site's one true italic,
    // 400 only), centered, wrapped in plain curly quotation marks, with a
    // centered section-label attribution. F3 from /lab/quote-concepts
    // (2026-08-28) — the title-scale rounds outshouted the page's h2 hierarchy,
    // and every added flourish lost to plain punctuation. Pass the text WITHOUT
    // quote marks; the component sets them. For the singular quote a study
    // pivots on — ordinary quotes stay markdown blockquotes.
    PullQuote: ({ children, attribution }: { children?: React.ReactNode; attribution?: string }) => (
      <blockquote className={`${TEXT_COL} py-2 mb-14 text-center`}>
        <p className="mx-auto max-w-[46ch] font-sans font-normal italic text-[length:var(--text-prose)] leading-[var(--leading-prose)] text-foreground">
          &ldquo;{children}&rdquo;
        </p>
        {attribution ? <p className="section-label mt-4">{attribution}</p> : null}
      </blockquote>
    ),
    SkillCard,
    VideoEmbed,
    PhotoCaption,
    // Bare-link cards arrive from the remark plugin carrying only an asin; the map in
    // amazon-products.json supplies title/description/image for ASINs it knows.
    // Explicit MDX props always win over the map.
    ProductCard: (props: React.ComponentProps<typeof ProductCard>) => {
      const known = props.asin
        ? (AMAZON_PRODUCTS as Record<string, { title?: string; description?: string; image?: string }>)[props.asin]
        : undefined
      return <ProductCard {...known} {...props} />
    },
    AppList,
    App,
    Slideshow,
    TlDr,
    DesignDetails,
    PhoneVideoClassic: ({ src, loop }: { src?: string; loop?: boolean }) => (
      <figure className={`${PORTRAIT_COL} mx-auto my-14`} style={{ maxWidth: 480 }}>
        <PhoneVideoClassic src={src} loop={loop} />
      </figure>
    ),
    PhoneVideoModern: ({ src, loop }: { src?: string; loop?: boolean }) => (
      <figure className={`${PORTRAIT_COL} mx-auto my-14`} style={{ maxWidth: 480 }}>
        <PhoneVideoModern src={src} loop={loop} />
      </figure>
    ),
    ...components,
  }
}
