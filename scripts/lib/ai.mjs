/**
 * scripts/lib/ai.mjs: the one seam between the publishing scripts and an AI provider.
 *
 * A script that needs a model asks for a TIER, never a provider or a model id:
 *
 *   model('fast')       alt text, captions, bulk work (cheap, vision-capable)
 *   model('capable')    SEO descriptions, content review
 *
 * `site.intelligence.provider` in site.config.ts picks who answers ('anthropic' by default,
 * 'openai', or 'gateway' for Vercel AI Gateway) and `site.intelligence.models` overrides a
 * tier's model id. The stack is the Vercel AI SDK throughout (`ai` + `@ai-sdk/<provider>`), so
 * the scripts' generateText / generateObject calls never change when the provider does.
 *
 * Model ids per provider, and where each id was taken from:
 *
 *   anthropic  fast = claude-haiku-4-5, capable = claude-sonnet-4-6. The dateless alias ids,
 *              both in the AnthropicMessagesModelId union of node_modules/@ai-sdk/anthropic
 *              (dist/index.d.ts). Every script uses these two; no dated snapshots.
 *   openai     fast = gpt-5.4-mini, capable = gpt-5.5. Both in the OpenAIResponsesModelId union
 *              of node_modules/@ai-sdk/openai@3.0.106 (dist/index.d.ts, the `ai-v6` dist-tag)
 *              and in the gateway's model catalog (node_modules/@ai-sdk/gateway, GatewayModelId).
 *              `openai(id)` targets the Responses API, whose message converter turns the AI
 *              SDK `image` content part into an `input_image` item (dist/index.mjs, the
 *              `case "file"` branch under image/* media types), which is what alt text needs.
 *   gateway    fast = anthropic/claude-haiku-4-5, capable = anthropic/claude-sonnet-4-6.
 *              Vercel AI Gateway ids are `provider/model` strings (GatewayModelId in
 *              node_modules/@ai-sdk/gateway). The provider ships inside `ai` itself (it
 *              re-exports `createGateway`/`gateway`; a bare string model id passed to
 *              generateText resolves to the same provider through `resolveLanguageModel`,
 *              see node_modules/ai/dist/index.mjs). We construct it explicitly so the key can
 *              come from the `env` override below, exactly like the other two providers.
 *
 * The key for the chosen provider is read from `env` (process.env by default). A missing key
 * throws a ProviderKeyError naming the env var and the page that issues it; scripts print that
 * message and exit, the smoke tests classify it as `missing-key`.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGateway } from 'ai'

// Importing site.config.ts natively makes Node print MODULE_TYPELESS_PACKAGE_JSON once; every
// script that loads the config silences it the same way (scripts/check-conventions.mjs).
process.removeAllListeners('warning')
const { default: site } = await import(new URL('../../site.config.ts', import.meta.url).href)

export const TIERS = /** @type {const} */ (['fast', 'capable'])

/**
 * Whether one of the intelligence features is on: `intelligence.altText`, `.seo`, or `.review`
 * in site.config.ts (all default to true). A script whose feature is off should say so and
 * exit 0, so a workflow step stays green and does nothing.
 * @param {'altText' | 'seo' | 'review'} feature
 */
export function intelligenceEnabled(feature) {
  return site?.intelligence?.[feature] !== false
}

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    docs: 'https://platform.claude.com/settings/keys',
    models: { fast: 'claude-haiku-4-5', capable: 'claude-sonnet-4-6' },
    create: (apiKey) => createAnthropic({ apiKey }),
  },
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/api-keys',
    models: { fast: 'gpt-5.4-mini', capable: 'gpt-5.5' },
    create: (apiKey) => createOpenAI({ apiKey }),
  },
  gateway: {
    label: 'Vercel AI Gateway',
    envKey: 'AI_GATEWAY_API_KEY',
    docs: 'https://vercel.com/docs/ai-gateway/authentication',
    models: { fast: 'anthropic/claude-haiku-4-5', capable: 'anthropic/claude-sonnet-4-6' },
    create: (apiKey) => createGateway({ apiKey }),
  },
}

export class ProviderKeyError extends Error {
  constructor(message, extra = {}) {
    super(message)
    this.name = 'ProviderKeyError'
    this.kind = 'missing-key'
    Object.assign(this, extra)
  }
}

/**
 * Resolve the provider and its two model ids. `provider` overrides site.config.ts (the smoke
 * tests force each provider in turn); `env` is where the key is read from.
 */
function resolve({ provider, env } = {}) {
  const configured = site?.intelligence?.provider ?? 'anthropic'
  const id = provider ?? configured
  const spec = PROVIDERS[id]
  if (!spec) {
    throw new Error(
      `Unknown AI provider '${id}'. site.intelligence.provider must be one of: ${Object.keys(PROVIDERS).join(', ')}.`
    )
  }
  const overrides = provider ? {} : site?.intelligence?.models ?? {}
  const models = {
    fast: overrides.fast ?? spec.models.fast,
    capable: overrides.capable ?? spec.models.capable,
  }
  const source = env ?? process.env
  const apiKey = source[spec.envKey]
  return { id, spec, models, apiKey: apiKey && String(apiKey).trim() ? String(apiKey).trim() : null, fromConfig: !provider }
}

/**
 * The language model for a tier, ready for `generateText` / `generateObject`.
 *
 * @param {'fast' | 'capable'} tier
 * @param {{ provider?: 'anthropic' | 'openai' | 'gateway', env?: Record<string, string | undefined> }} [options]
 */
export function model(tier, options = {}) {
  if (!TIERS.includes(tier)) {
    throw new Error(`Unknown model tier '${tier}'. Use one of: ${TIERS.join(', ')}.`)
  }
  const { id, spec, models, apiKey, fromConfig } = resolve(options)
  if (!apiKey) {
    const where = fromConfig ? `site.intelligence.provider is '${id}'` : `provider '${id}' was requested`
    throw new ProviderKeyError(
      `${spec.envKey} is not set (${where}).\n` +
        `Create a key at ${spec.docs}, then export it or add it to .env.local:\n` +
        `  export ${spec.envKey}=$(grep -m1 ^${spec.envKey}= .env.local | cut -d= -f2-)`,
      { envKey: spec.envKey, docs: spec.docs, provider: id }
    )
  }
  return spec.create(apiKey)(models[tier])
}

/**
 * What a script would log: provider id + label, the env var it needs, the docs URL, the
 * resolved model id per tier, and whether the key is present. Never the key itself.
 *
 * @param {{ provider?: 'anthropic' | 'openai' | 'gateway', env?: Record<string, string | undefined> }} [options]
 */
export function providerInfo(options = {}) {
  const { id, spec, models, apiKey } = resolve(options)
  return { provider: id, label: spec.label, envKey: spec.envKey, docs: spec.docs, models, hasKey: Boolean(apiKey) }
}
