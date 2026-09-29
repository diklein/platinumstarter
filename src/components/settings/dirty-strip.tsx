'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useSettings } from './store'
import { MONO } from './primitives'

/* Git is the save layer. The card reads `git status` for the files settings can write and
   floats in the corner while anything is uncommitted; Review opens the diffs, Revert puts
   the committed bytes back. Both confirm before discarding anything. */

type DiffFile = { file: string; status: string; diff: string }

function Confirm({ label, onConfirm, size = 'sm' }: { label: string; onConfirm: () => Promise<unknown>; size?: 'sm' | 'xs' }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!asking) {
    return (
      <Button variant="ghost" size={size} onClick={() => setAsking(true)}>{label}</Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="destructive"
        size={size}
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false); setAsking(false) } }}
      >
        Discard changes
      </Button>
      <Button variant="ghost" size={size} onClick={() => setAsking(false)}>Keep</Button>
    </span>
  )
}

/** A unified diff in the site's code well. Additions in ink, removals muted, hunks quieter. */
function Diff({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <figure className="code-block">
      <pre tabIndex={0} role="region" aria-label="Diff" className="overflow-x-auto">
        <code>
          {lines.map((line, i) => {
            const cls = line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')
              ? 'text-[var(--color-muted)] opacity-70'
              : line.startsWith('@@')
                ? 'text-[var(--color-muted)]'
                : line.startsWith('+')
                  ? 'text-foreground'
                  : line.startsWith('-')
                    ? 'text-[var(--color-muted)] line-through decoration-[var(--color-border-strong)]'
                    : 'text-[var(--color-muted)]'
            return <span key={i} className={`block ${cls}`}>{line || ' '}</span>
          })}
        </code>
      </pre>
    </figure>
  )
}

/**
 * A floating card in the bottom-right corner, shown only while settings has written something
 * git has not committed: the count, a saving readout, Review (the diffs in a sheet) and Revert.
 * Fixed and out of the page flow, the corner a toast would use, so it is in view wherever the
 * page is scrolled and there is nothing to notice when the tree is clean.
 */
export function DirtyStrip() {
  const { snap, revert, pending } = useSettings()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<DiffFile[] | null>(null)
  const dirty = snap.dirty
  const count = dirty.length

  // Loaded on demand (Review click, and again after a revert inside the sheet), not in an
  // effect: the diff is a read of an external system, and the user's click is the moment.
  const load = async () => {
    setFiles(null)
    try {
      const body = (await (await fetch('/api/settings/diff')).json()) as { files: DiffFile[] }
      setFiles(body.files)
    } catch {
      setFiles([])
    }
  }
  const openReview = () => { setOpen(true); void load() }
  const revertOne = async (file: string) => { await revert(file); await load() }
  const revertAll = async () => {
    for (const d of dirty) await revert(d.file)
    setOpen(false)
  }

  const visible = count > 0 || pending > 0

  return (
    <>
      {visible && (
        <div
          role="status"
          className="dirty-card shadow-elevated fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2.5rem)] flex-wrap items-center gap-x-3 gap-y-2 bg-[var(--color-bg)] px-4 py-3"
        >
          <style>{`
            @keyframes dirty-rise { from { opacity: 0; transform: translateY(8px); } }
            .dirty-card { animation: dirty-rise 220ms var(--ease-out) both; }
            @media (prefers-reduced-motion: reduce) { .dirty-card { animation: none; } }
          `}</style>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
          <p className={`${MONO} text-foreground`}>
            {count === 0 ? 'Saving' : `${count} file${count === 1 ? '' : 's'} changed`}
            {count > 0 && pending > 0 && <span className="text-[var(--color-muted)]"> · saving</span>}
          </p>
          {count > 0 && (
            <span className="inline-flex flex-wrap items-center gap-1">
              <Button variant="outline" size="sm" onClick={openReview}>Review</Button>
              <Confirm label="Revert" onConfirm={revertAll} />
            </span>
          )}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 border-0 bg-[var(--color-bg)] data-[side=right]:border-l-0 data-[side=right]:sm:max-w-2xl dark:bg-[var(--color-surface)]">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="section-title">Review</SheetTitle>
            <SheetDescription className={MONO}>Working tree against HEAD, for the files settings writes</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {files === null && <p className={`${MONO} py-4`}>Reading the diff</p>}
            {files?.length === 0 && <p className={`${MONO} py-4`}>Nothing to review</p>}
            {files?.map((f) => (
              <section key={f.file} className="mt-4 first:mt-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-mono text-[0.75rem] text-foreground">{f.file} <span className="text-[var(--color-muted)]">{f.status}</span></h3>
                  <Confirm label={`Revert ${f.file}`} size="xs" onConfirm={() => revertOne(f.file)} />
                </div>
                <Diff text={f.diff} />
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
