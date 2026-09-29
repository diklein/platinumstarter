'use client'

import { useSyncExternalStore } from 'react'
import { timeAgo } from '@/lib/time'

// Client-only: relative time can't be server-rendered without a hydration mismatch (the
// same reason the label was mount-gated when it lived in the header). The server snapshot
// is null so the separator dot never dangles alone after the version number; the first
// client render reads the real label (no mount effect, one render fewer).
// Non-breaking spaces: the spec is two spaces around the dot, and HTML would collapse
// literal ones.
const emptySubscribe = () => () => {}

// `separator`: the leading dot belongs between the version and this label; when the footer
// hides the version (site.footer.version = false) the label opens the line and gets none.
export function FooterLastUpdated({ timestamp, separator = true }: { timestamp: number; separator?: boolean }) {
  const label = useSyncExternalStore(emptySubscribe, () => timeAgo(timestamp), () => null)
  if (!label) return null
  return (
    <>
      {separator ? '  ·  ' : null}
      <span>Last updated {label}</span>
    </>
  )
}
