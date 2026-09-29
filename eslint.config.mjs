import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  // Vendored and generated code drowned the real signal (15k+ findings, nearly
  // all from Obsidian plugin bundles, agent worktrees, and .next output —
  // audit, 2026-08-28). Lint what we author; ignore what we don't.
  {
    ignores: [
      '.obsidian/**',
      '.claude/**',
      '.next/**',
      '.next-*/**',
      'src/generated/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  // A leading underscore is the deliberate-unused signal (e.g. a placeholder
  // props param that keeps a component's call signature honest).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // CLAUDE.md constraint, made mechanical: all images go through next/image (see
  // docs/conventions.md, no-raw-img). Next's own no-img-element is a warning that
  // lint tolerates; this is the error with the fix in the message.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='img']",
          message: 'Raw <img> is not allowed: use next/image (import Image from "next/image"). Only src/app/og/** may render a raw <img>, because next/og requires it.',
        },
      ],
    },
  },
  // next/og image routes have no next/image: Satori renders raw <img> only. /lab is a
  // gated sketchbook that never reaches production, where the rule exists to matter.
  {
    files: ['src/app/og/**', 'src/app/lab/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  // The dk-* components ship to npm framework-agnostic: they cannot import
  // next/image, and their plain <img> is the documented design (audit, 2026-08-28).
  {
    files: ['src/components/dk-bezeler/**', 'src/components/dk-media-viewer/**', 'src/components/dk-product-card/**'],
    rules: { '@next/next/no-img-element': 'off', 'no-restricted-syntax': 'off' },
  },
  // Specimen pages render bare <a> anchors ON PURPOSE: they demo the site's
  // link recipes and what an npm consumer's plain anchor looks like. Converting
  // them to <Link> would make the specimens dishonest (audit, 2026-08-28).
  {
    files: [
      'src/app/design-system/page.tsx',
      'src/app/dkbezeler/page.tsx',
      'src/app/dkmediaviewer/page.tsx',
      'src/app/dkproductcard/page.tsx',
    ],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
]

export default eslintConfig
