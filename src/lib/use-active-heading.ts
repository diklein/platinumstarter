import { useCallback, useSyncExternalStore } from 'react'
import type { TocItem } from '@/lib/posts'

const HEADER_OFFSET = 64 // matches scroll-margin-top / smooth-scroll landing

// Tracks the current section for the desktop TOC sidebar and the mobile Contents sheet.
// Scroll-position based (not IntersectionObserver) so it degrades cleanly to "" — the
// Intro/top state — whenever the reader is above the first heading. Items whose slug has
// no matching element (e.g. the synthetic "Intro" item, slug "") are simply skipped.
//
// One spy per heading list, shared: TableOfContents renders BOTH the desktop rail and
// the mobile sheet (hidden by CSS, not unmounted), so a per-hook effect meant two
// scroll/resize listener pairs and two rAF loops measuring every heading on each
// article. Consumers with the same slugs now subscribe to a single refcounted
// module-level spy (the mobile-toc-state / grid-overlay-store shape); the last
// unsubscriber tears the listeners down.

type Spy = {
  active: string
  subs: Set<() => void>
  refs: number
  detach: () => void
}

const spies = new Map<string, Spy>()

function attach(key: string): Spy {
  const existing = spies.get(key)
  if (existing) {
    existing.refs++
    return existing
  }

  const spy: Spy = { active: '', subs: new Set(), refs: 1, detach: () => {} }
  spies.set(key, spy)

  const els = key
    .split('|')
    .filter(Boolean)
    .map((slug) => document.getElementById(slug))
    .filter((el): el is HTMLElement => el !== null)
  if (els.length === 0) return spy

  const set = (slug: string) => {
    if (slug === spy.active) return
    spy.active = slug
    spy.subs.forEach((cb) => cb())
  }

  let frame = 0
  const compute = () => {
    frame = 0
    // At (or a hair from) the page bottom, the last heading is the current section —
    // it often sits too close to the end to ever scroll up past the trigger line, so
    // the loop below would otherwise stop one heading short (the classic scroll-spy bug).
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      set(els[els.length - 1].id)
      return
    }
    const y = window.scrollY + HEADER_OFFSET + 4
    let current = '' // "" → above the first heading → Intro
    for (const el of els) {
      if (el.getBoundingClientRect().top + window.scrollY <= y) current = el.id
      else break
    }
    set(current)
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }

  compute()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  spy.detach = () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
  return spy
}

export function useActiveHeading(toc: TocItem[]) {
  // Slugs never contain '|' (github-slugger output), so the join is collision-free.
  // Keying on content rather than array identity also survives consumers that
  // rebuild their toc array per render.
  const key = toc.map((t) => t.slug).join('|')

  const subscribe = useCallback(
    (onChange: () => void) => {
      const spy = attach(key)
      spy.subs.add(onChange)
      return () => {
        spy.subs.delete(onChange)
        if (--spy.refs === 0) {
          spy.detach()
          spies.delete(key)
        }
      }
    },
    [key],
  )

  return useSyncExternalStore(subscribe, () => spies.get(key)?.active ?? '', () => '')
}
