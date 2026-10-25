import { describe, expect, it } from 'vitest'
import { botToken } from '../src/telegram'

const token = '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0'

describe('botToken', () => {
  it('keeps a token as it is, without spaces around it', () => {
    expect(botToken(token)).toBe(token)
    expect(botToken(`  ${token}\n`)).toBe(token)
  })

  it('finds the token in a pasted BotFather message', () => {
    expect(botToken(`Done! Use this token to access the HTTP API: ${token} Keep your token secure`)).toBe(token)
  })

  it('leaves other text alone, so Telegram can say it’s wrong', () => {
    expect(botToken('Done! Congratulations on your new bot.')).toBe('Done! Congratulations on your new bot.')
    expect(botToken(undefined)).toBe('')
  })
})
