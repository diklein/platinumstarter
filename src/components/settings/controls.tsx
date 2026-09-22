'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettings } from './store'
import { Field, MONO } from './primitives'

/* Save-on-change controls. Discrete controls (switch, select, reorder) apply the moment
   they change; text applies on blur or 600ms after the last keystroke, whichever comes
   first. Every control is bound to exactly one config path. */

const DEBOUNCE_MS = 600

/** A brief "Saved" beside a control after its last write. */
function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = () => {
    clearTimeout(timer.current)
    setSaved(true)
    timer.current = setTimeout(() => setSaved(false), 1600)
  }
  return [saved, flash]
}

function Saved({ on }: { on: boolean }) {
  return (
    <span aria-live="polite" className={`${MONO} transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-0'}`}>
      {on ? 'Saved' : ''}
    </span>
  )
}

/* ── Text ────────────────────────────────────────────────────────────────── */

type TextKind = 'text' | 'url' | 'email' | 'number'

/**
 * The bare text control: blur or 600ms after the last keystroke commits. `commit` receives
 * the trimmed value (`null` when cleared, a number for `type="number"`) and reports whether
 * the write landed.
 */
export function InlineText({ id, value, placeholder, multiline, type = 'text', mono, commit, ariaLabel }: {
  id?: string
  /** The resolved value. `undefined` renders empty (an absent optional field). */
  value: string | number | undefined
  placeholder?: string
  multiline?: boolean
  type?: TextKind
  /** Paths, colors, model ids: mono. */
  mono?: boolean
  commit: (value: string | number | null) => Promise<boolean>
  ariaLabel?: string
}) {
  const external = value === undefined ? '' : String(value)
  const [local, setLocal] = useState(external)
  const [seen, setSeen] = useState(external)
  const [focused, setFocused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [saved, flash] = useSavedFlash()

  // The resolved value moved under us (a revert, another control): adopt it unless the
  // field is being typed in (the derive-state-from-props pattern, no effect).
  if (external !== seen) {
    setSeen(external)
    if (!focused) setLocal(external)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async () => {
    clearTimeout(timer.current)
    const trimmed = local.trim()
    if (trimmed === external) return
    let next: string | number | null = trimmed === '' ? null : trimmed
    if (type === 'number' && next !== null) {
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return
      next = n
    }
    if (await commit(next)) flash()
  }

  const onChange = (v: string) => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(save, DEBOUNCE_MS)
  }

  const className = `${mono ? 'font-mono' : ''} placeholder:text-[var(--color-muted)]/70`
  return (
    <div className="flex items-start gap-3">
      {multiline ? (
        <textarea
          id={id}
          aria-label={ariaLabel}
          value={local}
          placeholder={placeholder}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); void save() }}
          className={`${className} min-h-24 w-full border border-input bg-transparent px-2.5 py-1.5 text-base leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30`}
        />
      ) : (
        <Input
          id={id}
          aria-label={ariaLabel}
          type={type === 'number' ? 'text' : type}
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={local}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); void save() }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
          className={className}
        />
      )}
      <span className="w-10 shrink-0 pt-2 text-right"><Saved on={saved} /></span>
    </div>
  )
}

export function TextField({ label, path, value, hint, placeholder, multiline, type = 'text', mono }: {
  label: React.ReactNode
  path: string
  value: string | number | undefined
  hint?: React.ReactNode
  placeholder?: string
  multiline?: boolean
  type?: TextKind
  mono?: boolean
}) {
  const { patch } = useSettings()
  const id = useId()
  return (
    <Field label={label} path={path} hint={hint} htmlFor={id}>
      <InlineText id={id} value={value} placeholder={placeholder} multiline={multiline} type={type} mono={mono} commit={(v) => patch(path, v)} />
    </Field>
  )
}

/* ── Color ───────────────────────────────────────────────────────────────── */

/** A text field for a CSS color plus the browser's color picker beside it. The picker speaks
 *  hex, so picking writes a hex string; typing accepts anything CSS does (hex, oklch(), rgb()).
 *  The swatch previews whatever the field holds, since the browser resolves the value. */
export function ColorField({ label, path, value, hint, placeholder }: {
  label: React.ReactNode
  path: string
  value: string | undefined
  hint?: React.ReactNode
  placeholder?: string
}) {
  const { patch } = useSettings()
  const id = useId()
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? '') ? (value as string) : '#d70000'
  return (
    <Field label={label} path={path} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-3">
        <span
          className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border"
          style={{ backgroundColor: value || 'var(--color-accent)' }}
        >
          <input
            type="color"
            aria-label={`${typeof label === 'string' ? label : 'Color'} picker`}
            value={hex}
            onChange={(e) => patch(path, e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <InlineText id={id} value={value} placeholder={placeholder} mono commit={(v) => patch(path, v)} />
      </div>
    </Field>
  )
}

/* ── Switch ──────────────────────────────────────────────────────────────── */

export function SwitchField({ label, path, value, hint, onChange }: {
  label: React.ReactNode
  path: string
  value: boolean
  hint?: React.ReactNode
  /** Replaces the default write (`patch(path, next)`); return whether it landed. */
  onChange?: (next: boolean) => Promise<boolean> | boolean
}) {
  const { patch } = useSettings()
  const id = useId()
  const [saved, flash] = useSavedFlash()
  return (
    <Field label={label} path={path} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-3">
        <Switch id={id} checked={value} onCheckedChange={async (next) => { if (await (onChange ? onChange(next) : patch(path, next))) flash() }} />
        <Saved on={saved} />
      </div>
    </Field>
  )
}

/* ── Select ──────────────────────────────────────────────────────────────── */

export type Option = { value: string; label: string }

export function SelectField({ label, path, value, options, hint, onChange }: {
  label: React.ReactNode
  path: string
  value: string
  options: Option[]
  hint?: React.ReactNode
  /** Override the write (a select that maps its value onto a richer shape). */
  onChange?: (value: string) => Promise<boolean>
}) {
  const { patch } = useSettings()
  const id = useId()
  const [saved, flash] = useSavedFlash()
  return (
    <Field label={label} path={path} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-3">
        <div className="w-full max-w-xs">
          <SelectControl id={id} value={value} options={options} onChange={async (next) => { if (await (onChange ? onChange(next) : patch(path, next))) flash() }} />
        </div>
        <Saved on={saved} />
      </div>
    </Field>
  )
}

/** The bare select, for composite controls. */
export function SelectControl({ id, value, options, onChange, placeholder }: {
  id?: string
  value: string | null
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => { if (typeof next === 'string') onChange(next) }} items={options}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ── Ordered list ────────────────────────────────────────────────────────── */

/**
 * A reorderable list written back as one array (nav, home.grid, social.order). Up/down
 * arrows, remove, and an add row fed from the options not yet in the list.
 */
export function OrderedList<T>({ items, keyOf, labelOf, subOf, onChange, addOptions, addLabel = 'Add', removable = true, extra }: {
  items: T[]
  keyOf: (item: T) => string
  labelOf: (item: T) => React.ReactNode
  subOf?: (item: T) => React.ReactNode
  onChange: (next: T[]) => void
  /** Options the add select offers, plus how to turn a chosen value into an item. */
  addOptions?: { options: Option[]; make: (value: string) => T }
  addLabel?: string
  removable?: boolean
  /** Extra per-row control (the social handle input). */
  extra?: (item: T) => React.ReactNode
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    onChange(next)
  }
  return (
    <div>
      <ol className="divide-y divide-border border-y border-border">
        {items.map((item, i) => (
          <li key={keyOf(item)} className="flex items-center gap-3 py-2">
            <div className="flex shrink-0 flex-col">
              <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ChevronUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                <ChevronDown />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-sans text-label text-foreground">{labelOf(item)}</div>
              {subOf && <div className={MONO}>{subOf(item)}</div>}
            </div>
            {extra && <div className="w-1/2 shrink-0">{extra(item)}</div>}
            {removable && (
              <Button variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <X />
              </Button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className={`${MONO} py-3`}>Empty</li>}
      </ol>
      {addOptions && addOptions.options.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="w-full max-w-xs">
            <SelectControl value={null} options={addOptions.options} placeholder={addLabel} onChange={(v) => onChange([...items, addOptions.make(v)])} />
          </div>
        </div>
      )}
    </div>
  )
}
