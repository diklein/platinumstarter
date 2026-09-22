'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { Moon, Sun } from 'lucide-react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { useTheme } from 'next-themes'
import { site } from '@/lib/site-config'

// Cross-fade recipe for the two theme icons: the active one rests at full opacity/scale, the
// inactive one at scale .25, blurred and transparent (make-interfaces-feel-better).
// MOTION-driven, not a CSS transition, for two reasons discovered the day it turned out the
// fade had never once played: next-themes' disableTransitionOnChange injects
// `*{transition:none!important}` during every theme swap (killing any CSS transition the
// swap triggers, in every browser), and Chrome's View Transition additionally applies the
// update with rendering paused (collapsing a transition's start/end into one paint).
// A JS/WAAPI animation is immune to both and plays live inside the wipe.
//
// The REST state is duplicated as `dark:` utility classes on each span: the server can't
// know the theme, but next-themes' pre-paint script has already put .dark on <html> by
// first paint, so CSS shows the right icon from the initial HTML — no mounted gate, no
// post-hydration pop-in (which also used to shift the header's measured nav width).
// Motion's `animate` only takes over after mount (inline styles beat the classes), with
// initial={false} so that takeover applies instantly at the values CSS already shows.
// Keep the class values and these objects in step.
const ICON_VISIBLE = { opacity: 1, scale: 1, filter: 'blur(0px)' }
const ICON_HIDDEN = { opacity: 0, scale: 0.25, filter: 'blur(4px)' }
const ICON_EASE: [number, number, number, number] = [0.2, 0, 0, 1]
const SUN_REST = 'opacity-0 scale-25 blur-[4px] dark:opacity-100 dark:scale-100 dark:blur-none'
const MOON_REST = 'opacity-100 scale-100 blur-none dark:opacity-0 dark:scale-25 dark:blur-[4px]'

/** Minimal header theme switch. On click, the new theme is revealed with a circular wipe
 *  that grows from the button (View Transitions API) — a longer, more fanciful crossover
 *  than an instant class swap. Falls back to an instant switch when VT / reduced-motion
 *  isn't available. The icons render from SSR with CSS `dark:` rest states (no mounted
 *  gate, no pop-in); `resolvedTheme` + `mounted` only drive the label, the theme-color
 *  metas, and the post-hydration motion takeover. */
const subscribeNoop = () => () => {}

export function ThemeToggle({ className = '', iconStrokeWidth = 1.6, iconSize = 15 }: { className?: string; iconStrokeWidth?: number; iconSize?: number }) {
  const { resolvedTheme, setTheme } = useTheme()
  const reduce = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  // "Mounted" must be false on the server AND on the client's hydration render, or the
  // aria-label below mismatches (next-themes already knows resolvedTheme when React hydrates,
  // which is what the old `resolvedTheme !== undefined` derivation tripped over).
  // useSyncExternalStore with a server snapshot is the React-sanctioned way to say "after
  // hydration": the server and hydration renders read `false`, the first client render `true`.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false)
  const mounted = hydrated && resolvedTheme !== undefined
  const isDark = resolvedTheme === 'dark'

  // The root layout's themeColor pair (layout.tsx viewport) keys on prefers-color-scheme, so
  // Chrome/Android and pre-26 Safari tint their toolbar from the OS theme — not next-themes'
  // class toggle. Once the resolved theme is known, retune BOTH default metas to that theme's
  // background (the same site.brand.themeColor pair the viewport ships) so a forced theme carries the
  // toolbar with it. Only the [media]-keyed defaults are touched: the photo lightboxes remove
  // those and install their own un-keyed pinned meta while open (photos-lightbox.tsx), and that
  // one must keep winning.
  useEffect(() => {
    if (!mounted) return
    const color = isDark ? site.brand.themeColor.dark : site.brand.themeColor.light
    document.head
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')
      .forEach((meta) => { meta.content = color })
  }, [mounted, isDark])

  const toggle = () => {
    const next = isDark ? 'light' : 'dark'
    const doc = document.documentElement
    // WebKit (Safari, and every iOS browser — they all run WebKit) mishandles the wipe:
    // iOS blends a gray cross-fade and staggers the text a beat behind the background;
    // macOS finishes the transition instantly anyway. Until that's debuggable on-device,
    // WebKit gets the honest instant swap. Chrome/Edge keep the circular wipe. (CriOS/
    // FxiOS carry no "Chrome/" token, so the test catches every iOS browser too.)
    const isWebKitEngine = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium|Edg\//.test(navigator.userAgent)
    const canVT = typeof document !== 'undefined' && 'startViewTransition' in document && !reduce && !isWebKitEngine && ref.current
    if (!canVT) {
      setTheme(next)
      return
    }
    const rect = ref.current!.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    // Apply exactly once — from inside the transition when the engine drives it, otherwise
    // from a fallback timer (some embedded/headless browsers expose the API but never run
    // the callback), so the switch always works even where the animation can't.
    let applied = false
    const apply = () => { if (!applied) { applied = true; setTheme(next) } }
    // The native scrollbar isn't part of the view-transition snapshot, so the moment
    // color-scheme flips it repaints — ahead of the circle. Pin the OLD scheme inline
    // (inline beats the globals.css html/.dark rule) and release it the moment the
    // growing circle has swept the whole right edge, so the bar swaps in step with the
    // wipe passing over it — not before the wipe (a lead) and not at its end (a lag).
    const unpin = () => { doc.style.colorScheme = '' }
    const cleanup = () => { doc.classList.remove('theme-vt'); unpin() }
    doc.classList.add('theme-vt')
    doc.style.colorScheme = isDark ? 'dark' : 'light'
    // The fallback ONLY applies the theme. It must never cleanup(): on a slow device the
    // transition can still be capturing at 300ms, and removing .theme-vt mid-flight
    // un-suppresses the default root cross-fade — the gray blend + late-arriving text
    // this timer used to cause on phones. Cleanup belongs to finished.finally alone.
    const fallback = window.setTimeout(apply, 300)

    // flushSync so next-themes applies the class synchronously inside the transition —
    // otherwise the "after" snapshot is captured before the theme actually changes.
    const vt = document.startViewTransition(() => flushSync(apply))
    vt.ready.then(
      () => {
        window.clearTimeout(fallback)
        // Guarded: a UA that can't animate this pseudo-element throws, and an uncaught
        // throw here silently killed the clip. Without the clip the suppressed snapshots
        // still swap instantly, which is the correct degraded behavior.
        try {
          const clip = doc.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' },
          )
          // Release the color-scheme pin once the circle's radius reaches the farthest
          // point of the scrollbar strip (the bottom-right corner) — with the strong
          // ease-out that's ~100ms in. getComputedTiming().progress is post-easing.
          const barDist = Math.hypot(window.innerWidth - x, window.innerHeight - y)
          const track = () => {
            const p = clip.effect?.getComputedTiming().progress ?? 1
            if (p * radius >= barDist) unpin()
            else if (doc.style.colorScheme) requestAnimationFrame(track)
          }
          requestAnimationFrame(track)
        } catch { unpin() /* no clip support — instant swap */ }
      },
      () => { window.clearTimeout(fallback); apply() },
    )
    vt.finished.finally(cleanup)
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={mounted ? (isDark ? 'Switch to light theme' : 'Switch to dark theme') : 'Toggle theme'}
      onClick={toggle}
      // after:* = invisible hit-area extender (~44px tall) — the button's own box, and so the
      // header layout, are untouched.
      className={`tap-press relative inline-flex h-6 w-6 cursor-pointer items-center justify-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)] after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-[''] ${className}`}
    >
      <span className="relative flex" style={{ width: iconSize, height: iconSize }}>
        {/* Both spans are always aria-hidden: they hold only decorative svgs, and the
            button's aria-label carries the control's name. initial={false}: mount doesn't
            animate; retargeting mid-flight keeps rapid toggles smooth. Reduced motion
            collapses to an instant swap. animate stays off until mounted (resolvedTheme
            is undefined before then) — the *_REST classes own the pre-hydration state. */}
        <m.span
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center ${SUN_REST}`}
          initial={false}
          animate={mounted ? (isDark ? ICON_VISIBLE : ICON_HIDDEN) : undefined}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: ICON_EASE }}
        >
          <Sun aria-hidden="true" strokeWidth={iconStrokeWidth} size={iconSize} />
        </m.span>
        <m.span
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center ${MOON_REST}`}
          initial={false}
          animate={mounted ? (isDark ? ICON_HIDDEN : ICON_VISIBLE) : undefined}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: ICON_EASE }}
        >
          <Moon aria-hidden="true" strokeWidth={iconStrokeWidth} size={iconSize} />
        </m.span>
      </span>
    </button>
  )
}
