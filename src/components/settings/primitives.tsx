'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/* The settings page's anatomy, borrowed from the design-system guide: a Section is an
   anchor + .section-title + a body-size lead; a Field is one row of the two-pane grid with
   the name, the config path, and the description on the left and the control on the right.
   Same text treatments as the guide (LEAD / DESC / NAME / MONO). */

export const LEAD = 'max-w-prose font-sans text-prose leading-prose text-foreground'
export const DESC = 'max-w-[38ch] font-sans text-label leading-relaxed text-foreground'
export const NAME = 'font-sans text-[0.9375rem] font-medium leading-snug text-foreground'
export const MONO = 'font-mono text-[0.6875rem] text-[var(--color-muted)]'

export function SettingsSection({ id, title, lead, children }: {
  id: string
  title: string
  lead: React.ReactNode
  children: React.ReactNode
}) {
  // scroll-mt-28 below xl clears the fixed dirty strip (which sits in the rail column at xl).
  return (
    <section id={id} className="scroll-mt-28 xl:scroll-mt-16">
      <h2 className="section-title">{title}</h2>
      <p className={`${LEAD} mt-5`}>{lead}</p>
      <div className="mt-10 border-t border-border">{children}</div>
    </section>
  )
}

/**
 * The config path under every label is the three-interface principle made visible: the
 * same string is the key in site.config.ts and the thing to say to Claude Code ("set
 * identity.tagline to ..."). Click copies it.
 */
export function ConfigPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* clipboard unavailable: the text is still selectable */
        }
      }}
      title="Copy the config path"
      className={`${MONO} group/path inline-flex cursor-pointer items-center gap-1.5 text-left transition-colors hover:text-foreground`}
    >
      <span>{path}</span>
      {copied ? (
        <Check aria-hidden="true" className="size-3 text-[var(--color-accent)]" />
      ) : (
        <Copy aria-hidden="true" className="size-3 opacity-0 transition-opacity group-hover/path:opacity-100 group-focus-visible/path:opacity-100" />
      )}
      <span className="sr-only">{copied ? 'Copied' : 'Copy path'}</span>
    </button>
  )
}

export function Field({ label, path, hint, htmlFor, children, wide }: {
  label: React.ReactNode
  path: string
  hint?: React.ReactNode
  /** The control's id, so the label focuses it. Omit for composite controls. */
  htmlFor?: string
  children: React.ReactNode
  /** Composite controls (lists) take the whole row below the label. */
  wide?: boolean
}) {
  const labelNode = htmlFor ? (
    <label htmlFor={htmlFor} className={NAME}>{label}</label>
  ) : (
    <div className={NAME}>{label}</div>
  )
  return (
    <div className={`grid grid-cols-1 gap-x-12 gap-y-4 border-b border-border py-7 ${wide ? '' : 'md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}`}>
      <div className="space-y-1.5">
        {labelNode}
        <div>
          <ConfigPath path={path} />
        </div>
        {hint && <p className={`${DESC} pt-1`}>{hint}</p>}
      </div>
      <div className={wide ? '' : 'md:pt-0.5'}>{children}</div>
    </div>
  )
}

/** A quiet one-line status under a control: "9 posts, newest 3 days ago", "Saved". */
export function Meta({ children }: { children: React.ReactNode }) {
  // A span, not a p: Meta rides inside a Field hint, which is already a paragraph.
  return <span className={`${MONO} mt-2 block`}>{children}</span>
}
