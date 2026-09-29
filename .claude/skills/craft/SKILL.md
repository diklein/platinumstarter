---
name: craft
description: The design rules this site is built on, distilled into a checklist for building or reviewing any UI on it. Use when adding or changing a component, page, or style, when asked to "review the design", "does this look right", "make it feel finished", "polish this", or before publishing anything visual. Not for content or copy edits alone; those are the new-post and edit-post skills.
---

# Craft

Four commitments explain most visual decisions on this site. Everything below is one of them
applied. When a change breaks one, the change is wrong, not the rule.

1. **One typeface.** One sans family everywhere, at weight 400 first, with one mono for code.
2. **One accent.** A single accent color carries every link, hover, selection, focus, and error.
3. **Twelve columns.** Every page shares one grid and one centred reading band.
4. **Quiet motion.** Short, eased, interruptible, and respectful of reduced motion.

The values live in `src/app/globals.css` (tokens and named recipes) and `site.config.ts`
(the owner's font and accent). Use the recipes; never re-type the utility strings they replace.

## Before you add anything

- Does an existing recipe cover it? `page-title`, `section-title`, `section-label`,
  `accent-link`, `link-accent-hover`, `link-subtle`, `col-content` / `col-prose` /
  `col-media` / `col-portrait`, `accent-focus-ring`, `tap-press`, `img-outline`,
  `shadow-command`, `shadow-elevated`, `footnote-list`. If yes, use it. If the recipe is
  nearly right, extend it in `globals.css` so every caller benefits; a one-off override in a
  component is the wrong place.
- Does a primitive cover it? Buttons, badges, inputs, the toggle, the palette, the toast
  are shadcn-style on Base UI. Reuse before building.
- Is it a new page? Use the `new-page` skill: `PageShell` plus a sibling `layout.tsx`.

## Typography

- One family. Headings and hero at weight 400; section h2 at 500; bold only for inline
  emphasis and small labels. No second display face.
- Sizes are the fluid tokens (`--text-title`, `--text-h2`, `--text-prose`, `--text-label`),
  never ad hoc pixel sizes. Display tracking is computed from the rendered size; do not add
  `tracking-*` to a heading that already uses a recipe.
- Headings balance their line breaks; running text avoids orphans (`text-wrap` is set
  globally). Opening quotes hang into the margin where the browser allows it.
- Numbers in a sentence stay proportional. `tabular-nums` only for values that change in
  place (timers, counters, prices) and for numeric table columns. Never switch to the mono
  face just to align digits.
- A keyboard key is the `Kbd` recipe; the command glyph is the SVG, never the font's glyph.

## Color

- Six roles plus three support tokens (`--color-bg`, `--color-fg`, `--color-muted`,
  `--color-border`, `--color-surface`, `--color-accent`, and their derived siblings). New
  color is a new token with both theme values, or it does not exist. No hex in components.
- The accent is for interaction: links, hovers, selection, focus, errors. Decoration
  (rules, dividers, hanging bars) wears foreground or border, never the accent.
- Dark mode swaps the same variables under `.dark`. Components restyle themselves; there are
  no dedicated dark variants. Any surface with a hard-coded light value is a bug.
- The root `<html>` is painted in both themes and `theme-color` carries the same values, so
  overscroll and browser chrome never flash the wrong ground. Change both together.
- Images with a pale or dark edge get `img-outline`: a 1px inset outline at 10% opacity,
  never a `border`, so layout does not shift.

## Layout

- Twelve columns, 24px gutters, the reading band centred and narrowing as the viewport
  grows. Place blocks with the `col-*` classes; never inline a `col-start` string.
- Two custom breakpoints: `md` at 900px (landscape phones keep the mobile layout) and
  `wide` at 1728px. Test at 390, 900, 1440.
- Spacing is Tailwind's 4px scale, no custom tokens. Article rhythm comes from a few large
  fixed margins; `:has()` rules zero whatever precedes a heading so one margin owns each gap.
  Do not add margin to a block to fix a gap; find the rule that owns it.
- Corners are square. The interactive pair (buttons and text inputs) rounds to `lg`, with
  the small sizes tighter. Cards, panels, and floating surfaces keep square corners.
- Floating surfaces (palette, popovers, toasts, menus) separate on shadow, not border:
  `shadow-command` in light, the lifted surface plane in dark, never a 1px ring. Windows
  High Contrast gets a `CanvasText` border via `forced-colors`, already in the recipes.

## Motion

- Three easing tokens (`--ease-out`, `--ease-in-out`, `--ease-drawer`) and one house spring
  (`SPRING` in `src/lib/motion.ts`, about half a percent of overshoot, done in ~150ms).
  `SPRING_SETTLE` is its critically damped sibling for things that appear without a gesture
  behind them; overshoot is earned by momentum.
- Frequency decides what may animate. A hover is the most frequent thing a cursor does, so
  hover states change instantly, no transition. A press lands instantly too (`tap-press`).
  Animation is for the rare moments: a dialog opening, a theme change, a lightbox.
- Enter/exit that a primitive owns as a CSS transition uses `--ease-spring` /
  `--duration-spring` and `--ease-exit` / `--duration-exit`, so JS and CSS motion share one
  personality.
- Nothing loops forever on a reading page. Everything honours `prefers-reduced-motion`.
- Animate `transform` and `opacity` only. Layout properties never animate.

## Interface

- One keyboard focus treatment: the 2px accent outline with a soft halo (`accent-focus-ring`).
  Inputs get the softer warmed border and halo instead of a hard outline.
- Hit areas are at least 44px tall; extend them with an invisible pseudo-element, not padding
  that changes the layout.
- Icons come from one utility family (lucide), always the component, never a redrawn copy.
  Optical centring is per icon: nudge with a 1px translate when the blur test says so.
- Five states cover every control: default, disabled, loading, empty, error. An empty state
  or error reads like a note from a person, not a system.
- No modal, tooltip, or menu opens on hover alone. Tooltips wait 400ms the first time, then
  follow the cursor instantly while intent is shown.

## Copy in the interface

- Sentence case. Short and specific. First person when the site speaks.
- No em dashes or en dashes anywhere in site copy: use a colon, a comma, a parenthesis, or
  two sentences. The metadata helper enforces this for titles; you enforce it everywhere else.
- Labels have no trailing colons. Buttons say what they do ("Copy URL"), not "OK".
- Dates and counts are real values from the repo, never placeholders.

## Performance is design

- 100 Lighthouse across all four categories is the floor. A pattern that costs performance is
  rejected however good it looks.
- Every image goes through `next/image` with a real `sizes`. Every video declares its aspect
  ratio so the box holds before metadata arrives.
- The site builds from repo files only. Anything fetched from an API is snapshotted into the
  repo by a script or an Action; the build never waits on a network.
- Client components are the exception, isolated in their own files. `mdx-components.tsx`
  is server-only.

## Review checklist

Run this on any visual diff before calling it done.

- Recipes used, not re-typed; no new hex; no inline column strings.
- Renders correctly in light and dark, at 390 and 1440, with reduced motion on.
- Hover is instant; press is instant; anything longer than 250ms is a rare event.
- Keyboard: every control reachable, the focus ring visible, order sensible.
- Copy: sentence case, no dashes, no trailing colons, no lorem.
- `npx tsc --noEmit -p tsconfig.json` and `node scripts/check-conventions.mjs` pass.
- Lighthouse still 100 on the changed page (`npm run build` before shipping, never while
  `next dev` holds port 3000).
