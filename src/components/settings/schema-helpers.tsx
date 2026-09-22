/**
 * Client-safe re-exports of the schema's registries plus the one predicate the settings UI
 * needs against a config it holds in state (the site-wide `moduleEnabled` reads the
 * imported config, which is the wrong one here: the page shows the file on disk, live).
 */
import type { ModuleId, SiteConfig } from '@/lib/site-config-schema'

export { MODULE_IDS, MODULE_META, SOCIAL_NETWORKS, PHOTO_SOURCE_LABELS, SETUP_STEPS } from '@/lib/site-config-schema'

export function moduleEnabledIn(config: SiteConfig, id: ModuleId): boolean {
  const value = config.modules[id]
  return value !== false && value !== undefined
}
