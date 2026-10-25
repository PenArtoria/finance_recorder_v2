// The AI that reads normal (non-command) messages.
//
// Pick one with AI_PROVIDER and give its key in AI_API_KEY. Each company has a cheap
// default model; set AI_MODEL to use another one. Nothing else changes: whichever AI
// it is, its answer is checked by validateActions and shown to you before anything
// is saved.

import { BotError, type Env } from '../env'
import { esc } from '../i18n'
import { claude } from './claude'
import { compatible } from './compatible'
import { openai } from './openai'
import type { AiParser, ProviderOptions } from './types'

export type { AiParser, AiResult } from './types'

interface Provider {
  /** How to talk to it. */
  api: (o: ProviderOptions) => AiParser
  /** API address. AI_BASE_URL replaces it. */
  url?: string
  /** Cheap default model. AI_MODEL replaces it; providers without one need AI_MODEL. */
  model?: string
  headers?: Record<string, string>
}

/** Every supported AI_PROVIDER. Defaults checked against each company's model list in October 2026. */
export const PROVIDERS: Record<string, Provider> = {
  claude: { api: claude, model: 'claude-haiku-5-5' },
  openai: { api: openai, url: 'https://api.openai.com/v1', model: 'gpt-6-luna' },
  gemini: { api: compatible, url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash-lite' },
  deepseek: { api: compatible, url: 'https://api.deepseek.com', model: 'deepseek-flash' },
  // One key for models from many companies. AI_MODEL looks like "google/gemini-3.5-flash-lite".
  openrouter: { api: compatible, url: 'https://openrouter.ai/api/v1', headers: { 'X-Title': 'Moneta' } },
  // Any other OpenAI-style service: set AI_BASE_URL and AI_MODEL.
  custom: { api: compatible }
}

const ALIASES: Record<string, string> = { anthropic: 'claude', google: 'gemini', chatgpt: 'openai' }

export function aiConfigured(env: Env): boolean {
  return !!env.AI_PROVIDER?.trim() && !!env.AI_API_KEY?.trim()
}

/** The configured AI, or null when AI_PROVIDER or AI_API_KEY is empty. */
export function createParser(env: Env): AiParser | null {
  if (!aiConfigured(env)) return null
  const name = env.AI_PROVIDER!.trim().toLowerCase()
  const provider = PROVIDERS[ALIASES[name] ?? name]
  if (!provider) throw new BotError('unknownProvider', { provider: esc(name), names: Object.keys(PROVIDERS).join(', ') })
  const model = env.AI_MODEL?.trim() || provider.model
  if (!model) throw new BotError('aiSetup', { setting: 'AI_MODEL' })
  const baseUrl = (env.AI_BASE_URL?.trim() || provider.url)?.replace(/\/+$/, '')
  if (!baseUrl && provider.api !== claude) throw new BotError('aiSetup', { setting: 'AI_BASE_URL' })
  return provider.api({ apiKey: env.AI_API_KEY!.trim(), model, baseUrl, headers: provider.headers })
}
