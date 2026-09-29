'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { SearchItem } from '@/lib/search-index'
import { subscribeKeydown } from '@/lib/keyboard-shortcuts'

const CommandPalette = dynamic(
  () => import('./command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

/**
 * Always-mounted shell for the ⌘K palette. The palette itself (Base UI dialog + search)
 * and the search index do NOT ship in the initial bundle: the code chunk and
 * /search-index.json load on first intent — the header buttons dispatch
 * `warm-command-menu` on hover, and the first ⌘K press / `open-command-menu` event warms
 * and opens in one go. Every page stops paying ~20KB gz of JS plus ~45KB of flight payload
 * for a palette most visits never open.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false)
  // Mount the palette CLOSED as soon as the chunk is warm (idle time), not on first open.
  // A warmed-but-unmounted palette still paid dynamic-import resolution + mounting the whole
  // dialog tree inside the click — a visible beat before the enter animation could start.
  // Pre-mounted, the first open is a state flip + CSS transition. A closed Base UI dialog
  // renders no DOM, so the closed mount costs a few ms of idle JS and nothing on screen.
  const [mountPalette, setMountPalette] = useState(false)
  const [index, setIndex] = useState<SearchItem[]>([])
  const openRef = useRef(false)
  const fetchedRef = useRef(false)
  const ghostRef = useRef<HTMLInputElement>(null)
  // Where focus goes when the palette closes — captured at open time, BEFORE the ghost
  // steals focus. Falls back to the header search button so Base UI never has to guess
  // (its guess used to land on the theme toggle).
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => { openRef.current = open }, [open])

  // Focus restore on close, done here instead of Base UI's finalFocus: Safari marks
  // Base UI's restored focus :focus-visible and paints a ring on the search button
  // after every palette use. focus({ focusVisible: false }) keeps the keyboard
  // user's place without the ring — Safari honors the option; browsers that don't
  // (Chrome) never drew a ring on restored focus in the first place. The rAF lets
  // Base UI finish its own close-focus handling before we take over.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      // After the popup's exit transition: Base UI releases focus to <body> only when
      // the popup unmounts (exit ~200ms), which would override an immediate restore.
      // The guard keeps this from stealing focus the user has already placed elsewhere.
      const t = setTimeout(() => {
        const el = openerRef.current
        const ae = document.activeElement
        if (el && document.contains(el) && (ae === document.body || ae === ghostRef.current)) {
          el.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
        }
      }, 280)
      return () => clearTimeout(t)
    }
    wasOpenRef.current = open
  }, [open])

  // Split deliberately. The CHUNK is what the keyboard fix needs (no chunk → no input → nothing for
  // iOS to focus). The INDEX is 16KB gz and is only needed once you actually type. Warming them
  // together on every first touch would have put 36KB gz on every mobile page view for a palette
  // most visits never open, which is the exact cost the lazy loading exists to avoid.
  const warmChunk = useCallback(() => {
    import('./command-palette').then(() => setMountPalette(true)).catch(() => {}) // idempotent
  }, [])

  const fetchIndex = useCallback(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetch('/search-index.json')
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => { fetchedRef.current = false }) // allow a retry on the next intent
  }, [])

  const warm = useCallback(() => {
    warmChunk()
    fetchIndex()
  }, [warmChunk, fetchIndex])

  const openMenu = useCallback(() => {
    warm()
    const ae = document.activeElement
    // The header renders a Search button per responsive variant; only the VISIBLE one
    // can take focus back (focus() on a display:none element silently no-ops).
    openerRef.current =
      ae instanceof HTMLElement && ae !== document.body && ae !== ghostRef.current
        ? ae
        : [...document.querySelectorAll<HTMLElement>('header button[aria-label="Search"]')].find(
            (b) => b.offsetParent !== null,
          ) ?? null
    // The ghost is only allowed in the accessibility tree while it might hold focus —
    // otherwise every page carries a phantom duplicate "Search" textbox in browse mode.
    // Removed imperatively (not via render) so it's gone before the focus() below.
    ghostRef.current?.removeAttribute('aria-hidden')
    // iOS raises the software keyboard only for focus() calls made inside a user gesture,
    // and the palette's real input mounts asynchronously (lazy chunk + portal) — too late.
    // Focusing this always-mounted ghost NOW (still in the tap's call stack) raises the
    // keyboard; Base UI's initialFocus then moves focus to the real input, keeping it up.
    ghostRef.current?.focus({ preventScroll: true })
    setMountPalette(true)
    setOpen(true)
  }, [warm])

  // TOUCH DEVICES HAVE NO HOVER, so the `warm-command-menu` that the header buttons fire on
  // pointerenter never fires on a phone. The first tap therefore had to fetch and parse the palette
  // chunk before its input could exist — hundreds of ms after the gesture — and iOS only raises the
  // keyboard for a focus() that happens inside the gesture. So the keyboard came up on the second
  // tap (chunk cached) but not the first: "tap search doesn't reliably bring up the keyboard".
  //
  // DESKTOP HAS THE MIRROR-IMAGE GAP: its only warm trigger was hovering the header keycap, and a
  // keyboard-first ⌘K on a cold page never hovers anything — the whole chunk fetch then sat inside
  // the keypress, a visible beat before the palette appeared. So the first sign of a human at the
  // controls (mouse moves, any key goes down, a touch) warms the chunk too. A real ⌘K chord even
  // warms itself: the ⌘ keydown fires this before the K lands.
  //
  // Preload just the CHUNK on that first signal, during idle. Idle so it cannot hitch the
  // scroll that is often the very gesture that triggers it; chunk-only so no page view pays for
  // the 16KB search index (that still waits for real search intent). One-shot: the first signal
  // to fire schedules the warm and all three listeners come down.
  useEffect(() => {
    const events = ['touchstart', 'mousemove', 'keydown'] as const
    const onFirstSignal = (e: Event) => {
      events.forEach((ev) => window.removeEventListener(ev, onFirstSignal))
      // Tight timeout: with the lazy 2000ms budget, a quick reach for the search button could
      // land inside the still-pending warm and pay the chunk load in the click. 300ms keeps the
      // warm off the first paint's critical path but done long before any realistic click.
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      const warm = () => {
        warmChunk()
        // Desktop signals (mouse/keyboard) also prefetch the search index: the palette never
        // waits on it to APPEAR (it renders with an empty index and the data streams in), but
        // having it resident makes the first keystroke's results instant. Touch skips this —
        // the 16KB-gz index on every phone view is the exact cost the lazy split exists to avoid.
        if (e.type !== 'touchstart') fetchIndex()
      }
      if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 300 })
      else window.setTimeout(warm, 200)
    }
    events.forEach((ev) => window.addEventListener(ev, onFirstSignal, { passive: true }))
    return () => events.forEach((ev) => window.removeEventListener(ev, onFirstSignal))
  }, [warmChunk, fetchIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (openRef.current) setOpen(false)
        else openMenu()
      }
    }
    const onOpen = () => openMenu()
    const onWarm = () => warm()
    // Shared app-shortcut listener (keyboard-shortcuts.ts) — grid-overlay's `g` rides
    // the same window keydown instead of each component keeping its own.
    const unsubscribe = subscribeKeydown(onKey)
    window.addEventListener('open-command-menu', onOpen)
    window.addEventListener('warm-command-menu', onWarm)
    return () => {
      unsubscribe()
      window.removeEventListener('open-command-menu', onOpen)
      window.removeEventListener('warm-command-menu', onWarm)
    }
  }, [openMenu, warm])

  return (
    <>
      {/* The keyboard bridge. iOS raises the keyboard only for a focus() inside the tap's call
          stack, and the real input mounts later (lazy chunk + portal) — so THIS always-mounted
          input takes focus during the gesture and holds the keyboard until the real one exists.
          It MUST be editable: iOS never raises the keyboard for a readonly input, and the
          readOnly this used to carry silently disabled the whole bridge — the keyboard then
          only appeared when the real input's focus landed synchronously inside the tap (palette
          already mounted), which is exactly the "sometimes" that was reported. Controlled-empty
          (value="" + no-op onChange) keeps anything typed during the handoff gap from rendering.
          Deliberately NOT aria-hidden (a focused element must never be), NOT opacity-0 (iOS can
          treat fully transparent inputs as unfocusable — 0.01 is imperceptible but "visible"),
          sized like a real control and parked where the palette's input will appear so the
          keyboard geometry and any scroll-to-input land in the same place, and styled/typed to
          match the real input exactly so the handoff changes nothing the keyboard cares about. */}
      <input
        ref={ghostRef}
        tabIndex={-1}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        // No password-manager overlay on the keyboard bridge — it briefly holds real
        // focus during the tap, exactly when 1Password decides whether to pop its icon.
        data-1p-ignore=""
        data-lpignore="true"
        // Form-protection extensions (StopTheMadness's autofill guard, password managers)
        // rewrite this input's attributes (autocomplete="off" → "on") before React hydrates,
        // which logged a hydration mismatch on every load in Safari. The rewrite is harmless
        // to the ghost's job, so don't warn about it.
        suppressHydrationWarning
        aria-label="Search"
        // Hidden from the accessibility tree whenever it can't be holding focus (a focused
        // element must never be aria-hidden — openMenu strips this before focusing).
        aria-hidden={open ? undefined : true}
        value=""
        onChange={() => {}}
        className="pointer-events-none fixed left-1/2 top-[60px] sm:top-[16vh] z-[59] h-8 w-16 -translate-x-1/2 border-0 bg-transparent p-0 text-transparent caret-transparent outline-none"
        style={{ opacity: 0.01, fontSize: 16 }}
      />
      {mountPalette && <CommandPalette open={open} onOpenChange={setOpen} index={index} />}
    </>
  )
}
