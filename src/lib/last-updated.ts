import 'server-only'
import { execSync } from 'child_process'

/* The footer's "Last updated" is the time of the latest commit, read from git at build time.
   Constant for the life of the process, but SiteFooter renders on every page: unmemoized, a
   build spawned 200+ git subprocesses, and the deployed runtime (no .git in the function
   bundle) spawned two FAILING ones per dynamic/404 request. Prod-only so `next dev` keeps
   tracking commits live. */
let cached: number | null = null

export function getLastCommitTimestamp(): number {
  if (process.env.NODE_ENV === 'production') return (cached ??= computeLastCommitTimestamp())
  return computeLastCommitTimestamp()
}

function computeLastCommitTimestamp(): number {
  try {
    const ts = execSync('git log -1 --format=%ct', { encoding: 'utf-8' }).trim()
    if (ts) return parseInt(ts, 10) * 1000
  } catch { /* no git history, or no git at all */ }
  return Date.now()
}
