import Image from 'next/image'

/* A software list where each row leads with the app's real macOS icon. Authored in MDX as:

     <AppList label="The two-machine rig">
       <App slug="ghostty">[Ghostty](https://ghostty.org) is my terminal.</App>
       <App slug="karabiner keyboard-maestro">[Karabiner](…) and [Keyboard Maestro](…) drive the keypad.</App>
     </AppList>

   The sentence is written normally (the linked app name stays the subject), so the copy reads
   the same as a plain bullet list — the icon is just pinned to the left. `slug` is one or more
   space-separated icon basenames in public/images/apps/_<slug>.png; a row that names two
   apps shows both icons.

   The optional `label` is the group heading, rendered as part of the list so it sits tight to
   its items (the /about pattern): the group carries the space above, the label hugs the list
   below it, instead of a separate bold paragraph floating a full line-height away. */

const ICONS = '/images/apps'
const ICON = 48
const STACK_ROT = 10 // deg — a two-icon row tilts each icon this far, opposite ways
const STACK_OFFSET = 4 // px — and spreads them horizontally, bottoms aligned, so both read clearly

export function AppList({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="col-prose mt-12 first:mt-0">
      {label && (
        <p className="mb-5 font-sans text-prose font-semibold leading-snug text-foreground">{label}</p>
      )}
      <ul className="flex list-none flex-col gap-4 pl-0">{children}</ul>
    </div>
  )
}

export function App({ slug = '', children }: { slug?: string; children: React.ReactNode }) {
  const slugs = slug.split(/\s+/).filter(Boolean)
  return (
    <li className="flex items-center gap-4">
      {/* The icon column is always ONE icon wide (items-center against the whole text block), so
          the text never shifts. A two-icon row (Karabiner + Keyboard Maestro) fans its icons into
          a little overlapping stack inside that same box — each rotated the opposite way — rather
          than stacking tall; the rotated corners spill a few px, which is fine. macOS icons carry
          their own transparent margin, so they need no rounding or ring. */}
      <span
        className="relative block shrink-0"
        style={{ width: ICON, height: ICON }}
        aria-hidden={slugs.length === 0 || undefined}
      >
        {slugs.length === 1 ? (
          <Image src={`${ICONS}/_${slugs[0]}.png`} alt="" width={ICON} height={ICON} />
        ) : (
          slugs.map((s, i) => (
            <Image
              key={s}
              src={`${ICONS}/_${s}.png`}
              alt=""
              width={ICON}
              height={ICON}
              // Anchored to the box bottom and pivoted from bottom-centre, so both icons keep the
              // same baseline while the tops fan apart; left offset spreads them horizontally.
              className="absolute bottom-0"
              style={{
                left: `${(i === 0 ? -1 : 1) * STACK_OFFSET}px`,
                transformOrigin: '50% 100%',
                transform: `rotate(${(i === 0 ? -1 : 1) * STACK_ROT}deg)`,
                zIndex: i,
              }}
            />
          ))
        )}
      </span>
      <span className="font-sans text-prose leading-prose tracking-[-0.01em] text-foreground">
        {children}
      </span>
    </li>
  )
}
