# Example content

An untouched clone renders as a labelled demo. Every example post, case study, and photo is
tagged so `npm run clear-examples` removes it mechanically (`--dry-run` lists first), and each
example is a correct, complete demonstration of one part of the MDX vocabulary, so it doubles as
a few-shot reference for anyone (or any agent) writing the real thing.

## How examples are marked

| Kind | Marker | Removed by clear-examples |
| --- | --- | --- |
| Posts (`src/content/writing/*.mdx`) | `example: true` in frontmatter | the file, plus the `/images/…`, `/videos/…`, `/img/…`, `/files/…` files it references (and a clip's poster, webm, and 3x siblings) |
| Case studies (`src/content/designs/*.mdx`) | `example: true` in frontmatter | the file and its referenced media |
| Case-study entries (`src/lib/designs.ts`) | `example: true` on the `ALL_DESIGNS` object | the object literal |
| Photos (`src/lib/manual-photos.ts`) | `id` starts with `example-` (the Unsplash id follows) | the entry and its `public/images/photos/example-<n>.jpg` |

A media file referenced by a non-example post is never deleted. Content image folders that end
up empty get a `.gitkeep`, so the `sources-exist` convention check still passes on a fresh clone.

The images in the posts are crops of the demo photographs (see The photos below), and the clips
are renders of the Platinum mark. `scripts/generate-example-images.mjs` regenerates the case
studies' placeholders from the OKLCH tokens in `globals.css`; `--list` prints its manifest.

## The posts

Four posts ship. Together they demonstrate every element and tag a post is likely to use, so
they double as the writing reference for the `new-post` and `edit-post` skills.

| Slug | Type | Demonstrates |
| --- | --- | --- |
| `welcome-to-platinum` | article | `TlDr`, headings, ordered and unordered lists, links, a fenced `bash` block |
| `writing-a-post` | article, `toc: true` | frontmatter fields (`yaml` fence with `title=`), h2/h3, short and long lists, ordered list, inline links, emphasis, inline code, hanging opening quote, `blockquote`, `PullQuote` with attribution, GFM table, GFM footnotes (`[^1]`), `hr`, `ProductCard` with `strip="Update"` (the update card), fenced code blocks (language, `title="…"` header, `showLineNumbers`, `diff`, the copy button), `IconFamiliesDemo`, `IconChaosDemo` |
| `images-and-captions` | article, `toc: true`, frontmatter `image` | markdown images with every title keyword (caption only, `full`, `portrait`, `narrow`, numeric width, `border`, `shadow`), alt text conventions, repo-relative paths, `ImageRow`, `PhotoCaption`, `BlinkComparator`, `-framed.png` auto-bezel, `BezelImage`, `Video` (with `poster`, `alt`, `loop`), `PortraitVideo`, `GifVideo` with a caption and a `.webm` sibling, `VideoEmbed` with `captions` (WebVTT), lead-image rule |
| `a-photo-essay` | photo | `Slideshow` with `ratio`, captions, and `exif`, fed from the demo photos |

## Tags no example post uses

These are registered in `mdx-components.tsx` and work in any post; there is no demo of them on the
site, so their props are listed here.

| Tag | Props | Notes |
| --- | --- | --- |
| `ProductCard` | `title`, `description`, `href`, `label`, `image`, `retired`, `strip`, `download`, `asin`, children | A bordered card that points at a product, tool, or update. No `href` renders a plain box. `retired` is sugar for `strip="Retired"`. `strip` with children and no title is a note-style card (the `TlDr` shape). `download` makes the link a file download from `public/files/`. A bare Amazon product URL alone on a line becomes one at build time from `src/lib/amazon-products.json`; `publishing.amazonAffiliateTag` adds the tag. |
| `SkillCard` | `name`, `creator`, `href`, `repo`, `note` | For posts about agent skills. The link label is the host of `href`. |
| `AppList`, `App` | `AppList label`; `App slug`, children | A software list where each row leads with the app's icon, read from `public/images/apps/_<slug>.png` (the folder does not exist on the template; create it with the first icon). Write the sentence normally with the app's name as a link. |
| `DesignDetails` | `role`, `team`, `org`, `company`, `year`, `platform`, `tools` | The case-study spec box, a note-style card with key and value rows. Both example case studies use it. |
| `Video` extras | `darkSrc`, `noProgress`, `loose` | `darkSrc` swaps in a second clip when the theme is dark (its poster is derived the same way, `<name>-dark.jpg`). `noProgress` hides the progress bar; `loose` widens the vertical margins. |
| `PhoneVideoClassic`, `PhoneVideoModern` | `src`, `poster` | A drawn phone frame around a portrait clip: the home-button era and the notch era. |
| `BezelVideo` | `name`, `alt` | The baked alternative: `<name>-light.mp4` and `<name>-dark.mp4` with matching posters in `public/img/dot/bezel/` (the component hardcodes the path); the theme picks one with CSS alone. |

## The case studies

Both are for **Ridge, a fictional field-notes app**; the description says so and every figure
is invented. They follow the anatomy in `docs/case-study-guidance.md`: result first, the inherited
state, the work, results, what went wrong, credits.

| Slug | Hero | Demonstrates |
| --- | --- | --- |
| `ridge-capture` | static PNG (`image` + `imageWidth`/`imageHeight` in `designs.ts`) | `toc: true`, `DesignDetails` with all seven rows, lead-with-the-result, `BlinkComparator` before/after, markdown images with captions and `portrait`, bold-lead list items |
| `ridge-sync` | video (`image: …/example-sync-hero.mp4`, poster + webm beside it, `GifVideo` in the body) | `toc: false` opt-out, `DesignDetails` with a subset of rows, `PullQuote`, ordered list, `ImageRow` |

## Component coverage (mdx-components.tsx)

| Mapping | Where it appears |
| --- | --- |
| `h1` | never in a body (the page renders the title); documented in `writing-a-post` |
| `h2`, `h3`, `p`, `strong`, `ul`, `ol`, `blockquote`, `hr`, `table` (+ `thead`/`tbody`/`tr`/`th`/`td`), `section[data-footnotes]` | `writing-a-post` |
| `code` (inline), `pre`/`figure[data-rehype-pretty-code-figure]` + `CopyCodeButton` | `writing-a-post` |
| `img` (markdown images, all title keywords, `-framed.png`) | `images-and-captions`, `a-photo-essay`, both studies |
| `video` (raw tag mapping) | not used in examples; `Video` is the authored form (the mapping exists for legacy HTML) |
| `Video`, `PortraitVideo`, `GifVideo`, `VideoEmbed` | `images-and-captions` (`GifVideo` also heroes `ridge-sync`) |
| `PhoneVideoClassic`, `PhoneVideoModern`, `BezelVideo` | no example; see the props table above |
| `ImageRow` | `images-and-captions`, `ridge-sync` |
| `BezelImage` | `images-and-captions` |
| `PhotoCaption` | `images-and-captions` |
| `BlinkComparator` | `images-and-captions`, `ridge-capture` |
| `PostNote` | no example; the update card in `writing-a-post` is a `ProductCard` strip |
| `PullQuote` | `writing-a-post`, `ridge-sync` |
| `TlDr` | `welcome-to-platinum` |
| `ProductCard` | `writing-a-post` (the update card, `strip` with children) |
| `SkillCard`, `AppList`, `App` | no example; see the props table above |
| `DesignDetails` | both studies |
| `Slideshow` | `a-photo-essay` |
| `IconFamiliesDemo`, `IconChaosDemo` | `writing-a-post` |

`PageCard` (`src/components/mdx/page-card.tsx`) is not registered in `mdx-components.tsx`; only
the `/lab` sketches import it, so no example uses it.

## Things the examples depend on outside their own folders

- `BezelVideo` reads from `public/img/dot/bezel/` (hardcoded in the component). No example uses
  it, so the folder does not exist on the template; clear-examples removes bezel clips by the
  `name` prop when an example does.
- `src/lib/synced-photos.json` is an empty array on the template. Components that read it
  cast to `UnsplashPhoto[]` (an empty JSON module types as `never[]`).

## The photos

Eight photographs by eight Unsplash photographers, used under the Unsplash License and
downloaded at Unsplash's 1080px "regular" size. Each entry in `src/lib/manual-photos.ts` names the
photographer in its caption and carries the photo's Unsplash page as `link`, so the lightbox credits
it. The Unsplash ids are kept in the entry ids: `023T4jyCRqA` (Filip Mroz), `4CDdd1RCt6w` (Marek
Szturc), `IWYcrdO93WY` (준영 박), `RIQ96s3Uzso` (Alexander Possingham), `XK0faa4_mCQ` (Simone
Hutsch), `ZOeyUJB6t_Y` (Manki Kim), `kogC-cLefIs` (Karsten Koehn), `vZ1JAXUO3-0` (Roberto Nickson).
