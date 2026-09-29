import Image from 'next/image'
import { buttonVariants } from '@/components/ui/button'
import { site } from '@/lib/site-config'

/** An ASIN becomes a plain Amazon product link; `publishing.amazonAffiliateTag` in
 *  site.config.ts, when set, rides along as the Associates tag. */
function amazonUrl(asin: string): string {
  const tag = site.publishing.amazonAffiliateTag
  return `https://www.amazon.com/dp/${asin}${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
}

interface ProductCardProps {
  title?: string
  description?: string
  href?: string
  asin?: string
  label?: string
  image?: string
  retired?: boolean
  /** Custom status-strip text — the generalized form of `retired` (which is sugar for
   *  strip="Retired"). E.g. strip="Updated" on an article's post-publication note card. */
  strip?: string
  /** Body content as rich children (markdown links survive from MDX) — for note-style cards
   *  that are a strip plus a sentence, no title/image/link. */
  children?: React.ReactNode
  /** Render the link as a same-tab file download (the anchor download attribute) instead of
   *  navigating: for scripts, skills, and checklists served from /files/. Default label
   *  becomes Download. */
  download?: boolean
}

export function ProductCard({ title, description, href, asin, label, image, retired, strip, children, download }: ProductCardProps) {
  const url = href ?? (asin ? amazonUrl(asin) : undefined)
  const isAmazon = !!asin || (url?.includes('amazon.com') ?? false)
  const displayLabel = label ?? (download ? 'Download' : isAmazon ? 'Amazon' : 'View')

  /* Some products cannot be linked: the Heckler iPhone stand is discontinued and its page is
     gone. A card with a dead "View" pointing at "#" is worse than a card that simply does not
     claim to be clickable, so with no href and no asin this renders as a plain div: no link,
     no label, and none of the hover affordances that would promise one. */
  const Shell = url ? 'a' : 'div'
  // A download keeps the current tab (target=_blank on a download opens a blank tab that
  // immediately closes) and asks the browser to save rather than render the file.
  const shellProps = url
    ? download
      ? { href: url, download: true }
      : { href: url, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    // col-prose: cards sit flush with the text they interrupt (col-content only matches the
    // prose column at xl+, which indented cards ~2 columns between 900-1280px).
    //
    // Spacing is margin-BOTTOM only (no top): grid items don't collapse margins, so a top margin
    // would stack on the preceding paragraph's 40px bottom margin and open a ~80px gap above the
    // card while the gap below was only 40px. With no top margin the preceding element's 40px owns
    // the gap, so above == below. `:has(+ .product-card)` tightens a card to 24px when another card
    // follows, so a run of cards reads as one group. This is the one card style for every page —
    // no page-level overrides.
    // min-w-0: as a flex/grid item the card shrinks with its slot instead of holding
    // its min-content width and clipping (found by the /lab/break-* harnesses).
    // [h2+&]/[h3+&]: directly under a heading the card gets 8px more. A heading's
    // 32px bottom margin is tuned for a paragraph, whose letters start ~6px below
    // its box (half-leading); a bordered card puts its edge right at the 32 and
    // reads cramped by comparison.
    <div className="product-card col-prose min-w-0 mb-8 md:mb-10 [&:has(+_.product-card)]:mb-6 [h2+&]:mt-2 [h3+&]:mt-2">
      <Shell
        {...shellProps}
        className={`group block overflow-hidden border border-[var(--color-border)] ${
          url
            ? 'transition-colors hover:border-[var(--color-muted)] active:border-[var(--color-muted)]'
            : ''
        }`}
      >
        {/* Retired cards wear a status strip across the top — the "address bar" idea from
            /lab/page-cards, repurposed: a sliver of chrome that labels the card before its
            content does. The state belongs to the whole card, not to the title, so it reads
            better as a band than as a pill floating inside the content. */}
        {(strip ?? (retired ? 'Retired' : null)) && (
          // section-label supplies the type treatment (the small, tracked recipe the page
          // subtitle uses), but the color is overridden to the foreground: the strip is a
          // label the eye should catch, not a muted aside. Foreground also sidesteps the
          // dark-mode contrast trap the muted version had (the surface tint lightened the
          // strip and dropped muted text to 4.49:1, under AA) — foreground is max contrast
          // in both themes.
          // uppercase + 0.08em: the strip treatment DKProductCard (the extracted package)
          // canonicalized — caps need the tracking to breathe.
          <div className="section-label uppercase tracking-[0.08em] text-[0.875rem] text-foreground bg-[var(--color-surface-subtle)] pl-4 pr-6 py-2.5">
            {strip ?? 'Retired'}
          </div>
        )}
        {/* Note-style cards (strip + a sentence, no image/title) tuck the body under the strip
            with matching padding, so the sentence left-aligns with the strip label. Product
            cards keep the roomier px-6 frame. */}
        <div className={`flex items-start gap-8 ${!image && !title && children ? 'px-4 pt-3 pb-4' : 'px-6 pb-6 pt-6'}`}>
          {image && (
            // self-stretch instead of a fixed square: the slot keeps its width but its
            // height follows the text column, so the image can never make the card
            // taller than its content (a landscape shot in the old 144px square painted
            // 97px and reserved the rest as air — 2026-08-28). min-h-24 keeps a
            // floor for near-empty cards.
            <div className="relative shrink-0 self-stretch min-h-24 w-24 md:w-36">
              {/* alt="": the visible title names the product inside the same link, so a real
                  alt would read twice. */}
              <Image src={image} alt="" fill sizes="(max-width: 899px) 96px, 144px" className="object-contain object-top" />
            </div>
          )}
          {/* flex-1: the body column takes the row's remaining width, so full-width
              bodies (the Details key/value rows) can actually spread. */}
          <div className="min-w-0 flex-1">
            {title && (
              <p className="font-sans font-medium text-prose text-foreground leading-snug">
                {title}
              </p>
            )}
            {/* Note-style body (strip + a sentence): MDX children arrive as <p>s that would
                otherwise carry the article's 40px paragraph margins inside the card. */}
            {children && (
              // product-card-body: globals.css folds this into the accent-link selector group —
              // MDX children can arrive as BARE inline content (text + <a>, no <p>), which the
              // prose selector `main :is(p, li, …) a` never matches, so the link rendered as
              // plain text.
              // [&_p+p]:mt-3: multi-paragraph note bodies (the TL;DR card) keep their
              // rhythm while a single sentence stays flush.
              <div className="product-card-body font-sans text-prose leading-prose text-foreground [&_p]:m-0 [&_p+p]:mt-3">
                {children}
              </div>
            )}
            {description && (
              <p className="font-sans text-[1.125rem] text-[var(--color-muted)] mt-3">{description}</p>
            )}
            {/* A download is an action, not navigation, so it wears the primary button
                rather than the link underline. The card is already the anchor, so this is
                a styled span: no button nested inside a link. The button darkens only under
                its own hover, not the card's; the card keeps its border change as the
                whole-surface affordance. */}
            {url && download && (
              <p className="mt-5">
                <span className={buttonVariants({ variant: 'default', size: 'xl' })}>
                  {displayLabel}
                </span>
              </p>
            )}
            {url && !download && (
              <p className="font-sans text-[1.125rem] text-[var(--color-accent)] mt-4">
                <span className="underline underline-offset-[3px] decoration-[color-mix(in_oklch,var(--color-accent)_30%,transparent)] group-hover:decoration-[var(--color-accent)] transition-[text-decoration-color]">{displayLabel}</span>
              </p>
            )}
          </div>
        </div>
      </Shell>
    </div>
  )
}
