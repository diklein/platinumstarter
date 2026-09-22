/**
 * THE SITE'S MOTION TOKENS. One place, so everything that springs feels like the same object.
 *
 * A spring has exactly two perceptual knobs, and they are independent:
 *
 *   ζ (damping ratio)      = how much it OVERSHOOTS.  ζ = damping / (2·√(stiffness·mass))
 *   ωₙ (natural frequency) = how FAST it moves.       ωₙ = √(stiffness / mass)
 *
 * Overshoot is a PERCENTAGE of the distance travelled, so a single ζ gives a proportionate settle
 * whether the thing moves 8px or 800px. That is why one spring can be shared across a sheet, a
 * lightbox and a slide track without retuning per component.
 *
 * The house spring is ζ ≈ 0.86, ωₙ ≈ 30: about half a percent of overshoot, settled in ~150ms. It
 * is deliberately the quiet end of "springy" — present, not gratuitous (Emil Kowalski's phrase, and
 * the rule this site follows). These were the lightbox's left/right nav values, which were the ones
 * that felt right; everything else has been brought to them.
 *
 * Before this existed there were four hand-tuned springs across the codebase with ωₙ from 17 to 30,
 * so the mobile Contents sheet visibly lagged the lightbox even though both were "a spring".
 */

/** The house settle. Everything that springs uses this unless it has a stated reason not to. */
export const SPRING = { type: 'spring', stiffness: 620, damping: 36, mass: 0.7 } as const
/**
 * prefers-reduced-motion. The MOVE is kept — it carries spatial meaning, telling you where the
 * thing came from — but the decorative overshoot is removed. Critically damped: it arrives and
 * stops.
 */
export const SPRING_REDUCED = { type: 'spring', stiffness: 300, damping: 40, mass: 1 } as const

/** Shift-click / shift-arrow debug: the same character stretched to ~3s for frame-by-frame work. */
export const SPRING_SLOW = { type: 'spring', duration: 3, bounce: 0.2 } as const

/**
 * The CSS STAND-IN lives in globals.css, not here: `--ease-spring` / `--duration-spring` (and
 * `--ease-exit` / `--duration-exit`). It exists for enter/exit that a CSS transition owns rather
 * than motion — currently the ⌘K palette, whose open/close Base UI drives through
 * data-starting-style / data-ending-style.
 *
 * A cubic-bézier is not a spring and cannot take the same numbers. It is the closest the platform
 * can get to this feel, and it is a token so it changes alongside these values instead of drifting.
 */
