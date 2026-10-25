// Claude, through Anthropic's official SDK.

import Anthropic from '@anthropic-ai/sdk'
import { BotError } from '../env'
import { esc } from '../i18n'
import { RECORD_TOOL, systemPrompt } from './prompt'
import { fromCalls, TIMEOUT_MS } from './shared'
import type { AiParser, ProviderOptions } from './types'

/** Models that can re-run a declined request on another model server-side. Others (such as Haiku) can't. */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
/** Older models that reject the effort setting. */
const NO_EFFORT = /^claude-(?:3|haiku-4-5|sonnet-4-5)/

export function claude(o: ProviderOptions): AiParser {
  const client = new Anthropic({ apiKey: o.apiKey, baseURL: o.baseUrl, timeout: TIMEOUT_MS, maxRetries: 1 })
  const tool: Anthropic.Tool = { name: RECORD_TOOL.name, description: RECORD_TOOL.description, input_schema: RECORD_TOOL.schema }

  return {
    async parse(message, context) {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: o.model,
        max_tokens: 8000,
        system: systemPrompt(context),
        tools: [tool],
        messages: [{ role: 'user', content: message }],
        // Reading one chat message is a simple job: low effort is the fastest and cheapest.
        ...(NO_EFFORT.test(o.model) ? {} : { output_config: { effort: 'low' } })
      }
      let content: (Anthropic.ContentBlock | Anthropic.Beta.BetaContentBlock)[]
      let stop: string | null
      try {
        const response = FALLBACK_MODELS.has(o.model)
          ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await client.messages.create(params)
        content = response.content
        stop = response.stop_reason
      } catch (err) {
        throw claudeError(err, o.model)
      }
      if (stop === 'refusal') throw new BotError('aiRefused')
      if (stop === 'max_tokens') throw new BotError('aiFailed')

      const calls: unknown[] = []
      const text: string[] = []
      for (const block of content) {
        if (block.type === 'tool_use' && block.name === RECORD_TOOL.name) calls.push(block.input)
        else if (block.type === 'text') text.push(block.text)
      }
      return fromCalls(calls, text.join('\n'))
    }
  }
}

function claudeError(err: unknown, model: string): unknown {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new BotError('aiKey')
  if (err instanceof Anthropic.NotFoundError) return new BotError('aiModel', { model: esc(model) })
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return new BotError('aiBusy')
  // A subclass of APIError in this SDK, so it's checked first.
  if (err instanceof Anthropic.APIConnectionError) return new BotError('aiBusy')
  if (err instanceof Anthropic.APIError) {
    console.error(`Claude request failed (${err.status}): ${err.message}`)
    return new BotError(err.status === 402 ? 'aiCredit' : 'aiFailed')
  }
  return err
}
