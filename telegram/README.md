# Moneta Telegram bot

Tell a Telegram bot what you spent, earned, moved or traded, and it records it in Moneta for you. Your Windows and
phone apps pick the change up on their next sync.

```
You:  /spend 1200 lunch from Daily

Bot:  📝 Save this?
      ┃ 💸 Spend ¥1,200
      ┃ Food & drink · "lunch"
      ┃ From: Daily (SMBC)
      ┃ Left: ¥23,400
      ┃ Date: Today
      [✅ Save] [❌ Cancel]
```

- **Nothing is saved until you tap ✅ Save.** Every saved entry has an **↩️ Undo** button, and `/undo` undoes the last one.
- It uses Moneta's own logic, so buckets, their bank accounts, card budgets and average costs change exactly as they
  would in the app.
- If a name could mean several buckets or accounts, or none, it asks with buttons.
- It replies in English, Japanese or Chinese (Traditional or Simplified). It follows your Telegram language until
  you pick one with `/language`.
- Without AI it understands the commands below. Turn on an AI and you can also write normally
  ("lunch 1200 yen from daily", "transfer 700 dollars from Wise to IBKR"). Claude, OpenAI, Gemini, DeepSeek,
  OpenRouter and other OpenAI-style services all work, and switching is one setting. See [AI](#ai).

## Commands

| Command | Example |
|---|---|
| `/spend <amount> [currency] [note] [#category] [from <place>] [card <card>] [on <date>]` | `/spend 1200 JPY lunch #food from Daily card Visa on yesterday` |
| `/income <amount> [currency] [note] [#category] [to <place>] [on <date>]` | `/income 300000 salary #salary to SMBC` |
| `/move <amount> [currency] from <place> to <place>` | `/move 700 USD from Wise to IBKR` |
| `/buy <units> <holding> [at <price>] [fee <fee>] [from <place>] [on <date>]` | `/buy 3 VWRA at 140 fee 2 from IBKR` |
| `/buy <holding> for <total> [at <price>] …` | `/buy VWRA for 500 from IBKR` |
| `/sell <units> <holding> [at <price>] [fee <fee>] [to <place>] [on <date>]` | `/sell 1 RKLB at 70 to IBKR` |
| `/balances` | Net worth, investments (with live prices), bank accounts, buckets, other assets and cards |
| `/undo` | Undoes the last saved entry |
| `/language` | Picks the reply language, or goes back to following Telegram |
| `/help` | How to use the bot |

- **Places** are your buckets and bank accounts, by name or part of a name, in any language (`from daily`, `from 生活費`).
  Use `from none` for money that isn't in any tracked balance.
- **Leave the place out** and the bot uses the same one as last time (for spending, the same card too).
- **Amounts** can carry a currency: `1200`, `¥1200`, `1200円`, `HK$80`, `12.5 USD`. Without one, the entry uses the
  currency of its bucket or account.
- **Dates**: `today`, `yesterday`, `2026-10-24`, `10-24` or a day of this month (`24`). Without a date, it's today.
- **Categories**: `#food`, `#groceries`, `#transport`, `#shopping`, `#bills`, `#housing`, `#health`, `#fun`, `#travel`,
  `#education`, `#gifts`; for income `#salary`, `#bonus`, `#side`, `#dividend`, `#refund`.
- **Trades** without a price use the last price Moneta fetched. The holding has to exist in Moneta already.

New holdings, card bill payments and balance corrections are still done in the app.

## Privacy

Moneta's sync service only ever stores encrypted data. To change your data, the bot needs your sync key, so keep in
mind:

- The key is stored as a Cloudflare secret on **your** Cloudflare account. Anyone who can read your Worker's secrets
  can read your synced data.
- Messages to the bot pass through Telegram, which can read bot chats.
- If you turn on AI, your message and the **names** of your buckets, accounts, holdings and cards go to that AI
  company. Balances and history are never sent. With OpenRouter, the message also passes through OpenRouter.
- Entries waiting for ✅ and the undo history (7 days) are kept in the bot's D1 database, encrypted with your sync key.
- Only the Telegram users in `ALLOWED_USER_IDS` can use the bot. Everyone else gets no answer.

## Set it up

You need the Moneta sync service from [`../cloud`](../cloud) deployed, and sync turned on in Moneta.

In PowerShell, type `npx.cmd` and `curl.exe` instead of `npx` and `curl`.

1. **Make the bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot` and follow the steps.
   It gives you a token like `123456:ABC…`. Keep it private.

2. **Install and log in to Cloudflare** (the same account as the sync service):

   ```bash
   cd telegram
   npm install
   npx wrangler login
   ```

3. **Create the bot's database.** Put the `database_id` it prints into `wrangler.toml`, then create the tables:

   ```bash
   npx wrangler d1 create moneta-telegram
   npx wrangler d1 execute moneta-telegram --remote --file schema.sql
   ```

   If your sync Worker isn't named `moneta`, change `service` in `wrangler.toml` too.

4. **Deploy:**

   ```bash
   npx wrangler deploy
   ```

5. **Add the secrets.** Each command asks for the value:

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put MONETA_SYNC_KEY
   npx wrangler secret put TIMEZONE
   ```

   | Secret | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | The token from BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | Any random text of 16 or more letters, digits, `_` or `-`. Make one with `node -e "console.log(crypto.randomUUID().replaceAll('-', ''))"` |
   | `MONETA_SYNC_KEY` | In Moneta: **Settings → Sync → Show sync key** |
   | `TIMEZONE` | Your time zone, such as `Asia/Tokyo` or `Asia/Hong_Kong`, so "today" is your today |

6. **Connect the bot to Telegram.** Use your Worker's address from step 4 and your webhook secret:

   ```bash
   curl -X POST -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" https://moneta-telegram.YOUR-SUBDOMAIN.workers.dev/setup
   ```

   It answers `{"ok":true,…}` and sets up the bot's command menu. If `ok` is false, `telegram` or `sync`
   says whether the bot token or the sync key is wrong. Set that one again and run this again.

7. **Allow yourself.** Send your bot any message. It replies with your Telegram user id. Add it:

   ```bash
   npx wrangler secret put ALLOWED_USER_IDS
   ```

   For more than one person, separate the ids with commas. Send `/help` to start.

### Optional settings

| Setting | What it does |
|---|---|
| `LANGUAGE` | Reply in `en`, `ja`, `zh-Hant` or `zh-Hans` instead of each person's Telegram language. `/language` in a chat still wins |
| `SYNC_URL` | Address of a sync service on another Cloudflare account. Remove the `[[services]]` block from `wrangler.toml` to use it |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | See [AI](#ai) |

## AI

AI is optional. Without it, the bot answers normal messages with a reminder to use commands.

The AI only turns your message into entries. The bot then checks every entry, matches the names, works out the
amounts and asks you to confirm, so a wrong guess can't change your data unless you tap ✅. This also means a cheap
model is enough.

### Turn it on

Pick a company from the table, make an API key on its website (most need a card or some prepaid credit first) and
set two secrets:

```bash
npx wrangler secret put AI_PROVIDER     # e.g. claude
npx wrangler secret put AI_API_KEY      # the key from that company
```

| `AI_PROVIDER` | Company | Default model | Get a key at |
|---|---|---|---|
| `claude` | Anthropic | `claude-haiku-5-5` | console.anthropic.com |
| `openai` | OpenAI | `gpt-6-luna` | platform.openai.com |
| `gemini` | Google | `gemini-3.5-flash-lite` | aistudio.google.com |
| `deepseek` | DeepSeek | `deepseek-flash` | platform.deepseek.com |
| `openrouter` | OpenRouter: models from many companies with one key | none, set `AI_MODEL` (e.g. `google/gemini-3.5-flash-lite`) | openrouter.ai |
| `custom` | Any other OpenAI-style API (Groq, Mistral, a model on your own computer…) | none, set `AI_MODEL` and `AI_BASE_URL` | — |

Each default is that company's cheap model as of October 2026. Model names change often, so check the company's
model list if one stops working. The bot then says it doesn't know the model.

### Switch model or company

- **Another model from the same company:** set `AI_MODEL`, e.g. `claude-sonnet-5-5` or `claude-opus-5-5` for a
  stronger Claude. Delete it (`npx wrangler secret delete AI_MODEL`) to go back to the default.
- **Another company:** set `AI_PROVIDER` and `AI_API_KEY` again, and delete `AI_MODEL` if you had set one.
- **Not sure which to pick?** With OpenRouter one key and one balance cover models from Anthropic, OpenAI, Google,
  DeepSeek and others, so you can try several by changing only `AI_MODEL`.

Each change takes effect straight away, with no redeploy. If something is wrong (a bad key, no credit left, a model
name the company doesn't know), the bot tells you in the chat.

### How it works

[`src/ai`](src/ai) holds one file per kind of API, all sharing the same instructions and tool:

- [`index.ts`](src/ai/index.ts): the list of providers above. Add a company here.
- [`claude.ts`](src/ai/claude.ts): Claude, through Anthropic's official SDK.
- [`openai.ts`](src/ai/openai.ts): OpenAI's Responses API, with `store: false` so OpenAI doesn't keep the conversation.
- [`compatible.ts`](src/ai/compatible.ts): any OpenAI-style Chat Completions API (Gemini, DeepSeek, OpenRouter, custom).
- [`prompt.ts`](src/ai/prompt.ts): the instructions and the `record` tool the AI calls with the entries.
- [`context.ts`](src/ai/context.ts): what the AI is told about your data (names only).

## Develop

```bash
npm test            # unit tests
npm run typecheck
```

To try the bot locally, copy `.dev.vars.example` to `.dev.vars` and fill it in. Run the sync service in one
terminal (`npm run dev` in `../cloud`) and the bot in another (`npm run dev` here). The bot finds the local sync
service by itself. `TELEGRAM_API` can point the bot at a fake Telegram for testing.

Each saved entry downloads, decrypts and re-uploads all your synced data, the same as a sync from the apps. That is
quick for years of entries, but Cloudflare's free plan allows only a little CPU time per request. If saving ever starts
failing with a CPU-limit error, the Workers Paid plan removes that limit.
