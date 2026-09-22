import React from 'react'

/**
 * A standing note at the top of a post: corrections, "this product is dead now", editor's
 * updates. The same bordered panel as <TlDr>, with the lead-in ("Update:") inline and bold —
 * tried as an all-caps eyebrow and rejected; a one-sentence note read as furniture.
 *
 * A plain div, NOT the shadcn Alert: Alert's own `text-sm` cannot be overridden by the
 * site's `text-prose` token (tailwind-merge doesn't know text-prose is a font-size, so it
 * keeps both and text-sm wins in the cascade) — which quietly rendered the note at 14px
 * against 21px body copy. The panel is four utilities; the primitive earned nothing.
 */
export function PostNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-prose my-8 md:my-10 border border-[var(--color-border)] p-6">
      <div className="font-sans text-prose leading-prose text-foreground [&_strong]:font-medium [&>p]:mb-0">
        {children}
      </div>
    </div>
  )
}
