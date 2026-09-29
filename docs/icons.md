# Icons and site settings for the browser

The site draws every icon it needs from one SVG, the header mark. `npm run icons` writes the
set; the Brand section of `/settings` and the `brand` skill run the same code
(`src/lib/icons.ts`). The files are committed like any other asset: nothing is generated at
build time.

```sh
npm run icons                                  # rebuild from the current mark (brand.mark)
npm run icons -- logo.svg                      # make logo.svg the mark AND the icon
npm run icons -- logo.svg --background "#101418"   # on a tile of that color
```

## The set

The 2026 minimum is six files ([Evil Martians, How to Favicon, updated January 2026](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs)); the
site adds three it uses itself.

| File | Size | For |
|---|---|---|
| `src/app/favicon.ico` | 32 and 16 | Browsers that do not read SVG icons, and anything that asks for `/favicon.ico` blind |
| `src/app/icon.svg` | vector | The tab icon in every current browser; carries its own dark-mode rule |
| `src/app/apple-icon.png` | 180, opaque tile | iOS home screen (iOS paints transparency black) |
| `public/icon-192.png`, `public/icon-512.png` | on the tile | The web app manifest: Android home screen, install, splash |
| `public/icon-maskable-512.png` | 512, art inside the 40% safe circle | The manifest's `purpose: "maskable"` icon, cropped to any shape by Android |
| `public/apple-touch-icon.png` | 180 | The same iOS icon at the root URL that iOS and Google probe without reading the page |
| `public/feed-icon.png` | 144 | The RSS channel image |
| `public/logo.svg`, `public/logo.png` | vector, 512 | The mark downloads (right-click the header mark, or the palette) |

The files in `src/app` are Next's icon conventions: they link themselves with content-hashed
URLs, so a new icon is never stuck behind a cache. That is why the layout has no
`metadata.icons`. The ICO is declared `sizes="32x32"`, never `any`, so Chrome keeps the SVG.

Obsolete and not shipped: 16 and 32 pixel PNGs, `android-chrome-*` names, `mask-icon`
(Safari pinned tabs), `msapplication-*` tiles and `browserconfig.xml`, and multiple
apple-touch-icon sizes. Google Search dropped its multiple-of-48 rule in 2024; it wants a
square, crawlable icon linked from the home page, and SVG is not one of its formats, so the
180 PNG is what search results show ([Google Search Central](https://developers.google.com/search/docs/appearance/favicon-in-search)).

## What the SVG must be

Checked before anything is written, and refused with one sentence if not:

- An SVG (every size is drawn from the vector; PNGs and JPGs are refused, never traced).
- No scripts, event handlers, `foreignObject`, embedded media, or links to outside files: it is
  served from the site's own origin.
- No live text. The renderer has no fonts, so text becomes the fallback face or nothing;
  convert it to outlines in the design tool.
- Under 512 KB.

`currentColor` is honored: the tab icon gets the page's ink in light mode and the light ink in
dark mode. The PNG icons are the light cut (no renderer honors a dark-mode media rule).
Square art with a little room inside its edges looks best; the icons add their own padding.

## The other browser-facing settings

Set in `site.config.ts` (and in `/settings`):

| Field | Default | Does |
|---|---|---|
| `identity.shortName` | the name's first word, 12 characters | The label under the home-screen icon (manifest `short_name`, iOS title) |
| `brand.themeColor.light` / `.dark` | `#ffffff` / `#26272f` | `<meta name="theme-color">` per scheme: Chrome's toolbar and installed apps. Safari 26 ignores it and tints from the page's own ground |
| `brand.iconBackground` | `#e8ecef` | The opaque tile behind the home-screen and install icons |
| `publishing.hideFromSearch` | `false` | Every page carries `noindex`; robots.txt drops the sitemap. Crawling stays allowed so crawlers read the noindex. Previews are never indexed either way (Vercel sends `X-Robots-Tag: noindex`) |
| `header.defaultTheme` | `system` | Also sets `<meta name="color-scheme">`: `light dark` for system, or the forced scheme |

Always on, not settings: `format-detection: telephone=no` (iOS otherwise links years and ISBNs
as phone numbers), a manifest with `id`, `display: standalone` (iOS 26 opens every Home Screen
site as a web app anyway), and the maskable icon.
