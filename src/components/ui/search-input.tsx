'use client'

import { useRef } from 'react'
import { Search, X } from 'lucide-react'

// The /writing search field, extracted so /archive renders the exact
// same control: leading search icon, hidden native webkit cancel button, and — once
// there's a query — an inline result count beside a hover-circled clear button. The
// input's right padding widens with the query so text never runs under the overlay.
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  resultsCount,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  resultsCount?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted)] pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        maxLength={200}
        // Search queries aren't prose or identity: no squiggles, no autofill overlay.
        spellCheck={false}
        autoComplete="off"
        // Form-protection extensions rewrite autocomplete="off" to "on" before React
        // hydrates (the ⌘K ghost input hit the same thing) — harmless here, don't warn.
        suppressHydrationWarning
        className={`font-sans text-base bg-transparent dark:bg-[oklch(0.22_0.010_240)] rounded-lg border border-[var(--color-border-strong)] dark:border-[var(--color-muted)] pl-9 py-1.5 w-full outline-none accent-focus-ring placeholder:text-[var(--color-muted)] [&::-webkit-search-cancel-button]:hidden ${value && resultsCount !== undefined ? 'pr-28' : 'pr-8'}`}
      />
      {value && (
        <div className="absolute right-0 top-0 h-full flex items-center">
          {resultsCount !== undefined && (
            <span
              aria-live="polite"
              className="font-sans text-label text-[var(--color-muted)] tabular-nums whitespace-nowrap"
            >
              {resultsCount} {resultsCount === 1 ? 'result' : 'results'}
            </span>
          )}
          <button
            type="button"
            // Clearing must hand focus back to the input — the user's next move is
            // almost always typing a new query, and without this the clear tap
            // strands focus on a button that's about to unmount.
            onClick={() => { onValueChange(''); inputRef.current?.focus() }}
            className="h-full px-2.5 flex items-center text-[var(--color-muted)] transition-colors group"
            aria-label="Clear search"
          >
            <span className="flex items-center justify-center size-5 rounded-full group-hover:bg-black/8 group-active:bg-black/8 dark:group-hover:bg-white/10 transition-colors">
              <X className="size-3.5" />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
