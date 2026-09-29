'use client'

import Link from 'next/link'
import { SETUP_STEPS } from './schema-helpers'
import { useSettings } from './store'
import { Field, MONO, SettingsSection } from './primitives'

/* Setup: read-only for now. The wizard (/settings?setup=1) walks the same sections one at a
   time and flips these flags as it goes. */

export function SetupSection() {
  const { snap } = useSettings()
  const setup = snap.config.setup
  return (
    <SettingsSection id="setup" title="Setup" lead="First-run state. The Setup page shows in dev and preview until setup is complete; production never shows it.">
      <Field label="Completed" path="setup.completed" hint="Flipped by the last step of the wizard.">
        <p className="font-mono text-label text-foreground">{String(setup.completed)}</p>
      </Field>
      <Field label="Steps" path="setup.steps" hint="The onboarding checklist the setup skill, the wizard, and hand-editing all share.">
        <dl className="space-y-1">
          {SETUP_STEPS.map((s) => (
            <div key={s} className="flex gap-3 font-mono text-[0.75rem]">
              <dt className="w-20 text-[var(--color-muted)]">{s}</dt>
              <dd className="text-foreground">{String(setup.steps?.[s] ?? false)}</dd>
            </div>
          ))}
        </dl>
      </Field>
      <Field label="Wizard" path="setup" hint="The same controls, one section at a time: Identity, Modules, Brand, Social, Navigation, Footer.">
        <Link href="/settings?setup=1" className={`${MONO} accent-link`}>/settings?setup=1</Link>
      </Field>
    </SettingsSection>
  )
}
