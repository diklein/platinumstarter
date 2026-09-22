/**
 * Site shape presets: Writer / Photographer / Designer / Everything.
 *
 * A preset is a bundle of `modules` + `nav` + `home.grid`, the three fields that together
 * decide what the site IS. The setup skill (`.claude/skills/setup/SKILL.md`), the dev-only
 * /settings wizard, and `scripts/setup.mjs` all apply the same objects through `applyPreset`,
 * so choosing a shape in any of the three interfaces lands the same `site.config.ts`.
 *
 * Presets are partial INPUT configs (the shape of the root file), never resolved configs, so
 * everything a preset does not name keeps whatever the owner already has. `modules.lab` is
 * deliberately absent from every preset: the lab is a deferred setup topic, not a shape.
 *
 * Import-free apart from the schema types, for the same reason the schema itself has no
 * imports: the root config and the Node scripts both need to load this without a cycle.
 */
// The `.ts` specifier is deliberate: scripts/setup.mjs imports this file under Node's native
// type stripping, which resolves relative imports only with an explicit extension (the root
// site.config.ts imports the schema the same way).
import type { ModuleId, SiteConfigInput } from './site-config-schema.ts'
import { MODULE_IDS } from './site-config-schema.ts'

export const PRESET_IDS = ['writer', 'photographer', 'designer', 'everything'] as const

export type PresetId = (typeof PRESET_IDS)[number]

type ModuleToggles = NonNullable<SiteConfigInput['modules']>
type Nav = NonNullable<SiteConfigInput['nav']>
type HomeGrid = NonNullable<NonNullable<SiteConfigInput['home']>['grid']>

export interface Preset {
  /** Short label for a picker: "Writer". */
  label: string
  /** One sentence for the picker and the skill's proposal. No em dashes. */
  blurb: string
  /** The partial input config the preset applies: `modules`, `nav`, and `home.grid`. */
  config: Partial<SiteConfigInput> & {
    modules: ModuleToggles
    nav: Nav
    home: { grid: HomeGrid }
  }
}

/** Every module off except the ones named. `lab` is never in the map (see the file comment). */
function only(on: Array<Exclude<ModuleId, 'lab'>>): ModuleToggles {
  const out: ModuleToggles = {}
  for (const id of MODULE_IDS) {
    if (id === 'lab') continue
    out[id] = on.includes(id)
  }
  return out
}

export const PRESETS: Record<PresetId, Preset> = {
  writer: {
    label: 'Writer',
    blurb: 'Posts, an archive, and tags. Nothing else in the nav.',
    config: {
      modules: only(['archive', 'hashtags']),
      nav: ['writing', 'about'],
      home: { grid: ['latestPost', 'social'] },
    },
  },
  photographer: {
    label: 'Photographer',
    blurb: 'Photos first, writing second. Recent photos lead the home page.',
    config: {
      modules: only(['photos', 'archive', 'hashtags']),
      nav: ['photos', 'writing', 'about'],
      home: { grid: ['photos', 'latestPost', 'social'] },
    },
  },
  designer: {
    label: 'Designer',
    blurb: 'Case studies and writing. Designs lead the nav; photos stay off.',
    config: {
      modules: only(['designs', 'archive', 'hashtags']),
      nav: ['designs', 'writing', 'about'],
      home: { grid: ['latestPost', 'social'] },
    },
  },
  everything: {
    label: 'Everything',
    blurb: 'Every module the template ships, on. Cells without data hide themselves.',
    config: {
      modules: only(['designs', 'photos', 'books', 'podcasts', 'archive', 'hashtags']),
      nav: ['writing', 'designs', 'photos', 'about'],
      home: { grid: ['latestPost', 'photos', 'reading', 'now', 'social', 'calendar'] },
    },
  },
}

/**
 * The input config with a preset applied: the preset's module toggles are laid over the
 * current ones (so `lab` and anything the preset does not name survive), `nav` and
 * `home.grid` are replaced outright, and every other section passes through untouched.
 * Pure: the argument is not mutated.
 */
export function applyPreset(current: SiteConfigInput, id: PresetId): SiteConfigInput {
  const preset = PRESETS[id].config
  return {
    ...current,
    modules: { ...current.modules, ...preset.modules },
    nav: [...preset.nav],
    home: { ...current.home, grid: [...preset.home.grid] },
  }
}

/**
 * Which preset, if any, a set of module toggles matches exactly (lab ignored). For pickers
 * that want to show the current shape as a selected preset; `null` means "custom".
 */
export function matchPreset(modules: ModuleToggles | undefined): PresetId | null {
  for (const id of PRESET_IDS) {
    const target = PRESETS[id].config.modules
    const same = MODULE_IDS.every((moduleId) => {
      if (moduleId === 'lab') return true
      return Boolean(modules?.[moduleId]) === Boolean(target[moduleId])
    })
    if (same) return id
  }
  return null
}
