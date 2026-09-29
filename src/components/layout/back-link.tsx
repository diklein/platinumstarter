import Link from 'next/link'

/** "← Label" back link in the subtle-link style, matching the one on blog post pages.
 *  Drop into a PageShell's `eyebrow` slot to give a sub-page a way back to where it's
 *  linked from. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="link-subtle font-sans text-label">
      <span aria-hidden="true" className="mr-1 inline-block">←</span>{label}
    </Link>
  )
}
