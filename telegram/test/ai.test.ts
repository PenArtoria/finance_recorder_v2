import { afterEach, describe, expect, it, vi } from 'vitest'
import { exampleData } from '../../windows/src/renderer/src/core/example'
import { createParser } from '../src/ai'
import { buildContext } from '../src/ai/context'
import type { Env } from '../src/env'

// Each provider is run against a stand-in for its API that records the request.

const context = buildContext(exampleData(), '2026-10-25')
const lunch = { type: 'spend', amount: 1200, currency: 'JPY', category: 'food', note: 'Lunch', from: 'bucket:ex-living' }

interface Seen {
  url: string
  headers: Headers
  body: any
}

function fakeApi(reply: (seen: Seen) => { status?: number; json: unknown }) {
  const seen: Seen[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const s = { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) }
    seen.push(s)
    const r = reply(s)
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  })
  return seen
}

const env = (vars: Partial<Env>) => ({ AI_API_KEY: 'test-key', ...vars }) as Env
const parser = (vars: Partial<Env>) => createParser(env(vars))!

const claudeMessage = (content: unknown[], stop_reason = 'tool_use') => ({
  json: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }
})

afterEach(() => vi.unstubAllGlobals())

describe('choosing a provider', () => {
  it('stays off until AI_PROVIDER and AI_API_KEY are set', () => {
    expect(createParser({} as Env)).toBeNull()
    expect(createParser({ AI_PROVIDER: 'claude' } as Env)).toBeNull()
  })

  it('explains unknown providers and missing settings', () => {
    expect(() => parser({ AI_PROVIDER: 'skynet' })).toThrow(expect.objectContaining({ key: 'unknownProvider' }))
    expect(() => parser({ AI_PROVIDER: 'openrouter' })).toThrow(expect.objectContaining({ key: 'aiSetup', params: { setting: 'AI_MODEL' } }))
    expect(() => parser({ AI_PROVIDER: 'custom', AI_MODEL: 'x' })).toThrow(expect.objectContaining({ key: 'aiSetup', params: { setting: 'AI_BASE_URL' } }))
  })
})

describe('claude', () => {
  it('sends the instructions, your names and the record tool, and reads the entries', async () => {
    const seen = fakeApi(() => claudeMessage([{ type: 'tool_use', id: 'toolu_1', name: 'record', input: { actions: [lunch] } }]))
    const result = await parser({ AI_PROVIDER: 'claude' }).parse('lunch 1200 yen from living', context)
    expect(result).toEqual({ kind: 'actions', actions: [lunch] })
    const { url, headers, body } = seen[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers.get('x-api-key') ?? headers.get('authorization')).toContain('test-key')
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.output_config).toEqual({ effort: 'low' })
    expect(body.fallbacks).toBeUndefined()
    expect(body.tools[0].name).toBe('record')
    expect(body.system).toContain('Today is 2026-10-25')
    expect(body.system).toContain('bucket:ex-living: "Living expenses", HKD')
    expect(body.system).not.toContain('18000')
    expect(body.messages).toEqual([{ role: 'user', content: 'lunch 1200 yen from living' }])
  })

  it('uses AI_MODEL, with server-side fallbacks on models that have them', async () => {
    const seen = fakeApi(() => claudeMessage([{ type: 'tool_use', id: 'toolu_1', name: 'record', input: { actions: [lunch] } }]))
    await parser({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-sonnet-5-5' }).parse('lunch', context)
    expect(seen[0].body.model).toBe('claude-sonnet-5-5')
    expect(seen[0].body.fallbacks).toBe('default')
    expect(seen[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  })

  it('passes a text answer on, and reports refusals, bad keys and unknown models', async () => {
    fakeApi(() => claudeMessage([{ type: 'text', text: 'I only record money.' }], 'end_turn'))
    await expect(parser({ AI_PROVIDER: 'claude' }).parse('hi', context)).resolves.toEqual({ kind: 'reply', text: 'I only record money.' })

    fakeApi(() => claudeMessage([], 'refusal'))
    await expect(parser({ AI_PROVIDER: 'claude' }).parse('x', context)).rejects.toMatchObject({ key: 'aiRefused' })

    fakeApi(() => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }))
    await expect(parser({ AI_PROVIDER: 'claude' }).parse('x', context)).rejects.toMatchObject({ key: 'aiKey' })

    fakeApi(() => ({ status: 404, json: { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } } }))
    await expect(parser({ AI_PROVIDER: 'claude', AI_MODEL: 'nope' }).parse('x', context)).rejects.toMatchObject({ key: 'aiModel', params: { model: 'nope' } })
  })
})

describe('openai', () => {
  it('uses the Responses API without storing the conversation', async () => {
    const seen = fakeApi(() => ({
      json: { output: [{ type: 'function_call', call_id: 'c1', name: 'record', arguments: JSON.stringify({ actions: [lunch] }) }] }
    }))
    const result = await parser({ AI_PROVIDER: 'openai' }).parse('lunch 1200 yen', context)
    expect(result).toEqual({ kind: 'actions', actions: [lunch] })
    const { url, headers, body } = seen[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(headers.get('authorization')).toBe('Bearer test-key')
    expect(body).toMatchObject({ model: 'gpt-6-luna', input: 'lunch 1200 yen', store: false })
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'record', strict: false })
    expect(body.instructions).toContain('Today is 2026-10-25')
  })

  it('passes a text answer on and reports an empty account', async () => {
    fakeApi(() => ({ json: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'What did you buy?' }] }] } }))
    await expect(parser({ AI_PROVIDER: 'openai' }).parse('x', context)).resolves.toEqual({ kind: 'reply', text: 'What did you buy?' })
    fakeApi(() => ({ status: 429, json: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } } }))
    await expect(parser({ AI_PROVIDER: 'openai' }).parse('x', context)).rejects.toMatchObject({ key: 'aiCredit' })
  })
})

describe('OpenAI-style providers', () => {
  const toolCall = (args: unknown) => ({ json: { choices: [{ message: { content: null, tool_calls: [{ type: 'function', function: { name: 'record', arguments: JSON.stringify(args) } }] } }] } })

  it('talks to Gemini with its default model', async () => {
    const seen = fakeApi(() => toolCall({ actions: [lunch] }))
    expect(await parser({ AI_PROVIDER: 'gemini' }).parse('昼ご飯 1200円', context)).toEqual({ kind: 'actions', actions: [lunch] })
    expect(seen[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(seen[0].body.model).toBe('gemini-3.5-flash-lite')
    expect(seen[0].body.messages[0]).toMatchObject({ role: 'system' })
    expect(seen[0].body.tools[0].function.name).toBe('record')
  })

  it('joins entries split over several tool calls', async () => {
    fakeApi(() => ({
      json: {
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'record', arguments: JSON.stringify({ actions: [lunch] }) } },
                { function: { name: 'record', arguments: JSON.stringify({ actions: [{ ...lunch, amount: 500 }] }) } }
              ]
            }
          }
        ]
      }
    }))
    const result = await parser({ AI_PROVIDER: 'deepseek' }).parse('x', context)
    expect(result.kind === 'actions' && result.actions.length).toBe(2)
  })

  it('works with OpenRouter and any other service', async () => {
    const seen = fakeApi(() => toolCall({ actions: [lunch] }))
    await parser({ AI_PROVIDER: 'openrouter', AI_MODEL: 'google/gemini-3.5-flash-lite' }).parse('x', context)
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen[0].body.model).toBe('google/gemini-3.5-flash-lite')
    await parser({ AI_PROVIDER: 'custom', AI_MODEL: 'llama-4', AI_BASE_URL: 'http://localhost:11434/v1/' }).parse('x', context)
    expect(seen[1].url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('rejects broken tool arguments and reports bad keys', async () => {
    fakeApi(() => ({ json: { choices: [{ message: { tool_calls: [{ function: { name: 'record', arguments: '{not json' } }] } }] } }))
    await expect(parser({ AI_PROVIDER: 'gemini' }).parse('x', context)).rejects.toMatchObject({ key: 'badAction' })
    fakeApi(() => ({ status: 400, json: { error: { message: 'API key not valid. Please pass a valid API key.' } } }))
    await expect(parser({ AI_PROVIDER: 'gemini' }).parse('x', context)).rejects.toMatchObject({ key: 'aiKey' })
  })
})
