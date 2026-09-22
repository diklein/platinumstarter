import { getGitHubContributions } from '@/lib/github'
import { ContribGrid } from './contrib-grid'

export async function GitHubCalendar({ className }: { className?: string }) {
  const calendar = await getGitHubContributions()
  if (!calendar) return null

  const { weeks, totalContributions } = calendar

  return (
    <div className={`border border-[var(--color-border)] overflow-hidden${className ? ` ${className}` : ''}`}>
      <p className="px-6 pt-5 pb-4 font-sans font-medium text-prose text-foreground">
        {totalContributions.toLocaleString('en-US')} contributions in the last year
      </p>
      <div className="px-6 pb-5">
        {/* Each of ~365 cells carries only x/y + a level class + two short data attrs —
            width/height/rx and the level fills live in CSS (.contrib-cal in globals.css).
            The grid is a client component for the instant custom tooltip; the old SVG
            <title> path (system tooltip, seconds of delay) is gone with it, which also
            retires the React 19 single-string-child hydration footgun documented here. */}
        <ContribGrid weeks={weeks} total={totalContributions} />
      </div>
    </div>
  )
}
