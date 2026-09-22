import { cn } from '@/lib/utils'

/**
 * shadcn-style progress bar, dependency-free (this repo's primitives come from Base UI, which
 * has no Progress — and the shadcn recipe's Radix wrapper adds nothing over a div for a
 * read-only indicator). Same anatomy and API as shadcn/ui: a track, an indicator translated
 * left by the remaining percentage, `className` to restyle the track. `indicatorClassName`
 * restyles the fill (shadcn's version hardcodes bg-primary; the lab variations need to vary it).
 *
 * The indicator moves with translateX rather than width so a live update (the nightly
 * reading-progress POST) animates as a slide, not a reflow.
 */
export function Progress({
  value,
  className,
  indicatorClassName,
  ...props
}: {
  /** 0-100. */
  value: number
  indicatorClassName?: string
} & React.ComponentProps<'div'>) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative h-2 w-full overflow-hidden bg-foreground/10', className)}
      {...props}
    >
      <div
        className={cn('h-full w-full bg-[var(--color-accent)] transition-transform duration-500 ease-out', indicatorClassName)}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </div>
  )
}
