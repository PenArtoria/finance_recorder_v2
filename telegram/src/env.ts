// Settings for the bot. Everything except the bindings is set with
// `npx wrangler secret put <NAME>` (or in .dev.vars when running locally).

export interface Env {
  /** Entries waiting for confirmation and the undo history. */
  DB: D1Database
  /** The Moneta sync service (../cloud), bound in wrangler.toml. */
  SYNC?: Fetcher
  /** Address of the sync service when it isn't bound, e.g. https://moneta.example.workers.dev */
  SYNC_URL?: string

  TELEGRAM_BOT_TOKEN: string
  /** Random text Telegram sends with every update, so nobody else can post to the bot. */
  TELEGRAM_WEBHOOK_SECRET: string
  /** Only for local testing against a fake Telegram. */
  TELEGRAM_API?: string
  /** Telegram user ids allowed to use the bot, separated by commas. */
  ALLOWED_USER_IDS?: string

  /** The sync key from Moneta → Settings → Sync → Show sync key. */
  MONETA_SYNC_KEY: string
  /** IANA time zone used for "today", e.g. Asia/Tokyo. Defaults to UTC. */
  TIMEZONE?: string
  /** Reply language (en, ja, zh-Hant, zh-Hans). Defaults to each user's Telegram language. */
  LANGUAGE?: string

  /** Which AI reads normal messages (see src/ai/index.ts). Leave empty to use commands only. */
  AI_PROVIDER?: string
  AI_API_KEY?: string
  /** Model to use instead of the provider's default. */
  AI_MODEL?: string
  /** API address instead of the provider's own, for `custom` or a proxy. */
  AI_BASE_URL?: string
}

export function allowedUsers(env: Env): Set<number> {
  return new Set(
    (env.ALLOWED_USER_IDS ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  )
}

/** Today's date, YYYY-MM-DD, in the bot's time zone. */
export function todayIn(env: Env, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** An error with a message meant for the person chatting. `key` picks the translated text. */
export class BotError extends Error {
  constructor(
    public key: string,
    public params: Record<string, string> = {}
  ) {
    super(key)
  }
}
