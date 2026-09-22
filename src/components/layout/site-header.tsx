'use client'

import { useState, useEffect, useRef, useLayoutEffect, useSyncExternalStore } from 'react'
import { BookOpen, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_LINKS } from '@/lib/nav'
import { site } from '@/lib/site-config'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MobileHeaderBar } from './mobile-header-bar'
import { MobileMenu } from './mobile-menu'
import { MenuToggle } from './menu-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { SiteMark } from './site-mark'
import { MarkMenu } from './mark-menu'
import { subscribeMobileToc, getMobileTocPresent, openMobileToc, MOBILE_TOC_TRIGGER_ID } from '@/lib/mobile-toc-state'

// The after:* rules are a hit-area extender: an invisible pseudo-element grows each link's
// click/tap target to ~44px tall without changing the element's own rect — so the header
// layout and the traveling dot's getBoundingClientRect math are untouched.
const LINK = 'tap-press relative font-sans text-label text-foreground transition-opacity hover:opacity-70 active:opacity-70 after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[""]'

// One accent dot travels to the active nav item, mirroring the TOC's marker exactly (same 6px
// circle, same quick 120ms-linear transform — see toc-client.tsx). Positioned imperatively from
// committed layout so it never trails a render; it snaps into place the first time it appears (no
// slide from the origin) and skips whichever breakpoint layout is display:none (offsetParent null).
// Isomorphic layout effect so there's no SSR warning on every page.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function useTravelingDot(dep: string) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const shownRef = useRef(false)

  const move = (instant: boolean) => {
    const wrap = wrapRef.current
    const dot = dotRef.current
    if (!wrap || !dot || wrap.offsetParent === null) return // skip the hidden (display:none) layout
    const active = wrap.querySelector<HTMLElement>('[data-active="true"]')
    if (!active) { dot.style.opacity = '0'; shownRef.current = false; return }
    const w = wrap.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    const x = a.left - w.left - 12 // the 6px dot sits 6px to the left of the label
    const y = a.top - w.top + a.height / 2 - 3 // vertically centered on the label
    if (instant || !shownRef.current) {
      dot.style.transition = 'none'
      dot.style.transform = `translate(${x}px, ${y}px)`
      void dot.offsetHeight // reflow so the next move animates
      dot.style.transition = 'transform 120ms linear'
    } else {
      dot.style.transform = `translate(${x}px, ${y}px)`
    }
    dot.style.opacity = '1'
    shownRef.current = true
  }

  useIsoLayoutEffect(() => {
    move(false)
  }, [dep])

  useEffect(() => {
    const onResize = () => move(true) // reposition without a slide on layout / breakpoint shifts
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { wrapRef, dotRef }
}

function NavLinks({ activeIndex, colSpan, count }: { activeIndex: number; colSpan?: boolean; count?: number }) {
  return (
    <>
      {NAV_LINKS.slice(0, count ?? NAV_LINKS.length).map((link, index) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={index === activeIndex}
          aria-current={index === activeIndex ? 'page' : undefined}
          className={cn(LINK, 'whitespace-nowrap', colSpan && 'col-span-1')}
        >
          {link.label}
        </Link>
      ))}
    </>
  )
}

/* Graceful overflow for the compact (md→wide) header: links that no longer fit move —
 * from the END of the list — into this "More" dropdown instead of the whole nav
 * collapsing straight to the hamburger. Rules from the spec: the menu never holds a
 * single orphan (2 minimum), and once the row is down to one link beside the wordmark
 * the hamburger takes over entirely (site-header's measure() enforces both).
 *
 * The trigger carries data-active when the CURRENT page's link lives inside the menu,
 * so the traveling dot parks beside "More" — the active-page marker never vanishes
 * just because its link overflowed.
 *
 * Panel styling: house floating-panel recipe (sharp corners, shadow-command, NO
 * border/ring — light theme separates with the diffuse shadow, dark theme with the
 * lifted surface plane), overriding the shadcn defaults per the design system. */
function MoreMenu({ start, activeIndex }: { start: number; activeIndex: number }) {
  const [open, setOpen] = useState(false)
  const overflow = NAV_LINKS.slice(start)
  const holdsActive = activeIndex >= start
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        data-active={holdsActive}
        aria-current={holdsActive ? 'true' : undefined}
        className={cn(LINK, 'inline-flex cursor-pointer items-center gap-1 whitespace-nowrap outline-none')}
      >
        More
        <ChevronDown
          aria-hidden="true"
          size={14}
          strokeWidth={2.6}
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="min-w-36">
        {overflow.map((link, i) => {
          const isActive = start + i === activeIndex
          return (
            <DropdownMenuItem
              key={link.href}
              // Base UI composition: `render`, not Radix's asChild (which leaks the prop
              // into the DOM here).
              render={
                <Link
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(isActive && 'text-[var(--color-accent)]')}
                />
              }
            >
              {link.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Search affordance (desktop AND mobile) — a magnifier that opens the ⌘K palette. It replaced
// the desktop ⌘K keycap button (2026-07-18); the shortcut is now advertised inside the palette's
// input instead, so the header reads as icons only. Full-foreground to match the theme icon.
function SearchButton() {
  // header.search in site.config.ts: 'none' drops the magnifier; the palette still opens on
  // the keyboard shortcut.
  if (site.header.search === 'none') return null
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-command-menu'))}
      onPointerEnter={() => window.dispatchEvent(new Event('warm-command-menu'))}
      // This is the button you tap on a phone, and a phone never fires pointerenter — so warm here
      // too, before the click. (CommandMenu also warms on the first touch anywhere, which is what
      // actually buys enough lead time; this is the backstop.)
      onPointerDown={() => window.dispatchEvent(new Event('warm-command-menu'))}
      aria-label="Search"
      // after:* = invisible hit-area extender (the icon box stays 24px). -inset-x-1.5 is the
      // widest that keeps adjacent extenders from overlapping across the cluster's gap-3.
      className="tap-press relative inline-flex h-6 w-6 cursor-pointer items-center justify-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)] after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-['']"
    >
      <Search aria-hidden="true" size={18} strokeWidth={2.1} />
    </button>
  )
}

// Settings affordance, development only: one click from any page to the panel that edits
// site.config.ts. NODE_ENV is inlined at build, so production never ships this markup (and
// /settings answers 404 there anyway).
function SettingsLink() {
  if (process.env.NODE_ENV === 'production') return null
  return (
    <Link
      href="/settings"
      prefetch={false}
      aria-label="Settings"
      title="Settings (development only)"
      className="tap-press relative inline-flex h-6 w-6 cursor-pointer items-center justify-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)] after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-['']"
    >
      <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={2.1} />
    </Link>
  )
}

// Contents affordance (mobile bar only) — a book that opens the current page's TOC sheet.
// Rendered only while a MobileToc is mounted (mobile-toc-state.ts presence count), so the
// icon appears exactly on pages that have a table of contents. Same box, stroke, and
// hit-area extender as SearchButton so the cluster reads as one family. md:hidden because
// the sheet itself is md:hidden — from md the sidebar TOC takes over, and the hamburger
// bar outlives it (the bar runs to nav, 1120px).
function TocButton() {
  return (
    <button
      id={MOBILE_TOC_TRIGGER_ID}
      type="button"
      onClick={openMobileToc}
      aria-label="Open table of contents"
      aria-haspopup="dialog"
      className="tap-press relative inline-flex md:hidden h-6 w-6 cursor-pointer items-center justify-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)] after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-['']"
    >
      <BookOpen aria-hidden="true" size={18} strokeWidth={2.1} />
    </button>
  )
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const isHome = pathname === '/'
  // Whether the current page has a mobile TOC sheet mounted (server snapshot: no).
  const tocPresent = useSyncExternalStore(subscribeMobileToc, getMobileTocPresent, () => false)
  const activeIndex = NAV_LINKS.findIndex(l => pathname === l.href || pathname.startsWith(l.href + '/'))

  // A single accent dot per desktop layout that glides to the active nav item on route change.
  // The compact dot also re-targets when links shift into/out of the More menu (its
  // data-active element can move or become the More trigger on any resize).
  const [visibleCount, setVisibleCount] = useState<number>(NAV_LINKS.length)
  const { wrapRef: wideWrapRef, dotRef: wideDotRef } = useTravelingDot(pathname)
  const { wrapRef: compactWrapRef, dotRef: compactDotRef } = useTravelingDot(`${pathname}:${visibleCount}`)

  // Measured collapse (see HEADER COLLAPSE in globals.css), now in DEGREES rather than
  // all-or-nothing: as the compact layout runs out of room, trailing links move into the
  // "More" dropdown before the hamburger takes over. An invisible measurement row renders
  // every link (plus a More trigger) in the real font, so each candidate layout's width is
  // arithmetic over measured labels — no fixed breakpoint, and webfont metrics re-measure
  // on fonts.ready. Spec: the More menu never holds exactly one link (2 minimum), and when
  // only one link would remain visible beside the wordmark, the hamburger replaces the row
  // (navState 'collapsed'). 'auto' is the pre-hydration state; CSS approximates it at 70rem.
  const [navState, setNavState] = useState<'auto' | 'full' | 'collapsed'>('auto')
  const measureRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLAnchorElement>(null)
  const clusterRef = useRef<HTMLDivElement>(null)
  const GAP = 40 // the row's gap-10
  const measureNav = () => {
    const wrap = compactWrapRef.current
    const meas = measureRef.current
    if (!wrap || !meas || getComputedStyle(wrap).display === 'none') return // below md / wide grid: CSS owns it
    const cs = getComputedStyle(wrap)
    const avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const logoW = logoRef.current?.offsetWidth ?? 0
    const clusterW = clusterRef.current?.offsetWidth ?? 0
    const linkWs = Array.from(meas.querySelectorAll<HTMLElement>('[data-meas-link]')).map(el => el.offsetWidth)
    const moreW = meas.querySelector<HTMLElement>('[data-meas-more]')?.offsetWidth ?? 0
    const total = NAV_LINKS.length
    const fits = (n: number) => {
      let w = logoW + clusterW + GAP // logo→nav gap; the cluster is ml-auto so needs one gap of air
      for (let i = 0; i < n; i++) w += linkWs[i] + GAP
      if (n < total) w += moreW + GAP
      return w <= avail
    }
    let n = total
    while (n > 0 && !fits(n)) n--
    if (n < total && total - n === 1) n-- // never a single orphan in the menu
    if (n <= 1) { setNavState('collapsed'); return }
    setVisibleCount(n)
    setNavState('full')
  }
  // After every commit: the label (and any conditionally present cluster button, e.g. the
  // TOC trigger) changes the measured width. Cheap (one getComputedStyle + two int reads),
  // and setState bails when unchanged.
  useIsoLayoutEffect(measureNav)
  useEffect(() => {
    window.addEventListener('resize', measureNav)
    document.fonts?.ready.then(measureNav) // webfont metrics land after first paint
    return () => window.removeEventListener('resize', measureNav)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return (
    <>
      {/* Glass: 70% ground (was 90, which hid the blur entirely) + a heavier blur and
          a saturation lift so content glows through instead of graying out
          (2026-08-28). */}
      <header data-nav={navState} className="fixed top-0 left-0 right-0 z-[45] bg-background/70 backdrop-blur-xl backdrop-saturate-150">

        {/* ≥1440px (wide): 12-col grid spreads items across the full header */}
        <div ref={wideWrapRef} className="relative hidden wide:grid grid-cols-12 items-center gap-x-6 h-12 px-12">
          <span ref={wideDotRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" style={{ opacity: 0 }} />
          {/* The mark rides 4px left of the name, inside one home link (the /lab/marks
              lockup). It anchors the page margin in BOTH desktop layouts, so the name
              shifts by the same 21px on each side of the wide breakpoint and the
              grid→margin transition stays coherent. The mark's circle IS the home
              link's active state: muted everywhere else, accent red on home — no
              data-active here, so the traveling dot stays parked while the mark plays
              that role itself. */}
          <Link href="/" className={cn(LINK, 'inline-flex items-center gap-1 whitespace-nowrap col-span-1')}>
            <MarkMenu>
              <SiteMark size={17} active={isHome} />
            </MarkMenu>
            {site.identity.name}
          </Link>
          <nav aria-label="Main navigation" className="contents">
            <NavLinks activeIndex={activeIndex} colSpan />
          </nav>
          {/* Start the right cluster in the column right after the last nav link and run it to
              the grid's end line (-1). Deriving the start from the link count keeps the two sides
              from colliding into a second row when a nav link is added — which is exactly what
              adding a 6th link once did: it landed on the cluster's old fixed col-start-7 and
              wrapped to a new row, dropping the header's links toward the top. */}
          <div className="flex items-center justify-end gap-3" style={{ gridColumn: `${NAV_LINKS.length + 2} / -1` }}>
            {/* No mount gate: the theme toggle's icons render from SSR now (CSS dark:
                rest states), so the whole right cluster is present from first paint. */}
            <SettingsLink />
            <SearchButton />
            <ThemeToggle className="relative -mr-1" iconStrokeWidth={2.3} iconSize={18} />
          </div>
        </div>

        {/* md to wide: flex with a consistent 40px gap — no compression. Whether it's
            visible is measured, not breakpointed (data-nav above): when the links plus the
            right cluster are wider than the viewport, the hamburger bar shows instead. */}
        {/* xs (512px, @theme token), not sm/md: the More menu absorbs links all the way
            down to phone widths — shrinking degrades GRACEFULLY (7 links → 5+More →
            2+More at ~585px) and the hamburger appears only when the measured collapse
            says even 2+More can't fit. Below xs the mobile bar owns the layout outright. */}
        {/* px-6 md:px-12 mirrors PageShell: this row now lives below md too (xs..900),
            where page content sits on the 24px margin — a fixed px-12 left the wordmark
            floating 24px right of the content edge. */}
        <div ref={compactWrapRef} className="header-full relative hidden xs:flex wide:hidden items-center gap-10 h-12 px-6 md:px-12">
          <span ref={compactDotRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" style={{ opacity: 0 }} />
          <Link ref={logoRef} href="/" className={cn(LINK, 'inline-flex items-center gap-1 whitespace-nowrap')}>
            <MarkMenu>
              <SiteMark size={17} active={isHome} />
            </MarkMenu>
            {site.identity.name}
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-10">
            <NavLinks activeIndex={activeIndex} count={visibleCount} />
            {visibleCount < NAV_LINKS.length && <MoreMenu start={visibleCount} activeIndex={activeIndex} />}
          </nav>
          {/* Invisible measurement row: every link plus a More trigger in the real font,
              absolute so it never affects layout, aria-hidden and inert to everyone else.
              measureNav reads offsetWidths from here on every commit/resize/font-load. */}
          <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-10">
            {NAV_LINKS.map(link => (
              <span key={link.href} data-meas-link className="font-sans text-label whitespace-nowrap">{link.label}</span>
            ))}
            <span data-meas-more className="inline-flex items-center gap-1 font-sans text-label whitespace-nowrap">
              More
              <ChevronDown size={14} strokeWidth={2.1} />
            </span>
          </div>
          <div ref={clusterRef} className="ml-auto flex items-center gap-3">
            {/* TOC trigger for the 640-900px band: this row now owns those widths (the
                bar used to carry the trigger there), and the TOC sheet + this button's
                own md:hidden both end at 900 where the sidebar TOC takes over. */}
            {tocPresent && <TocButton />}
            <SettingsLink />
            <SearchButton />
            <ThemeToggle className="relative -mr-1" iconStrokeWidth={2.3} iconSize={18} />
          </div>
        </div>

        {/* Mobile: logo + a hamburger that morphs into an X while the menu is open.
            The overlay renders BELOW this bar (z-[42] vs z-[45]), so this single
            button persists across open/close and the icon morph reads as continuous. */}
        <MobileHeaderBar
          className="header-bar xs:hidden"
          rightIcon={<MenuToggle open={menuOpen} />}
          onRightClick={() => setMenuOpen(v => !v)}
          onLogoClick={() => setMenuOpen(false)}
          ariaLabel={menuOpen ? 'Close navigation' : 'Open navigation'}
          ariaExpanded={menuOpen}
          ariaControls="mobile-menu"
          buttonRef={menuToggleRef}
          extraRight={
            <>
              {tocPresent && <TocButton />}
              <SettingsLink />
            <SearchButton />
              <ThemeToggle className="relative" iconStrokeWidth={2.3} iconSize={18} />
            </>
          }
        />
      </header>
      <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} toggleRef={menuToggleRef} />
    </>
  )
}
