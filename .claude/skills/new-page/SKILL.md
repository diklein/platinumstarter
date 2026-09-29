---
name: new-page
description: Add a new page (a route that is not a post) with the shared page shell, the site footer, and a nav entry. Use when the user says "new page", "add a page", "make a /something page", "I need a page for", or asks for a route that is not writing.
---

# New page

Every page is two files. Both, always.

## 1. `src/app/<slug>/page.tsx`

```tsx
import { PageShell } from '@/components/layout/page-shell'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Workshops',
  description: 'One line for the tab, the card, and search.',
  path: '/workshops',
})

export default function WorkshopsPage() {
  return (
    <PageShell title="Workshops" subtitle="Small classes at the studio, spring and fall.">
      <div className="col-content">
        {/* page content */}
      </div>
    </PageShell>
  )
}
```

`PageShell` brings the header-clearing top padding, the 12-column grid, the `page-title` heading, and the muted `section-label` subtitle. Children sit in that grid; place them with the column classes from `globals.css`: `col-content` (the reading column), `col-prose` (wider), `col-media`, `col-portrait`. Optional props: `eyebrow`, `action` (top-right element), `hero` (full-width media above the title).

## 2. `src/app/<slug>/layout.tsx`

`PageShell` does not bring the footer. The sibling layout does (copy `src/app/books/layout.tsx`):

```tsx
import { SiteLayout } from '@/components/layout/site-layout'

export default function WorkshopsLayout({ children }: { children: React.ReactNode }) {
  return <SiteLayout>{children}</SiteLayout>
}
```

`node scripts/check-conventions.mjs --only layout` fails on a page without one and names it; `--fix` writes the missing layout. Only `/lab` sketches and pure-redirect routes are exempt.

## 3. The nav

Header links come from `nav` in `site.config.ts`. Add a custom link object where it belongs in the order:

```ts
nav: ['writing', 'photos', { href: '/workshops', label: 'Workshops' }, 'about'],
```

Never edit the header component to add a link.

## Rules the checks enforce

- No em or en dashes in `page.tsx` or `layout.tsx` copy (`no-em-dashes`).
- Images through `next/image`, never a raw `<img>` (`no-raw-img`).
- No hardcoded identity: the owner's name, email, handles, and URL come from `site` in `@/lib/site-config` (`no-hardcoded-identity`).
- Typographic recipes are classes: `page-title`, `section-label`, `section-title`, `accent-link`; do not retype their utilities.

A page that should be switchable off (a module) needs a registry row as well; follow "How to add a module" in `docs/modules.md`.

## Verify

```
npx tsc --noEmit -p tsconfig.json
node scripts/check-conventions.mjs
```

Then open the route on localhost and confirm the footer is there.
