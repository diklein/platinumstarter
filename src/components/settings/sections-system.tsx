'use client'

import { useSettings } from './store'
import { SettingsSection } from './primitives'
import { SelectField, SwitchField, TextField } from './controls'

/* The "System" sections: Intelligence, Code, Palette, Advanced. */

export function IntelligenceSection() {
  const { snap } = useSettings()
  const ai = snap.config.intelligence
  return (
    <SettingsSection id="intelligence" title="Intelligence" lead="AI-assisted publishing. Each feature is a script you run; all of them go through scripts/lib/ai.mjs, which needs the chosen provider's key in .env.local (see Connections).">
      <SelectField label="Provider" path="intelligence.provider" value={ai.provider} options={[{ value: 'anthropic', label: 'Anthropic (ANTHROPIC_API_KEY)' }, { value: 'openai', label: 'OpenAI (OPENAI_API_KEY)' }, { value: 'gateway', label: 'Vercel AI Gateway (AI_GATEWAY_API_KEY)' }]} hint="Who answers. The gateway reaches any model behind one key." />
      <TextField label="Fast model" path="intelligence.models.fast" value={ai.models.fast} mono placeholder="provider default" hint="Alt text, captions, bulk work. Empty = the provider's default in scripts/lib/ai.mjs." />
      <TextField label="Capable model" path="intelligence.models.capable" value={ai.models.capable} mono placeholder="provider default" hint="SEO, review, enrichment." />
      <SwitchField label="Alt text" path="intelligence.altText" value={ai.altText} hint="scripts/generate-alt-text.mjs may run." />
      <SwitchField label="SEO" path="intelligence.seo" value={ai.seo} hint="scripts/generate-seo.mjs may run." />
      <SwitchField label="Review" path="intelligence.review" value={ai.review} hint="scripts/content-review.mjs may run." />
    </SettingsSection>
  )
}

export function CodeSection() {
  const { snap, patch } = useSettings()
  const code = snap.config.code
  const custom = code.theme !== 'house'
  return (
    <SettingsSection id="code" title="Code" lead="Fenced code in posts: the Shiki theme pair and line numbers.">
      <SelectField
        label="Theme"
        path="code.theme"
        value={custom ? 'custom' : 'house'}
        options={[{ value: 'house', label: 'House (min-light / min-dark, blues as ink)' }, { value: 'custom', label: 'A Shiki theme pair' }]}
        onChange={(v) => patch('code.theme', v === 'house' ? null : { light: 'github-light', dark: 'github-dark' })}
      />
      {custom && code.theme !== 'house' && (
        <>
          <TextField label="Light theme" path="code.theme" value={code.theme.light} mono hint="A Shiki theme id for light mode." />
          <TextField label="Dark theme" path="code.theme" value={code.theme.dark} mono hint="A Shiki theme id for dark mode." />
        </>
      )}
      <SwitchField label="Line numbers" path="code.lineNumbers" value={code.lineNumbers} hint="On multi-line blocks that are not shell commands." />
    </SettingsSection>
  )
}

export function PaletteSection() {
  const { snap } = useSettings()
  const palette = snap.config.palette
  return (
    <SettingsSection id="palette" title="Search palette" lead="The command palette behind the search input.">
      <SwitchField label="Tips" path="palette.tips" value={palette.tips} hint="The rotating tips strip under the input." />
      <TextField label="Results per section" path="palette.resultCount" value={palette.resultCount} type="number" mono />
    </SettingsSection>
  )
}
