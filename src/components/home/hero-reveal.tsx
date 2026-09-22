import { Fragment } from 'react'
import { site } from '@/lib/site-config'

// The statement is `identity.intro` from site.config.ts (it falls back to the tagline). The
// punchline is the tagline, shown only when the intro is its own sentence, so a site that
// sets nothing but a tagline reads it once, not twice.
const MAIN = site.identity.intro
const PUNCH = site.identity.intro === site.identity.tagline ? null : site.identity.tagline

/** The landing statement resolves word-by-word on load — each word rises and de-blurs on a
 *  tight stagger (Concept A from /lab/hero). A SERVER component animated in pure CSS
 *  (`.hero-word` in globals.css): the previous motion version was a client component that
 *  server-rendered every word at opacity 0, so the LCP text stayed invisible until React
 *  hydrated (~the whole JS bundle later). CSS animations start at style time — the first
 *  word paints with the first frame. Real space text nodes sit between the inline-block
 *  words so spacing + wrapping stay natural; "Every pixel counts." animates as one nowrap
 *  unit so it never breaks apart. Reduced motion is honored in CSS, and with animations
 *  unavailable the text is simply visible — it's in the DOM for SEO/AT regardless.
 *  The animation only runs at md+ — on phones this paragraph is the LCP element and the
 *  reveal's final paint cost ~2.5s of mobile LCP (see .hero-word in globals). */
export function HeroReveal() {
  const mainWords = MAIN.split(' ')

  return (
    <p style={{ marginLeft: '-4px' }} className="font-sans text-[length:var(--hero-text)] leading-[1.1] tracking-[var(--tracking-hero)] text-foreground">
      {mainWords.map((w, i) => (
        <Fragment key={i}>
          <span className="hero-word inline-block" style={{ animationDelay: `${(i * 0.028).toFixed(3)}s` }}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
      {/* The punchline holds a 0.7s beat after the last main word begins, so the statement
          lands before it appears (1s read as a touch too long). It is its own line: inline, the
          paragraph's text-wrap: pretty treated it as the last line's tail and pulled the
          statement's final word down to keep it company. */}
      {PUNCH && (
        <span
          className="hero-word block whitespace-nowrap text-[var(--color-muted)]"
          style={{ animationDelay: `${((mainWords.length + 1) * 0.028 + 0.7).toFixed(3)}s` }}
        >
          {PUNCH}
        </span>
      )}
    </p>
  )
}
