---
name: brand
description: Change how the site looks as a brand: its mark (logo), its favicon and home-screen icons, the accent color, the browser theme color, the icon tile, and the short name under the home-screen icon. Use when the user says "change my favicon", "use my logo", "here's my logo", "make this the icon", "change the site icon", "my brand color", "change the accent", "theme color", or drops an SVG and asks for it to be the site's mark or icon. During first-run setup, the setup skill's brand step hands off here.
---

# Brand

The brand is five fields in `site.config.ts` plus one set of generated files. Everything the
site draws for itself (the header mark, the browser tab, the iPhone and Android home screens,
the install icon, the feed image, the mark download) comes from ONE SVG, so a logo change is
one command. Taste knobs beyond these (type, spacing, motion) are the design system, not
brand settings; say so if asked.

| Field | What it is |
|---|---|
| `brand.mark` | The header mark: `'starter'` (the template's own), `'wordmark'` (the name as text, no drawing), or a path under `public/` such as `'/brand/mark.svg'` |
| `brand.iconBackground` | The opaque square behind the home-screen and install icons, a hex color |
| `brand.accent` | The one accent color (links, hovers, focus, errors), any CSS color |
| `brand.themeColor.light` / `.dark` | The browser toolbar tint per theme (Chrome and installed apps; Safari 26 tints from the page itself) |
| `identity.shortName` | The label under the home-screen icon, 12 characters or fewer; absent = the name's first word |

## A logo or icon

The owner gives a file (a path, a drag into the chat, or "it's on my desktop"):

1. **It must be an SVG.** Every icon size is drawn from the vector. A PNG or JPG: say so plainly and ask for an SVG export from their design tool (Figma: select the frame, Export, SVG; Illustrator: Save As SVG with text converted to outlines). Do not trace or convert a raster yourself.
2. Run it: `npm run icons -- <path to the svg>`. Add `--background "#hex"` when they named a tile color or the logo is light and needs a dark tile.
   - It checks the SVG (no scripts, no links to outside files, no live text), copies it to `public/brand/mark.svg`, sets `brand.mark: '/brand/mark.svg'`, and writes every icon file. The mark and the icon are always the same drawing; that is the design, not an option.
   - A refusal comes back as one sentence (for example, live text: "convert the text to outlines"). Relay it in plain words and what to do in their design tool. Never edit their SVG to get past the check.
3. Verify (below), then name what changed: the header mark, the tab icon, the home-screen icon. Point them at `http://localhost:3000` and say a hard refresh may be needed for the tab icon (browsers hold favicons hard).
4. Suggest a tile color only if the logo has a light or transparent edge that would vanish on the default light grey tile.

Other cases:
- **"Go back to the Platinum mark"**: set `brand.mark: 'starter'`, then `npm run icons` with no file.
- **Tile color only**: `npm run icons -- --background "#hex"` (no file) redraws the set from the current mark.
- **"No logo, just my name"**: `brand.mark: 'wordmark'`. The icons keep whatever they were last drawn from (a wordmark has no drawing), so say that and offer to make an icon from an SVG whenever they have one.
- **The /settings Brand section** does the same with an upload; whichever ran last wins, so read `site.config.ts` before writing.

## Colors

- **Accent**: `brand.accent`, as they gave it (hex is fine; the design system derives the rest). Check the result on a link in both themes; a very light accent fails contrast on white, so say so instead of silently darkening it.
- **Theme color**: `brand.themeColor.light` and `.dark`. Leave them at the defaults unless asked; they match the page grounds.

## Verify

- `npx tsc --noEmit -p tsconfig.json` and `node scripts/check-conventions.mjs` pass.
- With the dev server running, the home page's `<head>` has `<link rel="icon" … sizes="32x32">` (favicon.ico), `<link rel="icon" … image/svg+xml>` (icon.svg), and `<link rel="apple-touch-icon">`; `/manifest.webmanifest` lists `icon-192.png`, `icon-512.png`, and the maskable icon.
- The generated files are committed with the config, never generated at build time: `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`, and under `public/`: `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `feed-icon.png`, `logo.svg`, `logo.png`, and `brand/mark.svg` when they uploaded one. The `publish` skill ships them.

## Never

- Never hand-edit the generated icon files or write a new favicon by hand; run `npm run icons`.
- Never add `metadata.icons` to the layout: the files in `src/app` are Next's icon conventions and link themselves.
- Never put a logo that is not theirs (a stock icon, a lookalike of a known brand) in without them saying so.
