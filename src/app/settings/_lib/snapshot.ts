/**
 * Everything the settings UI needs in one object: the resolved config, the defaults it is
 * compared against, the derived readouts, and the git state. The page loads it on render;
 * the GET route serves the same shape so the client can refresh after a revert.
 */
import { DEFAULTS } from '@/lib/site-config-schema'
import type { SiteConfig } from '@/lib/site-config-schema'
import { readConfig } from '@/lib/site-config-writer'
import { connectionStatuses, type ConnectionStatus } from './connections'
import { dirtyFiles, type DirtyFile } from './git'
import { sourceReadouts, type SourceReadout } from './sources'

export type SettingsSnapshot = {
  config: SiteConfig
  defaults: SiteConfig
  sources: SourceReadout[]
  connections: ConnectionStatus[]
  dirty: DirtyFile[]
}

export async function loadSnapshot(): Promise<SettingsSnapshot> {
  const [config, dirty] = await Promise.all([readConfig(), dirtyFiles()])
  return {
    config,
    defaults: JSON.parse(JSON.stringify(DEFAULTS)) as SiteConfig,
    sources: sourceReadouts(config.sources),
    connections: connectionStatuses(),
    dirty,
  }
}
