/* The three icon families, rendered live for the icon-reset post. Server component on
   purpose: every glyph here is static SVG, so the demo ships zero client JS. The utility
   row IS the lucide components the site imports, not copies, so this demo can never
   drift from what actually renders. */
import { Children } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Command,
  Copy,
  CornerDownRight,
  Download,
  Globe,
  Heart,
  Moon,
  RotateCcw,
  Search,
  SquareTerminal,
  Sun,
  X,
} from 'lucide-react'
import {
  IconInstagram,
  IconLinkedIn,
  IconThreads,
  IconBluesky,
  IconX,
  IconButtondown,
  IconUnsplash,
  IconYouTube,
  IconGitHub,
  IconRss,
} from '@/components/social-icons'

/* `nudge` corrects the gap above a section to be optically 64px: the flex gap is box-to-box,
   but each family's icons carry different air inside their boxes, so the measured ink-to-label distances needed per-section trims
   (measured on the live page at gap-16 with 21px labels: 69.0px and 71.7px un-nudged). */
function FamilyRow({ label, nudge, children }: { label: string; nudge?: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3" style={nudge ? { marginTop: nudge } : undefined}>
      <span className="font-sans text-prose font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function IconStrip({ children, cell }: { children: React.ReactNode; cell?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-5 text-foreground">
      {cell
        ? Children.map(children, (child) => (
            <span
              className="inline-flex shrink-0 items-center justify-center"
              style={{ width: cell, height: cell }}
            >
              {child}
            </span>
          ))
        : children}
    </div>
  )
}

export function IconFamiliesDemo() {
  return (
    <figure className="col-prose my-14 flex w-full flex-col gap-16 border border-[var(--color-border)] px-6 py-4 sm:px-8 sm:py-6">
      <FamilyRow label="Social">
        <IconStrip>
          <IconInstagram size={19} />
          <IconLinkedIn size={17} />
          <IconThreads size={19} />
          <IconBluesky size={18} />
          <IconX size={17} />
          <IconButtondown size={17} />
          <IconUnsplash size={16} />
          <IconYouTube size={18} />
          <IconGitHub size={18} />
          <IconRss size={16} />
        </IconStrip>
      </FamilyRow>
      {/* Two deliberate rows: the icons product UI reaches for, then the ones that only
          appear on reference pages.
          Per-glyph optical sizes, matching /design-system's iconography row where a value
          exists there (Search 20, X 22, Sun 19, Moon 20, chevrons 25, Command 19): full
          20-unit-keyline glyphs sit at 19-20, compact marks (x, check, chevrons, arrows)
          get larger boxes so the strip reads as one optical size. */}
      <FamilyRow label="Utility" nudge={-14}>
        <div className="flex flex-col gap-4">
          {/* cell=26 (the largest optical, the 25px chevrons, plus air): every glyph
              centers in an equal box, so the two rows share one column grid. */}
          <IconStrip cell={26}>
            <Search size={20} />
            <X size={22} />
            <Copy size={20} />
            <Download size={20} />
            <RotateCcw size={20} />
            <Heart size={20} />
            <Check size={22} />
            <CircleDashed size={20} />
            <Command size={19} />
          </IconStrip>
          <IconStrip cell={26}>
            <ChevronLeft size={25} />
            <ChevronRight size={25} />
            <Sun size={19} />
            <Moon size={20} />
            <CornerDownRight size={22} />
            <SquareTerminal size={19} />
            <Globe size={19} />
            <ArrowRight size={23} />
          </IconStrip>
        </div>
      </FamilyRow>
    </figure>
  )
}
