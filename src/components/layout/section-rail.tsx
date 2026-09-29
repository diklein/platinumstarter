'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useActiveHeading } from '@/lib/use-active-heading'
import { smoothScrollToId } from '@/lib/smooth-scroll'
import type { TocItem } from '@/lib/posts'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'

export interface SectionRailGroup {
  /** Optional group heading (e.g. "Foundations"). Omit for ungrouped items. */
  label?: string
  items: { text: string; slug: string }[]
}

/**
 * The section rail: the left-hand section list that long reference pages share (the design
 * system, the lab index, the settings page). Built on the shadcn Sidebar (Base UI flavor) and
 * styled with the site's tokens: the sidebar-* color aliases in globals.css point at the
 * same semantic set, so the active pill is the surface token and the radius matches the
 * buttons. Rendered non-collapsible and embedded in the page grid rather than as app
 * chrome. Scroll-spy and smooth scrolling reuse the site's existing hooks; the accent dot
 * stays as the active marker.
 */
export function SectionRail({ groups, label = 'Sections' }: { groups: SectionRailGroup[]; label?: string }) {
  // Memoized: the hook re-renders this component on every section change, and this
  // component re-renders on every scroll-spy update — no reason to rebuild the
  // flattened list (and re-derive the spy key from it) each time.
  const flat: TocItem[] = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ depth: 2 as const, text: i.text, slug: i.slug }))),
    [groups]
  )
  const active = useActiveHeading(flat)
  const railRef = useRef<HTMLElement>(null)

  // Follow the page: when scroll-spy moves the active item, scroll the rail so the item sits
  // clear of the fade at either edge (the .ghost-scroll mask: 1.25rem top, 1.75rem bottom),
  // never under it. Only the rail scrolls; the page does not move.
  useEffect(() => {
    const rail = railRef.current
    const el = rail?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!rail || !el) return
    const FADE_TOP = 20, FADE_BOTTOM = 28, GAP = 12
    // Measured through the viewport: offsetTop is relative to the offsetParent, and the
    // sticky nav is one, so the arithmetic drifted with the page and the rail never moved.
    const top = el.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop
    const bottom = top + el.offsetHeight
    if (top < rail.scrollTop + FADE_TOP + GAP) rail.scrollTop = Math.max(0, top - FADE_TOP - GAP)
    else if (bottom > rail.scrollTop + rail.clientHeight - FADE_BOTTOM - GAP) rail.scrollTop = bottom - rail.clientHeight + FADE_BOTTOM + GAP
  }, [active])

  return (
    <nav
      ref={railRef}
      aria-label={label}
      style={{ gridRow: '1 / span 100' }}
      className="ghost-scroll hidden xl:block col-start-1 col-span-2 self-start sticky top-36 -mt-5 max-h-[calc(100vh-10rem)] overflow-y-auto border-r border-border pr-4"
    >
      <SidebarProvider className="min-h-0 w-full">
        <Sidebar collapsible="none" className="w-full bg-transparent">
          <SidebarContent className="gap-8 overflow-visible">
            {groups.map((group, gi) => (
              <SidebarGroup key={group.label ?? gi} className="p-0">
                {group.label && (
                  <SidebarGroupLabel className="mb-1 h-auto px-3 text-[0.8125rem] font-semibold text-sidebar-foreground">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {group.items.map((item) => {
                      const isActive = active === item.slug
                      return (
                        <SidebarMenuItem key={item.slug || 'overview'}>
                          <SidebarMenuButton
                            isActive={isActive}
                            render={
                              <a
                                href={item.slug ? `#${item.slug}` : '#'}
                                aria-current={isActive ? 'true' : undefined}
                              />
                            }
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault()
                              smoothScrollToId(item.slug)
                            }}
                            className="h-9 gap-2.5 rounded-lg px-3 text-[0.9375rem] leading-snug text-[var(--color-muted)] data-active:font-normal hover:bg-sidebar-accent/50"
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)] transition-opacity duration-200 ${
                                isActive ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            <span>{item.text}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </nav>
  )
}
