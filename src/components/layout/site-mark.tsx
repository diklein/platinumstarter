import Image from 'next/image'
import { site } from '@/lib/site-config'

/* The site mark, chosen by `brand.mark` in site.config.ts:
   - 'starter': the template's own mark, a Power Mac G3 minitower (Platinum is Apple's name
     for the Mac OS 8 appearance, the era the G3 belongs to). Drawn on a 64 grid inside a 52
     safe area, stroke 4. Inset line = slot, full-width line = case seam, ink dot = hardware
     (the power button on the spine), red dot = the badge seat on the latch panel.
   - 'wordmark': no mark; the header renders the name alone.
   - a path under /public: that image, sized to the seat.

   `active` drives the accent: in the header the red is only lit while the mark is a live
   control (hover/menu open), because a permanently red dot beside the wordmark read as an
   indicator that was always on. Elsewhere (cards, OG) the mark is the brand and stays red. */
export function SiteMark({ size = 17, active = true }: { size?: number; active?: boolean }) {
  const mark = site.brand.mark
  if (mark === 'wordmark') return null
  if (mark.startsWith('/')) {
    return <Image src={mark} alt="" width={size} height={size} className="shrink-0" priority />
  }
  const red = active ? 'var(--color-accent)' : 'var(--color-mark-mute)'
  const stroke = 4
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect x="16" y="8" width="22" height="46" fill="none" stroke="currentColor" strokeWidth={stroke} />
      <rect x="38" y="18" width="10" height="36" fill="none" stroke="currentColor" strokeWidth={stroke} />
      <line x1="20" y1="16" x2="34" y2="16" stroke="currentColor" strokeWidth={stroke} />
      <line x1="20" y1="24" x2="34" y2="24" stroke="currentColor" strokeWidth={stroke} />
      <line x1="16" y1="38" x2="38" y2="38" stroke="currentColor" strokeWidth={stroke} />
      <rect x="41.5" y="41.5" width="3" height="3" rx="1.5" fill="currentColor" />
      <rect x="24" y="42" width="6" height="6" rx="3" fill={red} style={{ transition: 'fill 0.3s ease' }} />
    </svg>
  )
}
