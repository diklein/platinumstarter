/* Skill cards for posts about agent skills — DKProductCard's shell without the image
 * column: the same hairline frame, px-6 body, sans-medium title, muted description,
 * and the accent link whose soft underline strengthens on hover.
 * Placed at the top of each skill's discussion; data-in-props like ProductCard. */

function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group text-[var(--color-accent)] no-underline">
      <span className="underline underline-offset-[3px] decoration-[color-mix(in_oklch,var(--color-accent)_30%,transparent)] group-hover:decoration-[var(--color-accent)] transition-[text-decoration-color]">
        {label}
      </span>
    </a>
  )
}

interface SkillCardProps {
  /** The skill's name as invoked, e.g. "react-best-practices". */
  name: string
  /** Who wrote it. */
  creator: string
  /** The skill's home page (ui-skills.com, aiforui.dev, a repo file…). */
  href: string
  /** Source repository, when one is public. */
  repo?: string
  /** One line of what it does. */
  note?: string
}

export function SkillCard({ name, creator, href, repo, note }: SkillCardProps) {
  // Label the primary link by its host ("ui-skills.com", "aiforui.dev") the way
  // ProductCard labels its link by retailer; GitHub links just say GitHub.
  const host = new URL(href).hostname.replace(/^www\./, '')
  return (
    // Same rhythm rules as .product-card: 32/40px below, tightened to 24px when
    // another card follows so a run reads as one group.
    <div className="skill-card col-prose min-w-0 mb-8 md:mb-10 [&:has(+_.skill-card)]:mb-6">
      <div className="overflow-hidden border border-[var(--color-border)] px-6 pb-6 pt-6">
        <p className="font-sans font-medium text-prose text-foreground leading-snug">{name}</p>
        <p className="font-sans text-[1.125rem] text-[var(--color-muted)] mt-3">
          {note ? <>{note} </> : null}by {creator}
        </p>
        <p className="font-sans text-[1.125rem] mt-4 flex flex-wrap gap-x-6">
          <CardLink href={href} label={host === 'github.com' ? 'GitHub' : host} />
          {repo && <CardLink href={repo} label="GitHub" />}
        </p>
      </div>
    </div>
  )
}
