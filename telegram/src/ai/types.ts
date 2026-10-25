import type { AiContext } from './context'

export type AiResult =
  /** Entries to record: the `actions` the AI passed to the record tool, not yet checked. */
  | { kind: 'actions'; actions: unknown[] }
  /** A short answer instead, e.g. a question back or "I can only record money". */
  | { kind: 'reply'; text: string }

export interface AiParser {
  parse(message: string, context: AiContext): Promise<AiResult>
}

export interface ProviderOptions {
  apiKey: string
  model: string
  /** API address, without a trailing slash. Claude uses its SDK's default when unset. */
  baseUrl?: string
  /** Extra HTTP headers the provider asks for. */
  headers?: Record<string, string>
}
