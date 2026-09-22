'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PRESETS, PRESET_IDS, matchPreset, type PresetId } from '@/lib/presets'
import { useSettings } from './store'
import { DESC, LEAD, MONO, NAME } from './primitives'
import { DirtyStrip } from './dirty-strip'
import { BrandSection, FooterSection, IdentitySection, NavigationSection, SocialSection } from './sections-site'
import { ModulesSection } from './sections-content'

/* The wizard: the same section components as the full page, one at a time, in a linear
   order. Nothing can drift because nothing is duplicated; the only additions are the preset
   picker at the top of the Modules step and the finish button. Every control still applies
   instantly, so Back and Next never save anything. */

const STEPS = [
  { id: 'identity', label: 'Identity', flips: 'identity' },
  { id: 'modules', label: 'Modules', flips: 'shape' },
  { id: 'brand', label: 'Brand', flips: 'brand' },
  { id: 'social', label: 'Social' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'footer', label: 'Footer' },
  { id: 'done', label: 'Done' },
] as const

function PresetPicker() {
  const { snap, applyPreset, pending } = useSettings()
  const current = matchPreset(snap.config.modules)
  return (
    <div className="border-b border-border py-7">
      <div className={NAME}>Start from a shape</div>
      <p className={`${DESC} mt-1.5`}>A preset sets the modules, the nav, and the home grid together. Adjust anything below afterwards.</p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRESET_IDS.map((id: PresetId) => {
          const p = PRESETS[id]
          const selected = current === id
          return (
            <li key={id}>
              <button
                type="button"
                disabled={pending > 0}
                aria-pressed={selected}
                onClick={() => applyPreset(id)}
                className={`flex w-full cursor-pointer items-start gap-3 border p-4 text-left transition-colors ${selected ? 'border-foreground' : 'border-border hover:border-[var(--color-border-strong)]'}`}
              >
                <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-accent)] transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`} />
                <span>
                  <span className={`${NAME} block`}>{p.label}</span>
                  <span className={`${DESC} mt-1 block`}>{p.blurb}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {current === null && <p className={`${MONO} mt-3`}>Custom: the modules below match no preset</p>}
    </div>
  )
}

function DoneStep() {
  const { snap, patch, pending } = useSettings()
  const { identity, nav, setup } = snap.config
  const navText = nav.map((e) => (typeof e === 'string' ? e : e.label)).join(', ')
  return (
    <section id="done" className="scroll-mt-28 xl:scroll-mt-16">
      <h2 className="section-title">{setup.completed ? 'Set up' : 'Almost done'}</h2>
      <p className={`${LEAD} mt-5`}>
        {setup.completed
          ? 'Setup is complete. The Setup page is gone from the nav; everything here stays editable.'
          : 'Everything above is already on disk. Finishing marks setup complete, which retires the Setup page on the home page.'}
      </p>
      <dl className="mt-10 space-y-2 border-t border-border pt-6">
        {[['identity.name', identity.name], ['identity.tagline', identity.tagline], ['nav', navText]].map(([k, v]) => (
          <div key={k} className="flex gap-4 font-mono text-[0.75rem]">
            <dt className="w-36 shrink-0 text-[var(--color-muted)]">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
        <div className="flex gap-4 font-mono text-[0.75rem]">
          <dt className="w-36 shrink-0 text-[var(--color-muted)]">setup.completed</dt>
          <dd className="text-foreground">{String(setup.completed)}</dd>
        </div>
      </dl>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        {!setup.completed && (
          <Button size="lg" disabled={pending > 0} onClick={() => patch('setup.completed', true)}>
            <Check data-icon="inline-start" /> Finish setup
          </Button>
        )}
        <Button variant="outline" size="lg" render={<Link href="/" />}>Open the site</Button>
        <Button variant="ghost" size="lg" render={<Link href="/settings" />}>All settings</Button>
      </div>
    </section>
  )
}

export function SetupWizard() {
  const { patch } = useSettings()
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const go = async (next: number) => {
    if (next > index && 'flips' in step && step.flips) await patch(`setup.steps.${step.flips}`, true)
    setIndex(Math.max(0, Math.min(STEPS.length - 1, next)))
    window.scrollTo({ top: 0 })
  }
  return (
    <div className="col-span-12 xl:col-start-4 xl:col-span-6">
      <DirtyStrip />
      <ol className="mb-12 flex flex-wrap gap-x-4 gap-y-1">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`${MONO} ${i === index ? 'text-[var(--color-accent)]' : ''}`}>
            <button type="button" onClick={() => go(i)} aria-current={i === index ? 'step' : undefined} className={`cursor-pointer ${i === index ? 'text-[var(--color-accent)]' : 'hover:text-foreground'}`}>
              {i + 1} {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step.id === 'identity' && <IdentitySection />}
      {step.id === 'modules' && <ModulesSection><PresetPicker /></ModulesSection>}
      {step.id === 'brand' && <BrandSection />}
      {step.id === 'social' && <SocialSection />}
      {step.id === 'navigation' && <NavigationSection />}
      {step.id === 'footer' && <FooterSection />}
      {step.id === 'done' && <DoneStep />}

      <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
        <Button variant="outline" size="lg" disabled={index === 0} onClick={() => go(index - 1)}>
          <ArrowLeft data-icon="inline-start" /> Back
        </Button>
        <span className={MONO}>Step {index + 1} of {STEPS.length}</span>
        <Button size="lg" disabled={index === STEPS.length - 1} onClick={() => go(index + 1)}>
          Next <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}
