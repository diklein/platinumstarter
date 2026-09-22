/* Museum exhibits for the icon-reset post: the ACTUAL pre-reset drawings, resurrected
   from git history so the duplication can be seen, not just described. These inline SVGs
   are deliberate exceptions to the "utility icons are always lucide imports" rule — they
   are preserved specimens of deleted code, not product icons. Server component, zero JS. */
import { X, Search, Sun, Command } from 'lucide-react'

const LABEL = 'font-sans text-base text-foreground'

/* Shared two-column table for exhibits: fixed label + icon column widths so the icon
   columns align vertically ACROSS exhibits, not just within one. Icon column is 3rem to
   fit the 48px overlay specimens; smaller glyphs center inside it. */
const TABLE = 'grid grid-cols-[12rem_3rem] items-center gap-x-8 gap-y-3'

function Exhibit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-sans text-prose font-medium text-foreground">{title}</span>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-6">{children}</div>
    </div>
  )
}

export function IconChaosDemo() {
  return (
    <figure className="col-prose my-14 flex w-full flex-col gap-16 border border-[var(--color-border)] px-6 py-5 sm:px-8 sm:py-7">
      {/* Every close button the site shipped simultaneously, at its as-shipped size and
          stroke. Five different drawings of the same two lines, laid out as a
          label/specimen table. */}
      <Exhibit title="Every way this site said “close”">
        <div className={TABLE}>
          <span className={LABEL}>Lightbox</span>
          <span className="flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
          </span>
          <span className={LABEL}>Mobile table of contents</span>
          <span className="flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
          </span>
          <span className={LABEL}>Collection “sold”</span>
          <span className="flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M3 3L12 12M12 3L3 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
          </span>
          <span className={LABEL}>Mobile menu close</span>
          <span className="flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" transform="rotate(45 12 12)" /><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" transform="rotate(-45 12 12)" /></svg>
          </span>
          <span className={LABEL}>Search palette</span>
          <span className="flex items-center justify-center">
            <X size={14} aria-hidden />
          </span>
          {/* The punchline row: same ink as the specimens, highlighted by the row itself.
              A col-span wrapper re-creates the two columns (w-40 + ml-8 + w-12 mirror the
              grid) so the highlight can span the row while alignment holds. Left-padded
              only: the icon cell's centering slack already leaves ~13px after the X, so
              the highlight's right edge stops at the grid edge to match the 12px left. */}
          <span className="col-span-2 -ml-3 flex items-center bg-foreground/5 py-1.5 pl-3">
            <span className={`${LABEL} w-48`}>Newly perfected</span>
            <span className="ml-8 flex w-12 items-center justify-center">
              <X size={22} aria-hidden />
            </span>
          </span>
        </div>
      </Exhibit>

      {/* The drift, superimposed: the hand-drawn glyph in muted ink, lucide in red, same
          box. Close enough to feel identical, different enough to never align. */}
      <Exhibit title="Custom icons overlaid on lucide icons">
        <div className={TABLE}>
          {/* Stacking order: lucide in red underneath, the hand-drawn glyph in ink on top,
              so the drift reads as dark lines against the red original. */}
          <span className={LABEL}>Header search</span>
          <span className="relative inline-flex h-12 w-12">
            <Search size={48} strokeWidth={2} className="absolute inset-0 text-[var(--color-accent)]/70" aria-hidden />
            <svg className="absolute inset-0 text-[var(--color-muted)]" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
          </span>
          <span className={LABEL}>Theme sun</span>
          <span className="relative inline-flex h-12 w-12">
            <Sun size={48} strokeWidth={2} className="absolute inset-0 text-[var(--color-accent)]/70" aria-hidden />
            <svg className="absolute inset-0 text-[var(--color-muted)]" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          </span>
        </div>
      </Exhibit>

      {/* Character-for-character the same ⌘ path data, shipped from three different files
          at three sizes and two stroke widths. */}
      <Exhibit title="One ⌘ path across three files">
        {/* Every icon cell is h-11 (the 44px specimen's height) so all three rows are the
            same height and the rows sit on an even rhythm despite the wild size spread. */}
        <div className={TABLE}>
          <span className={LABEL}>Keycap</span>
          <span className="flex h-11 items-center justify-center">
            <Command size={11} strokeWidth={2.5} aria-hidden />
          </span>
          <span className={LABEL}>Design system</span>
          <span className="flex h-11 items-center justify-center">
            <Command size={19} strokeWidth={2} aria-hidden />
          </span>
          <span className={LABEL}>Design details</span>
          <span className="flex h-11 items-center justify-center">
            <Command size={44} strokeWidth={2.5} aria-hidden />
          </span>
        </div>
      </Exhibit>
    </figure>
  )
}
