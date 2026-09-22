'use client'

import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu'

import { cn } from '@/lib/utils'

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({ ...props }: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
}

function ContextMenuContent({
  className,
  children,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      {/* sideOffset matches the More menu (site-header.tsx): the popup opens a beat
          below its anchor instead of flush against it. */}
      <ContextMenuPrimitive.Positioner sideOffset={10} className="isolate z-[70]">
        {/* House popup surface: no border rings anywhere — light separates on diffuse
            shadow alone, dark steps up to the surface plane (the ⌘K rule). Enter/exit
            ride Base UI's data-starting/ending-style as CSS transitions. */}
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            // outline-none is for Safari: it matches :focus-visible on the programmatically
            // focused popup (Chrome doesn't) and would draw its default blue UA ring.
            'shadow-command outline-none min-w-52 origin-(--transform-origin) bg-[var(--color-bg)] p-1.5 dark:bg-[var(--color-surface)]',
            'transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({ className, ...props }: ContextMenuPrimitive.Item.Props) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(
        // Sized to the Button "default" step (h-8, 14px) — the sm-scale first cut felt
        // small — and cursor-pointer: these are actions, not text.
        // text-prose (2026-08-24): the mark menu reads at body size, not UI-small.
        'flex cursor-pointer select-none items-center gap-2.5 px-2.5 py-2 font-sans text-prose leading-none text-foreground outline-none data-highlighted:bg-[var(--color-surface)] dark:data-highlighted:bg-[var(--color-secondary-bg)]',
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn('mx-2 my-1.5 h-px bg-[var(--color-border)]', className)}
      {...props}
    />
  )
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator }
