'use client'

import { Fragment, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Command, X } from 'lucide-react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Dialog } from '@base-ui/react/dialog'
import type { SearchItem } from '@/lib/search-index'
import { loadSearchIndex } from '@/lib/search-index-client'
import { copyLogoSvg, downloadLogo, markFilename } from '@/lib/logo-actions'
import { gridOverlay, useGridOverlay } from '@/lib/grid-overlay-store'
import { labReachable } from '@/lib/site-config'
import { site, absoluteUrl } from '@/lib/site-config'

// Identity for the palette's own commands (from site.config.ts): the mailto target, the
// first name in the "Email <name>" row and its tip, the logo download's filename, and the
// " — <name>" suffix the root title template appends to document.title (stripped to build
// the mailto subject; the separator must match layout.tsx's template).
const SITE_NAME = site.identity.name
const FIRST_NAME = SITE_NAME.split(' ')[0]
const EMAIL = site.identity.email
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TITLE_SUFFIX_RE = new RegExp(' · ' + escapeRe(SITE_NAME) + '$')

type Command = {
  id: string
  label: string
  /** Fallback second line when the query doesn't appear in the body (or there is no body). */
  description?: string
  /** Full plain-text body (writing posts only, loaded lazily) — the snippet source. */
  body?: string
  /** Precomputed lowercase search targets, so a keystroke never pays toLowerCase over
   *  hundreds of KB of post text. metaLower folds keywords + description together. */
  labelLower: string
  metaLower: string
  bodyLower?: string
  /** Copy-style commands set this so `run` leaves the palette open to show their transient
   *  confirmation banner instead of the normal close-on-select behavior. */
  keepOpen?: boolean
  /** The Tip-advertised shortcut word ("theme", "copy", …). When the query IS this word the
   *  row pins to the very top, above page-content matches — the tip's promise must not land
   *  the command below a wall of posts that merely contain the same word. */
  pin?: string
  /** Heading deep links only: the parent post/study title. Presence of this field is what
   *  marks a row as a heading link — it ranks in its own tier (below title matches, above
   *  keyword matches) and renders with the muted parent prefix. */
  parent?: string
  perform: () => void
}

// Matching is LITERAL substring, not fuzzy. The palette used fuse.js here and its fuzzy
// scoring surfaced rows that didn't contain the query at all ("imac" matched "image"…),
// which reads as broken next to a snippet line that promises the query appears on the page.
// Every result now provably contains what you typed, so every result can highlight it.

/** Wrap every case-insensitive occurrence of the query in a <mark> styled exactly like the
 *  site's text selection (solid accent, light text) — see ::selection in globals.css. */
function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim().toLowerCase()
  if (!q) return text
  const lower = text.toLowerCase()
  let i = lower.indexOf(q)
  if (i === -1) return text
  const parts: React.ReactNode[] = []
  let pos = 0
  while (i !== -1) {
    if (i > pos) parts.push(text.slice(pos, i))
    parts.push(
      // accent-FILL, not accent: the dark accent is tuned for text ON dark grounds and
      // measured 3.3:1 under light text — the fill token keeps the deep red in both themes.
      <mark key={i} className="bg-[var(--color-accent-fill)] text-white dark:text-[oklch(0.98_0.005_240)]">
        {text.slice(i, i + q.length)}
      </mark>,
    )
    pos = i + q.length
    i = lower.indexOf(q, pos)
  }
  parts.push(text.slice(pos))
  return parts
}

/** The first place the query appears in a post's body, as a one-line window: back up to a
 *  word boundary ~40 chars before the match so there's leading context, then run long enough
 *  that truncation (not this function) decides where the line visually ends. */
function extractSnippet(body: string, bodyLower: string, q: string): string | null {
  if (!q) return null
  const i = bodyLower.indexOf(q)
  if (i === -1) return null
  let from = 0
  if (i > 40) {
    const boundary = body.indexOf(' ', i - 40)
    from = boundary === -1 ? i - 40 : boundary + 1
  }
  const to = Math.min(body.length, i + q.length + 160)
  return (from > 0 ? '… ' : '') + body.slice(from, to).trim()
}

/** Rendering cap. Only 1–2 character queries produce more literal matches than this, and those
 *  result sets are noise nobody scrolls — while rendering hundreds of two-line rows was the
 *  bulk of the keystroke cost. */
const MAX_RESULTS = 24

/** How long each Tip holds before the strip swaps to the next one. */
const TIP_ROTATE_MS = 3000

/** The literal text a tip suggests typing, set in the mono font so it reads as input —
 *  on a highlighter run one tint step darker than the strip band (fg/6% over the band's
 *  fg/4%; dark: black/25 over black/20). Same anatomy as the branded self-link
 *  highlighter (square corners, 0.2em sides, 0.1em vertical with the 1px optical trim
 *  on top), just a different color (2026-08-31). Inline background, so the strip's
 *  fixed 22px row is untouched. */
function TipQuery({ children }: { children: string }) {
  return (
    <span className="bg-foreground/[0.06] px-[0.2em] pb-[0.1em] pt-[calc(0.1em-1px)] font-mono dark:bg-black/25">
      {children}
    </span>
  )
}

/** Owner-only Vercel dashboard links (gated commands, dropped from the production bundle).
 *  The project URL is the owner's, so it comes from the environment: set
 *  NEXT_PUBLIC_VERCEL_DASHBOARD_URL (https://vercel.com/<team>/<project>) in .env.local and
 *  the rows appear; leave it unset and they do not exist. */
const VERCEL_PROJECT_URL = process.env.NEXT_PUBLIC_VERCEL_DASHBOARD_URL?.replace(/\/$/, '')

/** Timeout handle for the transient copy-confirmation banner. Module-level rather than a ref:
 *  CommandPalette is a singleton (mounted once by CommandMenu), and command `perform` functions
 *  are referenced from inside the `commands` useMemo, where dereferencing a ref is flagged as an
 *  unsafe render-time read even though these functions only ever run from a click. */
let feedbackTimerId: ReturnType<typeof setTimeout> | undefined

/** ⌘ vs Ctrl for the shortcut hint. A module constant, not state: this chunk only ever
 *  loads in the browser (lazy import on first intent), and the platform can't change
 *  mid-session. The guard keeps any future SSR of this module from throwing. */
const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

/** The ⌘ K / Ctrl K shortcut, as TWO keycaps in the palette's quiet recipe (1.5px muted
 *  border). The K inherits its size from the surrounding text (text-label in the banner) so
 *  cap text and sentence text always agree. Both caps share a fixed height — the ⌘ is a
 *  pure-geometry SVG (the font's U+2318 glyph renders at different sizes/baselines per
 *  engine) while the K is text, so without the shared height the two boxes wouldn't match. */
const KEYCAP_CLASS =
  'inline-flex h-[22px] items-center justify-center border-[1.5px] border-current font-sans font-normal leading-none text-[var(--color-muted)]'

function ShortcutKeycap({ isApple, className }: { isApple: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={`items-center gap-1 ${className ?? ''}`}>
      {/* Single-glyph caps (⌘, K) share a fixed 19px width so the two boxes match and the
          cap reads slightly taller than wide — the same portrait proportion as the Kbd
          keycap in prose (26x31 at prose size). The Ctrl fallback is a word and sizes to
          its content instead. */}
      <span style={{ borderWidth: '1.5px' }} className={`${KEYCAP_CLASS} ${isApple ? 'w-[19px]' : 'px-1.5'}`}>
        {isApple ? (
          <Command size={11} strokeWidth={2.5} className="block shrink-0" />
        ) : (
          <span>Ctrl</span>
        )}
      </span>
      <span style={{ borderWidth: '1.5px' }} className={`${KEYCAP_CLASS} w-[19px]`}>
        {/* The K's cap-height ink sits low in its line box; the half-pixel nudge centers it. */}
        <span style={{ transform: 'translateY(-0.5px)' }} className="block">K</span>
      </span>
    </span>
  )
}

// ARIA combobox wiring: the input owns the listbox and points aria-activedescendant at the
// highlighted option's id, so screen readers announce each row as you arrow through it.
const LISTBOX_ID = 'cmdk-listbox'
const optionId = (i: number) => `cmdk-option-${i}`

/**
 * The ⌘K palette proper — dialog, literal tiered search, combobox ARIA. Loaded lazily by
 * <CommandMenu> (the always-mounted shell in the root layout) on first intent, with the
 * search index fetched from /search-index.json: none of this ships in the initial bundle.
 * Bauhaus-minimal: Geist, sharp corners, a layered shadow instead of a border, a single
 * accent dot on the active row. Enter/exit are CSS transitions driven by Base UI's
 * data-starting-style / data-ending-style (exit shorter than enter, per the house motion
 * rules) — Base UI waits for them before unmounting the portal.
 */
export function CommandPalette({
  open,
  onOpenChange,
  index,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: SearchItem[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const gridOn = useGridOverlay()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Captured fresh on every open (not on mount) so which action rows are offered reflects the
  // page the palette was opened ON, not wherever it happened to first mount.
  const [pageCtx, setPageCtx] = useState<{ hasLike: boolean; path: string; wide: boolean }>({ hasLike: false, path: '', wide: false })

  // On phones the results list is capped to the VISUAL viewport; state lives up here so the
  // open-reset below can clear it (the measuring effect is further down with the list).
  const listBoxRef = useRef<HTMLDivElement>(null)
  const [mobileMaxH, setMobileMaxH] = useState<number | null>(null)

  // Reset + page-context capture, done DURING the first render that sees open=true (the
  // documented adjust-state-on-prop-change pattern) instead of in an effect: no one-frame
  // flash of the previous session's query, and the fresh mobile cap is measured from a
  // clean slate. The DOM reads are cheap and read-only, and this chunk never renders on
  // the server (lazy-loaded on first intent).
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery('')
      setActive(0)
      setMobileMaxH(null)
      setPageCtx({
        hasLike: !!document.querySelector('.t-like'),
        path: window.location.pathname,
        wide: window.matchMedia('(min-width: 640px)').matches,
      })
    }
  }

  // Transient in-palette confirmation for copy-style commands (Copy URL, Copy RSS feed URL),
  // which keep the palette open instead of closing on select.
  const [feedback, setFeedback] = useState<string | null>(null)
  const showFeedback = useCallback((msg: string) => {
    clearTimeout(feedbackTimerId)
    setFeedback(msg)
    feedbackTimerId = setTimeout(() => setFeedback(null), 1500)
  }, [])
  useEffect(() => () => clearTimeout(feedbackTimerId), [])

  // Plain external navigations (mailto:, obsidian://). Pulled out of the `commands` useMemo body
  // as their own callbacks so the memo's computation stays pure — the navigation itself only
  // happens when a command actually runs.
  //
  // The mailto is TEMPLATED: away from the homepage the subject carries the page ("Re: Photos")
  // and the body opens with the URL under two blank lines, so a note sent from a post arrives
  // with its context attached and the sender types above the link. Same idea as the post pages'
  // subject-prefilled "Chat about this?" mailto, extended with the body line.
  const goEmail = useCallback(() => {
    const title = document.title.replace(TITLE_SUFFIX_RE, '')
    const home = window.location.pathname === '/'
    const subject = home ? 'Hello' : `Re: ${title}`
    const body = home ? '' : `&body=${encodeURIComponent(`\n\n${window.location.href}`)}`
    window.location.href = `mailto:${EMAIL ?? ''}?subject=${encodeURIComponent(subject)}${body}`
  }, [])
  const goObsidian = useCallback((slug: string) => {
    window.location.href = `obsidian://open?vault=Platinum&file=${encodeURIComponent(`src/content/writing/${slug}.mdx`)}`
  }, [])
  // Same reason: these read the showFeedback ref-holding helper, so they're defined here rather
  // than as inline closures inside the commands useMemo.
  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    showFeedback('URL copied to clipboard')
  }, [showFeedback])
  const copyRss = useCallback(() => {
    navigator.clipboard.writeText(absoluteUrl('/feed.xml'))
    showFeedback('RSS feed URL copied to clipboard')
  }, [showFeedback])
  const copyLogo = useCallback(() => {
    copyLogoSvg().then(() => showFeedback('Logo SVG copied to clipboard')).catch(() => {})
  }, [showFeedback])

  // Post bodies power the per-result snippet line ("the line where your query appears").
  // They're ~10x the size of the index, so they load on first real OPEN — never on the idle
  // prefetch that warms the index — and the palette works fine before they arrive (rows fall
  // back to their description line, then upgrade in place once bodies land).
  const [bodies, setBodies] = useState<Map<string, { text: string; lower: string; headings: { text: string; slug: string }[] }> | null>(null)
  const bodiesStarted = useRef(false)
  useEffect(() => {
    if (!open || bodiesStarted.current) return
    bodiesStarted.current = true
    loadSearchIndex()
      .then((items) =>
        setBodies(new Map(items.map((i) => [i.href ?? `/writing/${i.slug}`, { text: i.content, lower: i.contentLower, headings: i.headings ?? [] }]))),
      )
      .catch(() => { bodiesStarted.current = false })
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const make = (label: string, extra: Omit<Command, 'label' | 'labelLower' | 'metaLower'> & { keywords?: string }): Command => ({
      label,
      labelLower: label.toLowerCase(),
      metaLower: [extra.keywords, extra.description].filter(Boolean).join(' ').toLowerCase(),
      ...extra,
    })
    const items: Command[] = []
    for (const it of index) {
      const body = bodies?.get(it.href)
      items.push(
        make(it.title, {
          id: `nav:${it.href}`,
          keywords: it.keywords,
          description: it.description,
          body: body?.text,
          bodyLower: body?.lower,
          perform: () => router.push(it.href),
        }),
      )
      // Heading deep links (the cmdk sub-item pattern): each H2/H3 of a post or study is
      // its own row, surfaced only when the query matches the heading text, landing on
      // /writing/slug#anchor. They arrive with the lazily-loaded body index, so like the
      // body tier they upgrade in as soon as that fetch resolves.
      for (const h of body?.headings ?? []) {
        items.push(
          make(h.text, {
            id: `heading:${it.href}#${h.slug}`,
            parent: it.title,
            perform: () => router.push(`${it.href}#${h.slug}`),
          }),
        )
      }
    }
    items.push(
      make(resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', {
        id: 'action:theme',
        pin: 'theme',
        keywords: 'theme dark light mode appearance color',
        perform: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      }),
    )
    // The 12-column grid overlay — the same thing the `g` key toggles. Labelled by what it will DO,
    // not by what is on, so the row reads as an action rather than a status.
    items.push(
      make(gridOn ? 'Deactivate grid' : 'Activate grid', {
        id: 'action:grid',
        pin: 'grid',
        keywords: 'grid layout columns column overlay guides guide baseline 12 ruler',
        perform: () => gridOverlay.toggle(),
      }),
    )

    // Non-search actions. Public rows are always offered; a couple are conditional on the page
    // the palette was opened on (pageCtx, refreshed on every open).
    items.push(
      make('Copy URL', {
        id: 'action:copy-url',
        pin: 'copy',
        keywords: 'copy link url share address permalink location',
        keepOpen: true,
        perform: copyUrl,
      }),
    )
    items.push(
      make('Copy RSS feed URL', {
        id: 'action:copy-rss',
        pin: 'rss',
        keywords: 'rss feed subscribe atom syndication follow xml',
        keepOpen: true,
        perform: copyRss,
      }),
    )
    // The logo take-away rows mirror the mark's right-click menu — which is pointer-only
    // (right-click / long-press), so these are the keyboard road to the same assets.
    items.push(
      make('Copy logo as SVG', {
        id: 'action:logo-copy',
        keywords: 'logo mark svg brand asset icon copy',
        keepOpen: true,
        perform: copyLogo,
      }),
    )
    items.push(
      make('Download logo as SVG', {
        id: 'action:logo-svg',
        keywords: 'logo mark svg brand asset icon download save',
        perform: () => downloadLogo('/logo.svg', markFilename('svg')),
      }),
    )
    items.push(
      make('Download logo as PNG', {
        id: 'action:logo-png',
        keywords: 'logo mark png brand asset icon download save image',
        perform: () => downloadLogo('/logo.png', markFilename('png')),
      }),
    )
    // No address configured = no email row (and no tip for it below).
    if (EMAIL) {
      items.push(
        make(`Email ${FIRST_NAME}`, {
          id: 'action:email',
          pin: 'email',
          keywords: 'email contact mail message reach get in touch hello',
          perform: goEmail,
        }),
      )
    }
    // Writing is appended LAST in getSearchIndex(), and getAllPosts() sorts newest first — so
    // the first Writing entry in the index is the newest post. Zero new network requests.
    const latest = index.find((it) => it.kind === 'Writing')
    if (latest) {
      items.push(
        make('View latest post', {
          id: 'action:latest-post',
          pin: 'latest',
          keywords: 'latest newest recent last post writing article blog new',
          perform: () => router.push(latest.href),
        }),
      )
    }
    if (pageCtx.hasLike) {
      items.push(
        make('Like this page', {
          id: 'action:like',
          pin: 'like',
          keywords: 'like heart favorite fave love appreciate thanks',
          // Reuses like-button.tsx's Neon-backed action and burst animation directly — no
          // reimplementation of the /api/likes call here.
          perform: () => document.querySelector<HTMLButtonElement>('.t-like')?.click(),
        }),
      )
    }

    // Owner-only rows, gated identically to the /lab proxy (src/proxy.ts): visible in dev and
    // preview, absent from production. Wrapping the whole block in this check lets the minifier
    // drop the branch (labels + URLs included) from the production bundle entirely.
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production') {
      // The lab row follows the module's own gate (site.config.ts modules.lab), the same rule
      // the proxy enforces on the route.
      if (labReachable(process.env.NEXT_PUBLIC_VERCEL_ENV)) {
        items.push(
          make('Go to Lab', {
            id: 'action:lab',
            keywords: 'lab sketchbook experiments prototypes playground wip',
            perform: () => router.push('/lab'),
          }),
        )
      }
      // The settings page writes site.config.ts on disk, so it exists under `next dev` only
      // (src/proxy.ts gates the route the same way).
      if (process.env.NODE_ENV === 'development') {
        items.push(
          make('Open Settings', {
            id: 'action:settings',
            keywords: 'settings config site.config setup identity modules connections preferences',
            perform: () => router.push('/settings'),
          }),
        )
      }
      if (/^\/writing\/[^/]+$/.test(pageCtx.path)) {
        const slug = pageCtx.path.replace('/writing/', '')
        items.push(
          make('Edit in Obsidian', {
            id: 'action:obsidian',
            keywords: 'obsidian edit source mdx vault write draft note',
            perform: () => goObsidian(slug),
          }),
        )
      }
      if (VERCEL_PROJECT_URL) {
        items.push(
          make('Open deployments on Vercel', {
            id: 'action:vercel-deployments',
            keywords: 'vercel deployments deploys builds ci ship production status',
            perform: () => { window.open(`${VERCEL_PROJECT_URL}/deployments`, '_blank', 'noopener,noreferrer') },
          }),
        )
        items.push(
          make('Open project on Vercel', {
            id: 'action:vercel-project',
            keywords: 'vercel project dashboard overview settings hosting',
            perform: () => { window.open(VERCEL_PROJECT_URL, '_blank', 'noopener,noreferrer') },
          }),
        )
      }
    }

    return items
  }, [index, bodies, router, resolvedTheme, setTheme, gridOn, pageCtx, copyUrl, copyRss, copyLogo, goEmail, goObsidian])

  // Nothing until you type. On open the palette is just the input — a wall of default rows made
  // the first frame heavy and gave the box a height it then had to animate away from.
  //
  // Pinned words first, then three literal tiers, so where the query matched decides rank:
  // a command whose Tip-advertised word IS the query outranks everything (typing exactly what
  // the tip suggested must surface that command first, not a post that contains the word),
  // then title matches (sorted by how early in the title it appears), then
  // keywords/description, then full post bodies. The whole pass is indexOf over precomputed
  // lowercase strings — sub-millisecond — and results are computed from a DEFERRED query so
  // the keystroke's own render only repaints the input; React fills the list in a follow-up
  // render it can interrupt for the next keystroke.
  const deferredQuery = useDeferredValue(query)
  const { results, resultsTotal } = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return { results: [] as Command[], resultsTotal: 0 }
    const pinned: Command[] = []
    const title: Command[] = []
    const heads: Command[] = []
    const meta: Command[] = []
    const body: Command[] = []
    for (const c of commands) {
      if (c.pin === q) pinned.push(c)
      // Heading rows match on their text alone (they have no keywords/description/body),
      // and rank as their own tier: stronger than a keyword match, weaker than a page or
      // post whose own title matches.
      else if (c.parent) { if (c.labelLower.includes(q)) heads.push(c) }
      else if (c.labelLower.includes(q)) title.push(c)
      else if (c.metaLower.includes(q)) meta.push(c)
      else if (c.bodyLower && c.bodyLower.includes(q)) body.push(c)
    }
    title.sort((a, b) => a.labelLower.indexOf(q) - b.labelLower.indexOf(q))
    heads.sort((a, b) => a.labelLower.indexOf(q) - b.labelLower.indexOf(q))
    const all = [...pinned, ...title, ...heads, ...meta, ...body]
    // resultsTotal is the TRUE match count — the list renders at most MAX_RESULTS, and
    // the count in the input corner is what tells you the query is worth narrowing.
    return { results: all.slice(0, MAX_RESULTS), resultsTotal: all.length }
  }, [deferredQuery, commands])

  // The Tip strip: shows on every open and rotates through what the palette can do, one line
  // at a time, using the transitions-dev text-swap (old tip exits up with blur, next enters
  // from below). This replaces the old once-ever ⌘K banner — the shortcut lesson is now just
  // the first tip in the loop, skipped on narrow viewports where there is no keyboard to
  // advertise. Only PUBLIC commands are advertised; the like tip appears only where the page
  // actually has a like button.
  // Each tip is a list of WORD chunks — the reveal animates per word, so the sentence has to
  // arrive pre-split. Elements (the keycap, the mono query words) ride along as single chunks.
  const tips = useMemo<ReactNode[][]>(() => {
    const words = (s: string): ReactNode[] => s.split(' ')
    const list: ReactNode[][] = []
    if (pageCtx.wide) {
      list.push([
        'press',
        // align-top (not middle): the strip's line box is pinned to the keycap's own 22px
        // height, so top-alignment lands the cap borders on whole pixels — align-middle
        // derives a fractional y from font metrics and smears the horizontal borders.
        <ShortcutKeycap key="caps" isApple={IS_APPLE} className="mx-0.5 inline-flex align-top" />,
        ...words('to open search instantly next time.'),
      ])
    }
    list.push(['enter', <TipQuery key="q">theme</TipQuery>, ...words('to switch between light and dark.')])
    list.push(['enter', <TipQuery key="q">grid</TipQuery>, ...words('to see the 12-column layout grid.')])
    list.push(['enter', <TipQuery key="q">copy</TipQuery>, ...words('to copy this page’s URL.')])
    list.push(['enter', <TipQuery key="q">rss</TipQuery>, ...words('to copy the feed URL.')])
    if (EMAIL) list.push(['enter', <TipQuery key="q">email</TipQuery>, ...words(`to send ${FIRST_NAME} a note.`)])
    list.push(['enter', <TipQuery key="q">latest</TipQuery>, ...words('to jump to the newest post.')])
    if (pageCtx.hasLike) list.push(['enter', <TipQuery key="q">like</TipQuery>, ...words('to leave a like on this page.')])
    return list
  }, [pageCtx.wide, pageCtx.hasLike])

  const [tipIdx, setTipIdx] = useState(0)
  const tipRef = useRef<HTMLSpanElement>(null)

  // Swap phases 1+2: on a timer, exit the current tip, then commit the next one. Paused while
  // a copy confirmation is borrowing the strip. The exit duration is read from the CSS token
  // so this timeout can never drift from the stylesheet.
  useEffect(() => {
    if (!open || feedback || tips.length < 2) return
    // Reduced motion stops the ROTATION itself, not just the word keyframes (which the CSS
    // already suppresses) — auto-cycling content is motion too (WCAG 2.2.2). The first tip
    // simply holds.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // getComputedStyle serializes the token in SECONDS ('.2s'), so a bare parseFloat reads
    // 0.2 and the exit timeout fires instantly — the old tip must get its full fade out.
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--text-swap-exit-dur').trim()
    const dur = (raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000) || 200
    let swapTimer: number | undefined
    // The span is read at fire time, not setup time: Base UI mounts the Popup's children in a
    // LATER commit than the `open` flip, so the ref is still null when this effect first runs.
    const iv = window.setInterval(() => {
      tipRef.current?.classList.add('is-exit')
      swapTimer = window.setTimeout(() => setTipIdx((i) => i + 1), dur)
    }, TIP_ROTATE_MS)
    return () => {
      window.clearInterval(iv)
      window.clearTimeout(swapTimer)
      // Deliberately read at cleanup time, not captured at setup: the ref is NULL when this
      // effect first runs (see above), and cleanup wants whatever span exists NOW so a tip
      // interrupted mid-exit (by a feedback message or close) is never left invisible.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tipRef.current?.classList.remove('is-exit')
    }
  }, [open, feedback, tips.length])

  // Swap phase 3: runs after the next tip is committed to the DOM but before paint. The words
  // animate themselves in (mount keyframes) — this only snaps the container's exit-fade
  // opacity back to 1 without transitioning it (.is-enter-start disables the transition for
  // the removal, a reflow commits it, then the class comes off).
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || !el.classList.contains('is-exit')) return
    el.classList.add('is-enter-start')
    el.classList.remove('is-exit')
    void el.offsetHeight
    el.classList.remove('is-enter-start')
  }, [tipIdx])

  // iOS keeps the software keyboard only across an input→input focus transfer (the ghost input
  // in CommandMenu holds it up through the lazy-chunk gap). Base UI's initialFocus performs that
  // transfer via queueMicrotask + a MODULE-GLOBAL requestAnimationFrame that any other enqueued
  // focus in floating-ui cancels — a frame-late handoff that sometimes never lands, which read as
  // "the keyboard comes up only sometimes". A `useLayoutEffect(open)` on this component doesn't
  // close the gap either: Base UI mounts the Popup's CHILDREN in a later commit than the `open`
  // flip, so that effect fires while the input ref is still null and the handoff falls back to
  // Base UI's racy pass. The only commit where the input provably exists AND the ghost still
  // holds focus is the input's own ref attach — so the transfer happens there (see attachInput),
  // synchronously, before paint, before any Base UI focus logic runs. Base UI's own pass then
  // sees focus already inside the popup and does nothing.
  const attachInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el
    if (el) el.focus({ preventScroll: true })
  }, [])

  // MOBILE SCROLL LOCK. Base UI's own lock (modal dialogs) detects iOS and deliberately falls
  // back to `overflow: hidden` on <body> — which iOS Safari ignores for touch scrolling, so the
  // page scrolled merrily under the palette and carried it along once the keyboard panned the
  // viewport. `overflow: hidden` on <html> IS respected by modern Safari; setting it here also
  // makes Base UI's locker bail out ("site author already hid overflow — respect it"), so the
  // two locks never fight. Coarse pointers only: on desktop Base UI's lock already works and
  // handles the scrollbar-gutter shift this simple version doesn't.
  useLayoutEffect(() => {
    if (!open || !window.matchMedia('(pointer: coarse)').matches) return
    const html = document.documentElement
    const prev = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    return () => {
      html.style.overflow = prev.overflow
      html.style.overscrollBehavior = prev.overscroll
    }
  }, [open])

  // On phones the results list is capped to the VISUAL viewport (the part the keyboard isn't
  // covering), not 56vh of the layout viewport — vh/dvh both ignore the keyboard, so a 56vh
  // list ran under it and the tail of the results was unreachable. visualViewport reports the
  // truth and fires resize when the keyboard comes and goes. Desktop keeps the plain 56vh cap.
  useEffect(() => {
    if (!open) return // stale cap is harmless while closed; the open-reset above clears it
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const el = listBoxRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setMobileMaxH(Math.max(120, vv.offsetTop + vv.height - top - 16))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
    // results.length: the list box mounts in a later commit than `open`, so the first
    // update() often runs before the ref exists — re-measure once rows are actually there.
  }, [open, results.length])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const run = useCallback((c?: Command) => {
    if (!c) return
    if (!c.keepOpen) onOpenChange(false)
    c.perform()
  }, [onOpenChange])

  const onInputKey = (e: React.KeyboardEvent) => {
    // Arrows LOOP (the cmdk `loop` behavior): Down on the last row wraps to the first,
    // Up on the first wraps to the last — overshooting the top result costs one keypress
    // instead of a walk back up the list.
    if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) setActive((i) => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) setActive((i) => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]) }
  }

  // The palette used to SNAP: rows swapped instantly on every keystroke and the container jumped
  // to the new result count. Two fixes, both cheap. (1) Measure the rendered list and animate the
  // container's height to it, so growing/shrinking is a move rather than a cut. (2) Give each row
  // a layout + fade so survivors slide to their new position instead of teleporting.
  const reduce = useReducedMotion()
  const contentRef = useRef<HTMLDivElement>(null)
  const [listH, setListH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setListH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, results.length])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Invisible backdrop: no dim — the palette separates itself with shadow-command alone.
            The element stays so a click outside dismisses the palette WITHOUT also activating
            whatever link or button happens to be under the pointer. */}
        <Dialog.Backdrop className="fixed inset-0 z-[60]" />
        <Dialog.Popup
          initialFocus={inputRef}
          // No Dialog.Trigger here (opened via ⌘K / a custom event), and Base UI's own
          // restore is OFF: it focuses the opener in a way Safari marks :focus-visible,
          // which painted a focus ring on the header search button after every palette
          // use (2026-08-25). CommandMenu still restores focus to the captured
          // opener itself — with focusVisible:false, so keyboard position is kept
          // without the ring (Safari supports the option; Chrome never drew the ring).
          finalFocus={false}
          // Enter overshoots: a back-out curve (the control point past 1) carries the scale a couple
          // of percent beyond its target and settles back, so the input bounces into place instead
          // of easing flatly to a stop. Exit keeps a plain accelerate curve — a bounce on the way
          // out would read as the palette failing to leave.
          //
          // The curve and durations are design-system tokens (--ease-spring / --duration-spring in
          // globals.css), the CSS stand-in for the house spring. Base UI owns this enter/exit via
          // data-starting-style / data-ending-style, so it must be a transition rather than a real
          // spring — a bézier cannot BE a spring, but sharing the token means the two get changed
          // together instead of drifting apart.
          // Enter is deliberately smaller than the house spring default (18px/0.92 @ 240ms felt
          // like part of the wait once the open itself became instant): less travel, less scale,
          // shorter. The local curve overshoots harder than --ease-spring (1.45 vs 1.3) because
          // the shrunken travel would otherwise swallow the bounce — same felt spring, less wait.
          // Exit unchanged.
          // top is 16vh SNAPPED to a whole pixel (round()): a fractional panel y put the keycap
          // borders off the device-pixel grid, antialiasing top/bottom edges visibly thicker
          // than left/right.
          // On phones (below sm) the panel sits just under the fixed header (48px + 12px of air)
          // instead of 16vh down: the keyboard already owns the bottom ~40% of the screen, so
          // every pixel of headroom is a pixel of results. The ghost input in CommandMenu parks
          // at the same offsets so the keyboard raises against the right geometry.
          className="fixed left-1/2 top-[60px] sm:top-[round(16vh,1px)] z-[60] w-[min(92vw,560px)] -translate-x-1/2 transition-[opacity,translate,scale] duration-[200ms] ease-[cubic-bezier(0.34,1.45,0.64,1)] data-[starting-style]:opacity-0 data-[starting-style]:translate-y-[10px] data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:translate-y-1.5 data-[ending-style]:scale-[0.98] data-[ending-style]:duration-[var(--duration-exit)] data-[ending-style]:ease-[var(--ease-exit)] motion-reduce:transition-none"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          {/* Dark mode sits on the SURFACE token, a step lighter than the page: with no
              backdrop dim and no ring, the plane change is what separates the panel —
              an elevated dark material, not an outlined one. */}
          <div className="shadow-command overflow-hidden bg-background dark:bg-[var(--color-surface)]">
          {/* The Tip strip: a quiet tinted band (no border — this panel never has one) that
              rotates through the palette's public commands via the t-text-swap transition.
              Copy confirmations borrow the strip while they're up; rotation pauses under them.
              This strip is the ONLY place the ⌘K shortcut is advertised — the input used to
              carry its own persistent keycap, removed in favor of teaching here. */}
          {/* Fixed 22px content row (the keycap's height) so the strip is the same height for
              every tip — without it the banner grew when the ⌘K tip's keycaps rotated in. */}
          {/* Plain divs, deliberately NOT the Alert primitive: its role="alert" made every 3s
              tip swap an assertive announcement that talked over the combobox's own typing
              echo. The tips are aria-hidden decoration; the only thing this strip ANNOUNCES
              is a copy confirmation, through the always-mounted status span (a live region
              must exist before its content arrives to announce reliably). */}
          {/* dark:bg-black/20 (a darker band, not a lighter one): the fg-tinted wash lightened
              the panel just enough to sink the muted tip text to 4.4:1 — over the darker band
              it measures 5.1:1. */}
          <div className="bg-foreground/[0.04] px-5 py-2.5 dark:bg-black/20">
            <div className="flex h-[22px] items-center overflow-hidden font-sans text-label text-[var(--color-muted)]">
              <span role="status" className="leading-[22px]">{feedback}</span>
              {!feedback && (
                <span ref={tipRef} aria-hidden="true" className="t-text-swap leading-[22px]">
                  {['Tip:', ...tips[tipIdx % tips.length]].map((w, i) => (
                    // The key includes tipIdx so every swap MOUNTS fresh word spans — index-only
                    // keys would let React reuse the nodes and the entry keyframes would never
                    // replay after the first tip.
                    <Fragment key={`${tipIdx}-${i}`}>
                      {i > 0 && ' '}
                      <span
                        className="t-tip-word"
                        style={{ animationDelay: `calc(${i} * var(--text-swap-word-stagger))` }}
                      >
                        {w}
                      </span>
                    </Fragment>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <input
              ref={attachInput}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onInputKey}
              placeholder="Search…"
              // Queries aren't prose or identity: no squiggles, no autocapitalize, no
              // autocorrect (the ghost bridge declares the same set — the iOS keyboard
              // handoff must land on an input with identical typing behavior), and no
              // autofill or password-manager overlays. This input mounts client-only
              // (lazy chunk), so unlike the SSR'd ghost there's no hydration-mismatch
              // risk from extensions rewriting autocomplete.
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              data-1p-ignore=""
              data-lpignore="true"
              aria-label="Search"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={LISTBOX_ID}
              aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              // NO divider under the input. When the palette is empty it IS the input, so any
              // line here sits on the panel's bottom edge and reads as a border — the exact
              // thing this panel must never have. The results announce themselves without it:
              // the box springs open and the active row carries a fill.
              className={`w-full bg-transparent py-4 pl-5 font-sans text-prose text-foreground outline-none placeholder:text-[var(--color-muted)] ${query ? (resultsTotal > 0 ? 'pr-28' : 'pr-12') : 'pr-5'}`}
            />
            {/* True match count (pre-cap: the list shows at most MAX_RESULTS), seated left of
                the clear button. aria-hidden — the combobox's activedescendant flow is the
                screen-reader story; this is the visual "narrow your query" signal. */}
            {query && resultsTotal > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 select-none font-sans text-label tabular-nums text-[var(--color-muted)]"
              >
                {resultsTotal} {resultsTotal === 1 ? 'result' : 'results'}
              </span>
            )}
            {/* Clear — the same hover-circled X the shared SearchInput uses. pointerdown is
                swallowed so the tap never blurs the input: on iOS a blur drops the keyboard,
                and clearing the query must leave you ready to type the next one. */}
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setQuery(''); setActive(0); inputRef.current?.focus({ preventScroll: true }) }}
                // size-11 = 44px — Apple's minimum touch target. The visible affordance stays
                // the small size-5 circle; the padding around it is all hit area.
                className="group absolute right-1 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-[var(--color-muted)]"
              >
                <span className="flex size-5 items-center justify-center rounded-full transition-colors group-hover:bg-black/8 group-active:bg-black/8 dark:group-hover:bg-white/10 dark:group-active:bg-white/10">
                  <X className="size-3.5" />
                </span>
              </button>
            )}
          </div>
          <m.div
            // The height cap lives HERE, on the animated element. It used to sit on the inner
            // list: the outer box then animated to the FULL content height while the inner list
            // was capped and scrolling, so anything taller than the cap left a slab of empty
            // space below the results. Capping the animated box fixes it — the inner list scrolls
            // inside whatever height this settles at.
            ref={listBoxRef}
            animate={reduce ? undefined : { height: listH ?? 0 }}
            transition={{ type: 'spring', stiffness: 560, damping: 44, mass: 0.7 }}
            // Phones cap to the keyboard-free visual viewport (mobileMaxH); desktop keeps 56vh.
            style={{ maxHeight: mobileMaxH ?? '56vh' }}
            className="overflow-hidden"
          >
            <div ref={listRef} id={LISTBOX_ID} role="listbox" aria-label="Search results" className="h-full overflow-y-auto overscroll-contain">
              {/* contentRef sits on this STABLE wrapper, not on the keyed fade below it: that one
                  remounts on every keystroke, so the ResizeObserver would end up watching a
                  detached node and the height would stop tracking. */}
              {/* NOTHING animates the rows. Two attempts died here. A layout animation per row was
                  the "clunk" — it re-measured and re-sprang the whole list on every keystroke. The
                  replacement, a 100ms opacity cross-fade keyed on the query, was the "top result's
                  text flashes": animating opacity promotes the row to its own compositor layer, and
                  the browser drops subpixel antialiasing for grayscale while a layer is animating,
                  so the glyphs visibly change weight at the start and end of every fade. Text must
                  not be opacity-animated. The rows now swap instantly (typing should feel instant
                  anyway) and only the CONTAINER's height is sprung, so the box still grows and
                  shrinks smoothly around them. */}
              {/* Hairline dividers between rows (2026-08-31): fg-tinted at 6% so they
                  stay whisper-quiet on the light panel and the dark lifted surface alike —
                  a row separation, not a border anatomy. */}
              <div ref={contentRef} className="divide-y divide-foreground/[0.06]">
                {results.length === 0 && deferredQuery.trim() ? (
                  <div className="px-5 py-8 text-center font-sans text-label text-[var(--color-muted)]">No results</div>
                ) : (
                  results.map((c, idx) => {
                    const isActive = idx === active
                    const q = deferredQuery.trim().toLowerCase()
                    // Second line: the first line of the post where the query appears, else the
                    // item's standing description. Hierarchy is title-first — the context line is
                    // a size down and muted, so the title stays what you scan.
                    const context = (c.body && c.bodyLower && extractSnippet(c.body, c.bodyLower, q)) || c.description
                    return (
                      <button
                        key={c.id}
                        id={optionId(idx)}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => run(c)}
                        // NO transition-colors. The highlight has to be a state, not an animation.
                        // Rows change identity and position on every keystroke, so a surviving row
                        // that gains or loses `isActive` was EASING its text from muted grey to the
                        // red accent (and back) over 150ms — and with the highlight landing on a
                        // different row each character, that read as the top result's text
                        // flickering color as you typed. An instant swap cannot flicker.
                        // The dark active row darkens (black/20) instead of lightening: the
                        // fg-tinted wash lifted the ground under the accent text to 4.2:1;
                        // over the darker wash the accent measures 5.0:1.
                        className={`block w-full cursor-pointer px-5 py-2.5 text-left font-sans text-prose ${
                          isActive ? 'bg-foreground/[0.06] text-[var(--color-accent)] dark:bg-black/20' : 'text-foreground/90'
                        }`}
                      >
                        {/* Titles WRAP rather than ellipsize (2026-08-30): a result
                            you can't read isn't a result. Heading deep links wear their
                            parent as a muted inline prefix — the differentiated anatomy
                            that says "a place inside a page" — and the whole line wraps
                            naturally when the pair runs long. Only the context snippet
                            below stays single-line (it is a windowed excerpt by design). */}
                        <span className="block">
                          {c.parent && <span className="text-[var(--color-muted)]">{c.parent} › </span>}
                          {highlight(c.label, deferredQuery)}
                        </span>
                        {context && (
                          <span className="mt-0.5 block truncate text-label text-[var(--color-muted)]">
                            {highlight(context, deferredQuery)}
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </m.div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
