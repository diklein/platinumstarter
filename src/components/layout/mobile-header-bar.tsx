'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SiteMark } from './site-mark'
import { site } from '@/lib/site-config'

const LINK = 'tap-press font-sans text-[1.125rem] text-foreground transition-opacity hover:opacity-70 active:opacity-70'

interface MobileHeaderBarProps {
  rightLabel?: string
  rightIcon?: React.ReactNode // when set, renders an icon button (foreground → tertiary) instead of a text label
  onRightClick: () => void
  onLogoClick?: () => void
  ariaLabel?: string
  ariaExpanded?: boolean
  ariaControls?: string
  className?: string
  extraRight?: React.ReactNode // controls placed before the right button (e.g. ⌘K + theme on mobile)
  buttonRef?: React.RefObject<HTMLButtonElement | null> // exposed so the menu can return focus here on close
}

export function MobileHeaderBar({ rightLabel, rightIcon, onRightClick, onLogoClick, ariaLabel, ariaExpanded, ariaControls, className, extraRight, buttonRef }: MobileHeaderBarProps) {
  const isHome = usePathname() === '/'
  return (
    <div className={cn('flex items-center justify-between h-12 px-6 shrink-0', className)}>
      <Link href="/" onClick={onLogoClick} className={cn(LINK, 'inline-flex items-center gap-1')}>
        {/* 20px against the bar's 18px type — the same optical weight as 17px against
            the desktop header's 13px labels */}
        <SiteMark size={20} active={isHome} />
        {site.identity.name}
      </Link>
      {/* gap-[15.2px]: sized so the measured INK distance between the three icons is 24px
          (glyph padding supplies the rest); see the ml note on the menu button below. */}
      <div className="flex items-center gap-[15.2px]">
        {extraRight}
        <button
          ref={buttonRef}
          onClick={onRightClick}
          aria-label={ariaLabel}
          aria-expanded={ariaExpanded}
          aria-controls={ariaControls}
          className={
            rightIcon
              // ml-[1.3px]: measured (getBBox on the live header), the ink gaps were
              // search→theme 20.9px vs theme→menu 17.5px at equal box spacing, because the
              // three glyphs pad their boxes differently. This nudge makes the visible
              // icon-to-icon distances equal, not the box-to-box ones.
              // px-2.5 + the compensating negative margins widen the tap target from the bare
              // 24px icon to 44px without moving the icon or the measured ink gaps.
              ? 'tap-press px-2.5 -mr-3.5 ml-[calc(1.3px-0.625rem)] flex min-h-11 cursor-pointer items-center text-foreground transition-colors hover:text-[var(--color-muted)] active:text-[var(--color-muted)]'
              : cn(LINK, 'min-h-11 flex items-center cursor-pointer')
          }
        >
          {rightIcon ?? rightLabel}
        </button>
      </div>
    </div>
  )
}
