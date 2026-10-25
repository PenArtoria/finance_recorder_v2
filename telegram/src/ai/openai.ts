// OpenAI, through its Responses API (its newest models only call tools there).

import { RECORD_TOOL, systemPrompt } from './prompt'
import { fromCalls, parseArguments, postJson } from './shared'
import type { AiParser, ProviderOptions } from './types'

interface OutputItem {
  type: string
  name?: string
  arguments?: string
  content?: { type: string; text?: string }[]
}

export function openai(o: ProviderOptions): AiParser {
  return {
    async parse(message, context) {
      const data = (await postJson(
        `${o.baseUrl}/responses`,
        o.apiKey,
        {
          model: o.model,
          instructions: systemPrompt(context),
          input: message,
          // Every field but `type` is optional, which strict mode doesn't allow.
          tools: [{ type: 'function', name: RECORD_TOOL.name, description: RECORD_TOOL.description, parameters: RECORD_TOOL.schema, strict: false }],
          // Don't keep the conversation on OpenAI's side.
          store: false
        },
        o.model,
        o.headers
      )) as { output?: OutputItem[] } | null

      const calls: unknown[] = []
      const text: string[] = []
      for (const item of data?.output ?? []) {
        if (item.type === 'function_call' && item.name === RECORD_TOOL.name) calls.push(parseArguments(item.arguments))
        else if (item.type === 'message') for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) text.push(c.text)
      }
      return fromCalls(calls, text.join('\n'))
    }
  }
}
