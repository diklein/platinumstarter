'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { ThemeProvider } from 'next-themes'
import { LazyMotion, MotionConfig } from 'motion/react'

// Both of these used to ride in the pre-FCP bundle on every page and neither is needed
// before a user interacts: motion's feature bundle loads async through LazyMotion's
// function form, and the toast portal (only the subscribe form fires toasts) mounts
// from its own post-hydration chunk. Together ~31KB gz off the critical path — on a
// throttled mobile load that path was CSS + font + 218KB of JS sharing one pipe.
const loadMotionFeatures = () => import('@/lib/motion-features').then((m) => m.default)
const Toaster = dynamic(() => import('@/components/ui/sonner').then((m) => m.Toaster), { ssr: false })

/**
 * iOS Safari does not apply `:active` styles on tap AT ALL unless the document carries a touch
 * listener. Every `active:` class in the app — the header buttons, the lightbox's close and
 * prev/next — was therefore dead on a phone while working perfectly on desktop, which is exactly
 * the "buttons have no tap state on mobile" report. An empty touchstart listener on <body> is the
 * long-standing cure; it costs nothing and changes no behaviour.
 */
function useIOSActiveStates() {
  useEffect(() => {
    const noop = () => {}
    document.body.addEventListener('touchstart', noop, { passive: true })
    return () => document.body.removeEventListener('touchstart', noop)
  }, [])
}

/**
 * Dev-only horizontal-overflow canary (Marcin ships this in production; dev is enough here).
 * If the document is wider than the viewport, some element escaped its column — the classic
 * mobile bug that hides until someone pans sideways. One warn per navigation, dev builds only.
 */
function useOverflowCanary() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const id = window.setTimeout(() => {
      if (document.documentElement.scrollWidth > window.innerWidth) {
        console.warn(
          `[overflow] page is ${document.documentElement.scrollWidth - window.innerWidth}px wider than the viewport — something escaped its column`,
        )
      }
    }, 1500)
    return () => window.clearTimeout(id)
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  useIOSActiveStates()
  useOverflowCanary()
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // color-scheme lives in globals.css (html/.dark), NOT as next-themes' inline style:
      // the wipe (ThemeToggle) pins the OLD scheme inline for the transition's duration so
      // the native scrollbar doesn't repaint ahead of the circle, and an inline style from
      // next-themes would overwrite that pin the moment the theme applies.
      enableColorScheme={false}
    >
      <LazyMotion features={loadMotionFeatures} strict>
        {/* App-wide reduced-motion backstop: every m.* animation drops its transforms under
            the OS preference without each component opting in via useReducedMotion — the
            per-component checks that exist remain as stronger, hand-tuned paths. */}
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster position="bottom-right" />
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  )
}
