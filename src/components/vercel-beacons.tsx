'use client'

import dynamic from 'next/dynamic'

// Statically imported into the root layout, both wrapper modules rode the shared
// client chunk on every page. Neither does anything before hydration (the packages
// inject their beacon <script> themselves, post-hydration), so they load the same
// way as the Toaster in providers.tsx: own chunk, off the critical path. The
// process.env.VERCEL gate stays in layout.tsx — it's server-inlined, and this file
// is client code where that env var doesn't exist.
const Analytics = dynamic(() => import('@vercel/analytics/next').then((m) => m.Analytics), { ssr: false })
const SpeedInsights = dynamic(() => import('@vercel/speed-insights/next').then((m) => m.SpeedInsights), { ssr: false })

export function VercelBeacons() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
