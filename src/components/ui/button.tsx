import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The base sets NO font-size on purpose. Each size owns its own text-* class instead, so that
// raw `buttonVariants()` callers — anchors styled as buttons, e.g. "Send a comment" — get the
// right size even though they skip twMerge. When text-sm lived on the base, the xl variant's
// text-base collided with it in raw usage and the browser kept 14px. Move the size to the size.
// The after:* pseudo is an invisible VERTICAL hit-area extender: the default h-8 button
// is 32px tall, 12px short of the 44px touch floor. Vertical only — horizontal extension
// would overlap neighbors in button rows (pagination, article footer). Buttons narrower
// than 44px widen their own hit area at the call site (see like-button).
const buttonVariants = cva(
  "group/button relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap no-underline transition-[color,background-color,border-color,box-shadow,translate,scale] select-none cursor-pointer active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Darken the COLOR, not the element: hover:brightness-90 was a filter, and a filter
        // promotes the button to its own compositing layer — glyphs re-snap to the layer's
        // pixel grid and visibly shift a hair on every hover. Mixing 10% black into the
        // accent is the same visual step with no filter involved. var(--color-accent), not
        // var(--color-primary): primary is a build-only @theme alias that never reaches :root.
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--color-accent)_90%,black)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-border aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 text-[0.9375rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // xl rides at 16px: sized by eye (up from 15, and from a first pass that
        // inherited 14 and read too small inside the taller frame).
        xl: "h-10 gap-1.5 px-3 text-base has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // 2xl is the hero size — a page's single call to action in a centered
        // composition (/store's Buy Streetline). Promoted from /lab/store-quicktake.
        "2xl": "h-12 gap-2 px-6 text-[1.0625rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8 text-sm",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] text-sm in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] text-sm in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
