"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/* The .shadow-command light stack (globals.css), inlined for the toast only: sonner styles
   its toasts with [data-sonner-toast][data-styled] rules that outrank the bare class, so the
   light layers ride in as an inline style. Dark needs no copy — html.dark .shadow-command
   outranks sonner's rule, so the dark plane stays single-source. Change WITH globals. */
const SHADOW_COMMAND_LIGHT =
  "0 1px 2px rgba(0,0,0,0.05), 0 4px 10px rgba(0,0,0,0.07), 0 16px 36px rgba(0,0,0,0.13), 0 40px 100px rgba(0,0,0,0.30)"

const Toaster = ({ ...props }: ToasterProps) => {
  // resolvedTheme, not theme: theme is "system" for most visitors, which never flips the
  // per-theme choices below. The Toaster mounts client-only (ssr:false), so it's available.
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  return (
    <Sonner
      theme={(resolvedTheme ?? "system") as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          // Spin on a wrapper span, never the <svg> itself — transforming an inline
          // SVG makes Chromium rasterise it at 1x (the like-button pop learned this).
          <span className="inline-flex animate-spin">
            <Loader2Icon className="size-4" />
          </span>
        ),
      }}
      style={
        {
          // Theme tokens, not hex: light sits on the page background; dark steps up to the
          // lifted surface plane, the same separation the command palette uses. No border
          // and square corners — the floating-panel rules.
          "--normal-bg": dark ? "var(--color-surface)" : "var(--color-bg)",
          "--normal-text": "var(--color-fg)",
          "--normal-border": "transparent",
          "--border-radius": "0px",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // cn-toast is globals' hook (the action button's accent-fill lives there);
          // shadow-command carries the dark stack and the forced-colors border.
          toast: "cn-toast shadow-command",
        },
        // Light only — see SHADOW_COMMAND_LIGHT above.
        style: dark ? undefined : { boxShadow: SHADOW_COMMAND_LIGHT },
      }}
      {...props}
    />
  )
}

export { Toaster }
