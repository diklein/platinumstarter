# Settings: the dev-only control panel for site.config.ts

`/settings` is a page that exists only under `next dev`. It renders every field of
`site.config.ts` as a control, writes the file the moment a control changes, and leaves the
saving to git. It is the second of the three interfaces to the same file (hand-editing and
asking Claude Code are the other two), and it is built so none of them can drift: every
control is bound to exactly one config path, and that path is printed under its label.

## Where it exists

| Environment | `/settings` | `/api/settings/*` |
| --- | --- | --- |
| `next dev` | renders | answers |
| `next start`, preview, production | 404 (themed) | 404 |

Three locks, none trusting the others:

1. `src/proxy.ts` rewrites `/settings*` and `/api/settings*` to a route that does not exist
   whenever `NODE_ENV !== 'development'`, so the themed 404 renders before any page code runs.
2. `src/app/settings/page.tsx` calls `notFound()` under the same condition.
3. Every route handler under `src/app/api/settings/` answers 404 under the same condition
   (`src/app/settings/_lib/guard.ts`).

The page therefore appears in a production build's route table (Next builds every page it
finds), but nothing it does can run there: the proxy answers first, and the page's own guard
answers second.

## How a change lands

1. A control changes. Discrete controls (switches, selects, reorder arrows, add/remove) apply
   at once; text applies on blur or 600ms after the last keystroke, whichever comes first.
2. The client sends `PATCH /api/settings { path, value }` (`value: null` clears the field back
   to its default; the wizard's preset picker sends `{ preset }` instead).
3. The handler imports `site.config.ts` fresh (in a child Node process, so it never reads a
   stale bundle), applies the change to the INPUT, pushes it back through `defineConfig`, and
   rewrites the file with `src/lib/site-config-writer.ts`.
4. `next dev` hot-reloads. The running site is the preview; there is no other one.
5. The dirty strip under the header reads `git status --porcelain` for the files settings can
   write and shows "N files changed". Review opens a sheet with `git diff HEAD` per file in
   the site's code well; Revert (per file, or all) is `git checkout HEAD -- <file>`, and it
   confirms before discarding.

There is no save button. Git is the save layer: commit when the diff reads right.

## The writer

`src/lib/site-config-writer.ts` is deterministic:

- The header comment block is a constant (`HEADER`) and is written verbatim every time.
- `toInput(resolved)` drops every value equal to its default (and the derived ones:
  `identity.description` and `identity.intro` when they equal the tagline, which
  `defineConfig` re-derives), so an untouched field never appears in the file. The first
  write after cloning removes the shipped file's explicit defaults; that is expected.
- `serialize()` emits `defineConfig({ ... })` with keys in schema order, single quotes,
  two-space indent, trailing commas, a blank line between top-level sections, short nested
  objects and primitive arrays on one line. Same config in, same bytes out.
- `readConfig()` imports the file in a child `node` process (Node 24 strips the types) and
  returns the resolved object. `applyChange()` validates the dotted path against the schema
  (`ConfigPathError` on an unknown one) before it touches anything.

Round-trip contract, proven by `node` against a temp copy at build time of this doc: for any
resolved config `c`, `readConfig(writeConfig(c))` deep-equals `c`, and
`serialize(readConfig(writeConfig(c))) === serialize(c)`.

The writer is the only thing that writes the file. Scripts that want to change the config
(`scripts/setup.mjs`, an agent) should go through `applyChange` + `writeConfig` too, so every
interface produces the same file.

## The page

Two-pane anatomy: `SectionRail` on the left with the section
list (scroll-tracked, deep-linkable `#anchors`), content on the right. Settings WRITES the
tokens the design system READS.

Sections, one per schema section: Identity, Brand, Social, Header, Navigation, Footer,
Modules, Home, Sources, Photos, Writing, Publishing, Intelligence, Code, Palette, Advanced,
Connections, Setup.

Every row is a `Field`: the name, the config path in mono (click copies it; it is also the
thing to say to Claude Code, "set identity.tagline to ..."), a one-line description of what
the code does with it, and the control. The controls are the site's own primitives
(`src/components/ui`: `Input`, `Switch`, `Select`, `Button`); floating surfaces (the select
popup, the review sheet) carry no border, shadow only.

Readouts that come from outside the config are computed server-side per render:

- Sources: "9 posts, newest 3 days ago" per folder (`_lib/sources.ts`, fs + frontmatter).
- Connections: present / missing per env var (`_lib/connections.ts`; only the boolean crosses
  to the client), a copyable `vercel env add NAME` line, the list of what the key unlocks
  (hand-written from every `process.env` read in `src/` and `scripts/`), and a Test button.
  Test POSTs to `/api/settings/test`, which runs `qa/smoke/<id>.mjs` in a child process with
  the server's environment when that file exists. The public template ships no `qa/`, so the
  button reads "Test not available in this build" there.

## The wizard

`/settings?setup=1` renders the same section components one at a time: Identity, Modules,
Brand, Social, Navigation, Footer, Done, with Back and Next. The panels are the same
components as the full page, so nothing can drift; the only additions are the preset picker
at the top of the Modules step (`src/lib/presets.ts`: Writer, Photographer, Designer,
Everything; the current shape is highlighted, "custom" when it matches none) and the finish
button, which sets `setup.completed` to true. Next also flips the matching `setup.steps.*`
flag (identity, shape, brand) so the onboarding checklist the setup skill drives agrees.

## API

All under `src/app/api/settings/`, all `force-dynamic`, all 404 outside development.

| Route | Method | Body | Answers |
| --- | --- | --- | --- |
| `/api/settings` | GET | | the snapshot: `config`, `defaults`, `sources`, `connections`, `dirty` |
| `/api/settings` | PATCH | `{ path, value }` or `{ preset }` | the fresh snapshot |
| `/api/settings/diff` | GET | | `{ files: [{ file, status, diff }] }` |
| `/api/settings/revert` | POST | `{ file }` | the fresh snapshot |
| `/api/settings/test` | POST | `{ id }` | `{ available: false }` or `{ available: true, ok, detail | kind, message }` |
| `/api/settings/vercel` | POST | `{ op: 'status' }`, `{ op: 'add' | 'inspect', domain }` | the linked project and CLI login, or the Vercel CLI's output for `domains add <domain> <project>` / `domains inspect <domain>` (the Domain section; the CLI runs on this machine, logged in after `vercel link`) |

## Adding a field

1. Add it to the schema (`src/lib/site-config-schema.ts`): the type, the default, the doc
   comment. The writer picks it up from `DEFAULTS` automatically; nested objects one level
   below a section (like `brand.themeColor`) need an entry in the writer's `THIRD_LEVEL` map.
2. Add one control to the matching section component in `src/components/settings/`, bound to
   the new path. `TextField`, `SwitchField`, `SelectField`, `StringListField`, and
   `OrderedList` cover the schema's shapes.
3. That is all: the path under the label, the diff, and the revert come for free.
