# Typography

How the site's type is set up, why the default typeface is Geist, and how to swap it for
something else without touching the type scale.

## The decision: Geist Sans + Geist Mono

The template ships with **Geist** for everything (navigation, headings, prose, interface text)
and **Geist Mono** for code, metadata, and measured labels. Both are variable fonts covering the
full 100 to 900 weight axis in one file per face, and Geist also ships a true italic.

Why Geist and not the alternatives:

- It is licensed under the SIL Open Font License 1.1, so the files can sit in the repo and
  ship with every clone. The site this template grew out of was set in Söhne, a commercial
  face that cannot be redistributed; the swap to an open face is what makes the template
  publishable at all.
- It is a neo-grotesque with metrics close to the face it replaces (x-height 530 vs 523 per
  1000 units, cap height 710 vs 718, average advance about 5% wider), so the locked type scale,
  leading, and column measures carry over without re-tuning.
- One variable file per face means the browser fetches one upright file for every weight
  the site uses, which is the cheapest possible LCP story: one preloaded ~70KB woff2.
- Geist Mono is a real companion mono, drawn to the same proportions, so sans and mono
  sit on the same line without optical size fudging.

Alternates that were considered, all available on Google Fonts if you want to swap:

| Face | Character | Notes |
| --- | --- | --- |
| Inter | Neutral, the default of the modern web | Very close in spirit; slightly wider and busier at text sizes. Its variable file carries an `opsz` axis worth enabling for display sizes. |
| Instrument Sans | Warmer, a little more personality | Reads well as an editorial body face; the mono pairing is not built in. |
| Schibsted Grotesk | Newspaper grotesque, sturdier | Good for a heavier editorial voice; pairs with any neutral mono. |

Inter was explicitly not chosen as the default: it is the safe choice, and the point of the
template is to look considered out of the box.

## What is in `public/fonts/`

| File | Size | Used by |
| --- | --- | --- |
| `Geist-Variable.woff2` | 70KB | The page. Upright, weight 100 to 900. Preloaded; the only font on the critical path. |
| `Geist-Italic-Variable.woff2` | 73KB | The page. Italic, weight 100 to 900. Loaded on demand the first time an `<em>` renders. |
| `GeistMono-Variable.woff2` | 71KB | The page. Mono, weight 100 to 900. Loaded on demand. |
| `Geist-Medium.ttf` | 128KB | The `/og` image route only. Satori takes no woff2 and no variable axes, so the card reads static instances. |
| `Geist-SemiBold.ttf` | 128KB | The `/og` image route only. |
| `LICENSE-Geist.txt` | | The SIL OFL text. Keep it beside the files; the licence requires it. |

The site's scale uses weights 400, 500, and 600 only (no 700; the audit that removed the last
`font-bold` is noted in `src/app/layout.tsx`). The variable file carries the rest, but nothing
asks for them.

## Where the typeface is wired up

Four places, in this order. Nothing else names the font.

1. **`public/fonts/`**: the files above.
2. **`src/app/layout.tsx`**, the three `localFont` blocks at the top of the file:

   ```ts
   const geistBody = localFont({
     src: '../../public/fonts/Geist-Variable.woff2',
     weight: '100 900',
     style: 'normal',
     variable: '--font-sans-trigger',
     display: 'swap',
     adjustFontFallback: false,
     declarations: [{ prop: 'font-family', value: "'Geist'" }],
   })
   ```

   plus `geistItalic` (same shape, `style: 'italic'`, `preload: false`, `display: 'fallback'`)
   and `geistMono` (`GeistMono-Variable.woff2`, family `'Geist Mono'`, `preload: false`). The
   `declarations` entry pins a stable family name so the upright and italic files join one
   family and the browser picks weight and style itself. `adjustFontFallback: false` stays off
   because the site sets `display: 'swap'` deliberately and the fallback metrics would fight
   the fluid scale. The three `.variable` class names are joined on `<html>` further down the
   same file.
3. **`src/app/globals.css`**, the two tokens in `@theme`:

   ```css
   --font-sans: 'Geist', system-ui, sans-serif;
   --font-mono: 'Geist Mono', ui-monospace, 'Courier New', monospace;
   ```

   These names must match the `declarations` values in `layout.tsx`. Tailwind's `font-sans`
   and `font-mono` utilities, and every recipe class (`page-title`, `section-label`, and so on),
   read from these tokens.
4. **`src/app/og/route.tsx`**: the hoisted `FONTS` promise reads the two static ttf files, and
   the `fonts` array passed to `ImageResponse` names them `'Geist'` at weights 500 and 600.

## How to swap the face

1. Put the new files in `public/fonts/`. Prefer one variable woff2 per face (upright, italic if
   the family has one, mono). For the OG route you also need a static ttf or otf at the two
   weights the card uses (500 and 600); Satori rejects woff2 and ignores variable axes. If the
   family is on Google Fonts, the static ttf instances are in the download zip.
2. Edit the three `localFont` blocks in `src/app/layout.tsx`: the `src` paths, the `weight`
   range (or a fixed weight per file for a static family, in which case `src` becomes an array
   with one entry per file and weight), and the two `declarations` family names. Keep the
   preload strategy as it is: one preloaded upright body face with `display: 'swap'`, everything
   else `preload: false`.
3. Change the two tokens in `globals.css` to the new family names.
4. Point `src/app/og/route.tsx` at the new ttf pair and rename the `fonts` entries.
5. Delete the old files and their licence, and add the new licence file beside the fonts.
6. Remeasure the two metric-dependent values in `globals.css` that are tied to glyph widths:
   the `.hang-dq` / `.hang-sq` text-indents (the advance width of the curly quotes in the new
   face; the comment above them says how they were read) and, if the mono changed, the
   `.font-mono { word-spacing }` compensation (the mono space cell minus the sans space). The
   CPL note above the 120rem prose breakpoint is a comment only; it does not need editing but
   a much wider or narrower face may justify moving that breakpoint.
7. Update the copy that names the face: the colophon line in
   `src/lib/markdown-pages.ts`, and the About page's colophon list.

Then `rm -rf .next` before `next dev`: Turbopack has served stale `@font-face` rules after a
font swap.

## Licence

Geist is Copyright (c) 2023 Vercel, in collaboration with basement.studio, and is released under
the SIL Open Font License, Version 1.1. The full text is in `public/fonts/LICENSE-Geist.txt`.
The OFL allows bundling, embedding, and redistribution as long as the licence travels with the
files and the fonts are not sold on their own. Any face you swap in must be clearable the same
way: if a family cannot be committed to a public repo, it cannot be the template's default.

## The scale is the design system, not the face

The fluid `clamp()` type scale in `globals.css` (`--text-prose`, `--text-entry-title`,
`--text-h2`, `--text-title`, `--text-listing-title`, each anchored 375px to 1440px, plus the
static `--text-label`) is locked. It, together with the line-heights, the negative
tracking that tightens as size grows, and the 12-column grid, is what makes the site look like
itself. Changing the typeface does not change any of those numbers. If a new face reads a
touch large or small against the old one, the correct response is to accept it or to pick a
face with closer metrics, not to edit the scale. The only values that legitimately move with
the face are the glyph-width compensations listed in step 6 above.
