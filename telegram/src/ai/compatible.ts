// Any service with an OpenAI-style Chat Completions API: Gemini, DeepSeek, OpenRouter,
// and others such as Groq, Mistral or a model on your own computer.

import { RECORD_TOOL, systemPrompt } from './prompt'
import { fromCalls, parseArguments, postJson } from './shared'
import type { AiParser, ProviderOptions } from './types'

interface ChatMessage {
  content?: string | null
  tool_calls?: { type?: string; function?: { name?: string; arguments?: string } }[]
}

export function compatible(o: ProviderOptions): AiParser {
  return {
    async parse(message, context) {
      const data = (await postJson(
        `${o.baseUrl}/chat/completions`,
        o.apiKey,
        {
          model: o.model,
          messages: [
            { role: 'system', content: systemPrompt(context) },
            { role: 'user', content: message }
          ],
          tools: [{ type: 'function', function: { name: RECORD_TOOL.name, description: RECORD_TOOL.description, parameters: RECORD_TOOL.schema } }],
          tool_choice: 'auto'
        },
        o.model,
        o.headers
      )) as { choices?: { message?: ChatMessage }[] } | null

      const reply = data?.choices?.[0]?.message
      const calls = (reply?.tool_calls ?? []).filter((c) => c.function?.name === RECORD_TOOL.name).map((c) => parseArguments(c.function?.arguments))
      return fromCalls(calls, typeof reply?.content === 'string' ? reply.content : '')
    }
  }
}
