'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface PasswordGateProps {
  title: string
  // Server action: validates the password and, on success, sets the unlock
  // cookie server-side. Returns true when unlocked.
  unlockAction: (input: string) => Promise<boolean>
}

const emptySubscribe = () => () => {}

// Form-only gate. Rendered by the server ONLY when a protected design is locked;
// the protected content is never passed here (and never enters the payload). On
// success we refresh so the server re-renders the page with the content.
export function PasswordGate({ title, unlockAction }: PasswordGateProps) {
  const router = useRouter()
  // Hydration signal, not state: false while hydrating (matching the server's plain
  // visible markup), true from the first client-driven render on.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [isShown, setIsShown] = useState(false)
  const [input, setInput] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Autofocus only where a hardware keyboard is likely: on touch devices, focusing on
    // load shoves the software keyboard over the gate before the visitor has read it.
    if (!('ontouchstart' in window)) inputRef.current?.focus()
  }, [])

  // Trigger stagger reveal after the gate renders so CSS transitions register
  useEffect(() => {
    if (!mounted) return
    const raf = requestAnimationFrame(() => setIsShown(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted])

  useEffect(() => () => {
    clearTimeout(revertTimerRef.current)
    clearTimeout(shakeTimerRef.current)
  }, [])

  const triggerError = useCallback(() => {
    // flushSync forces React to commit synchronously so is-shaking isn't
    // overwritten by className reconciliation when we touch the DOM next.
    flushSync(() => setIsError(true))
    const el = inputRef.current
    if (!el) return
    el.classList.remove('is-shaking')
    void el.offsetWidth // reflow so animation replays on repeated wrong attempts
    el.classList.add('is-shaking')
    clearTimeout(shakeTimerRef.current)
    const shakeMs = 80 * 2 + 60 * 2 + 20
    shakeTimerRef.current = setTimeout(() => el.classList.remove('is-shaking'), shakeMs)
    clearTimeout(revertTimerRef.current)
    revertTimerRef.current = setTimeout(() => setIsError(false), 80 * 2 + 60 * 2 + 3000)
  }, [])

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending) return
    setIsPending(true)
    try {
      const valid = await unlockAction(input)
      if (valid) {
        // Server now sees the unlock cookie — re-render with the content.
        router.refresh()
      } else {
        triggerError()
      }
    } catch {
      triggerError()
    } finally {
      setIsPending(false)
    }
  }, [input, unlockAction, router, triggerError, isPending])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    // Typing cancels the error state immediately
    if (isError) {
      clearTimeout(revertTimerRef.current)
      setIsError(false)
    }
  }, [isError])

  // The static shell (title, input, button) renders on the server — no-JS and pre-hydration
  // readers get a working form, not a blank page. The .t-stagger-line class hides a line until
  // .is-shown, so it goes on only after mount: server markup stays plain and visible, and
  // hydration then plays the same stagger reveal as before.
  const line = (n: 1 | 2) => (mounted ? `t-stagger-line t-stagger-line--${n} ` : '')

  return (
    <div className="col-span-12 min-h-[70dvh] flex flex-col items-center justify-center">
      <div className={`t-stagger${isShown ? ' is-shown' : ''} flex flex-col items-center`}>
        <p className={`${line(1)}section-label mb-8 text-center text-foreground`}>
          {title} is password protected.
        </p>
        <div className={line(2).trim() || undefined}>
          <div className={`t-input-wrap${isError ? ' is-error' : ''}`}>
            <form onSubmit={submit} className="flex gap-1.5 items-center">
              <input
                ref={inputRef}
                type="password"
                value={input}
                onChange={handleChange}
                placeholder="Password"
                aria-label="Password"
                aria-invalid={isError || undefined}
                aria-describedby={isError ? 'password-gate-error' : undefined}
                maxLength={100}
                // border-strong, not border: the 1px line is this input's only boundary, and
                // the hairline token reads 1.4:1 against the page (WCAG 1.4.11 wants 3:1).
                // h-9 = the lg Submit button beside it (py-2 + text-base computed to 42px
                // against the button's 36px). rounded-lg matches the button's radius too.
                // pointer-fine gate on the smaller size: sm: alone caught portrait iPads
                // (768px, touch), whose sub-16px input made iOS zoom the page on focus.
                // Touch devices keep 16px at every width; only mouse/trackpad devices
                // get the compact label size.
                className={`t-input${isError ? ' is-error' : ''} font-sans text-base sm:pointer-fine:text-label text-foreground bg-transparent border border-[var(--color-border-strong)] rounded-lg px-3 h-9 w-56 outline-none accent-focus-ring placeholder:text-[var(--color-muted)]`}
              />
              <Button type="submit" variant="default" size="lg">
                Submit
              </Button>
            </form>
            {/* role="alert" so the rejection is SPOKEN, not just shaken. The element is always
                mounted and CSS-hidden via visibility (see .t-error-msg), so the live region
                exists early and every hidden→visible flip announces like an insertion. */}
            <p
              id="password-gate-error"
              role="alert"
              className="t-error-msg section-label mt-3 text-center"
            >
              Incorrect password.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
