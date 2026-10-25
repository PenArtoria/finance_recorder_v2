// Everything the bot says. To add a language, copy `en`, translate it, add it to
// LANGS and teach `pickLang` its Telegram language codes.
//
// Values passed to the line functions are already HTML-escaped.

export type Lang = 'en' | 'ja' | 'zh-Hant' | 'zh-Hans'

export const MENU = ['spend', 'income', 'move', 'buy', 'sell', 'balances', 'undo', 'help'] as const
export type MenuCommand = (typeof MENU)[number]

export interface SpendLine {
  amount: string
  category: string
  note?: string
  from?: string
  card?: string
  date: string
  left?: string
}

export interface IncomeLine {
  amount: string
  category: string
  note?: string
  to?: string
  date: string
  left?: string
}

export interface MoveLine {
  amount: string
  from: string
  to: string
  /** Set when the other side gets a different currency. */
  received?: string
}

export interface TradeLine {
  side: 'buy' | 'sell'
  quantity: string
  holding: string
  price: string
  fee?: string
  total: string
  cash?: string
  date: string
  left?: string
}

export type ErrorKey =
  | 'noSyncKey'
  | 'badSyncKey'
  | 'noSyncService'
  | 'syncOffline'
  | 'noData'
  | 'syncFailed'
  | 'syncBusy'
  | 'dataTooBig'
  | 'newerData'
  | 'gone'
  | 'noHolding'
  | 'noPrice'
  | 'needQuantity'
  | 'notEnoughUnits'
  | 'noRate'
  | 'sameSource'
  | 'badAction'
  | 'tooLong'
  | 'aiFailed'
  | 'aiKey'
  | 'aiCredit'
  | 'aiBusy'
  | 'aiModel'
  | 'aiRefused'
  | 'aiSetup'
  | 'unknownProvider'
  | 'generic'

export interface Strings {
  /** BCP 47 locale for dates. */
  locale: string
  confirm: string
  save: string
  cancel: string
  undo: string
  saved: string
  cancelled: string
  undone: string
  expired: string
  nothingToUndo: string
  notTracked: string
  noCash: string
  today: string
  onlyText: string
  noAi: string
  help: (ai: boolean) => string
  privateBot: (id: string) => string
  askFrom: string
  askTo: string
  askCash: (side: 'buy' | 'sell') => string
  whichOne: (query: string) => string
  cantFind: (query: string) => string
  /** Command descriptions for Telegram's menu. */
  menu: Record<MenuCommand, string>
  balances: string
  buckets: string
  accounts: string
  unassigned: (amount: string) => string
  noBalances: string
  usage: Record<'spend' | 'income' | 'move' | 'buy' | 'sell', string>
  errors: Record<ErrorKey, (p: Record<string, string>) => string>
  spend: (l: SpendLine) => string
  income: (l: IncomeLine) => string
  move: (l: MoveLine) => string
  trade: (l: TradeLine) => string
}

const tail = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ')

const en: Strings = {
  locale: 'en-GB',
  confirm: 'Save this?',
  save: '✅ Save',
  cancel: '❌ Cancel',
  undo: '↩️ Undo',
  saved: 'Saved ✅',
  cancelled: 'Cancelled.',
  undone: 'Undone ↩️',
  expired: 'This has expired. Please send it again.',
  nothingToUndo: 'There’s nothing to undo.',
  notTracked: 'Not from a tracked balance',
  noCash: 'no cash moved',
  today: 'today',
  onlyText: 'Please send text. Photos and voice messages aren’t supported yet.',
  noAi: 'AI isn’t set up yet, so I only understand commands for now. For example:\n<code>/spend 1200 lunch from Daily</code>\n\nSend /help to see them all.',
  help: (ai) =>
    (ai
      ? 'Tell me what you spent, earned, moved or traded, in your own words. For example:\n• <i>lunch 1200 yen from daily</i>\n• <i>salary 300000 into SMBC</i>\n• <i>transfer 700 dollars from Wise to IBKR</i>\n• <i>bought 3 VWRA at 140, fee 2</i>\n\nI always show you what I understood before saving.\n\n'
      : '') +
    '<b>Commands</b>\n' +
    '<code>/spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24</code>\n' +
    '<code>/income 300000 salary #salary to SMBC</code>\n' +
    '<code>/move 700 USD from Wise to IBKR</code>\n' +
    '<code>/buy 3 VWRA at 140 fee 2 from IBKR</code>\n' +
    '<code>/buy VWRA for 500 from IBKR</code>\n' +
    '<code>/sell 1 RKLB at 70 to IBKR</code>\n' +
    '/balances — buckets and accounts\n' +
    '/undo — undo the last saved entry\n\n' +
    'Only the amount is required for /spend and /income. Without <code>from</code> or <code>to</code>, I use the same place as last time.',
  privateBot: (id) =>
    `This is a private bot.\n\nIf it’s yours, your Telegram user id is <code>${id}</code>. Add it with:\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: 'Where did the money come from?',
  askTo: 'Where did the money go?',
  askCash: (side) => (side === 'buy' ? 'Which account paid for it?' : 'Which account got the money?'),
  whichOne: (q) => `Which one is “${q}”?`,
  cantFind: (q) => `I can’t find “${q}”. Which one is it?`,
  menu: { spend: 'Record spending', income: 'Record income', move: 'Move money between buckets or accounts', buy: 'Record a buy', sell: 'Record a sale', balances: 'Show buckets and accounts', undo: 'Undo the last entry', help: 'How to use the bot' },
  balances: 'Balances',
  buckets: 'Buckets',
  accounts: 'Accounts',
  unassigned: (a) => `${a} unassigned`,
  noBalances: 'You have no buckets or bank accounts yet. Add them in Moneta first.',
  usage: {
    spend: 'Try: <code>/spend 1200 lunch from Daily</code>',
    income: 'Try: <code>/income 300000 salary to SMBC</code>',
    move: 'Try: <code>/move 700 from Wise to IBKR</code>',
    buy: 'Try: <code>/buy 3 VWRA at 140</code> or <code>/buy VWRA for 500</code>',
    sell: 'Try: <code>/sell 3 VWRA at 150</code>'
  },
  errors: {
    noSyncKey: () => 'The bot has no sync key yet. Set MONETA_SYNC_KEY (see the README).',
    badSyncKey: () => 'The sync key doesn’t work. Copy it again from Moneta → Settings → Sync → Show sync key.',
    noSyncService: () => 'The bot can’t find the sync service. Check the SYNC binding or SYNC_URL.',
    syncOffline: () => 'I can’t reach the sync service right now. Please try again in a moment.',
    noData: () => 'No synced data was found. Turn on sync in Moneta first.',
    syncFailed: (p) => `Syncing failed (${p.status}). Please try again.`,
    syncBusy: () => 'Another device kept saving at the same time. Please try again.',
    dataTooBig: () => 'Your Moneta data is over the 2 MB the sync service can store, so this wasn’t saved. Nothing was changed.',
    newerData: () => 'Your data was saved by a newer Moneta. Update and redeploy the bot first.',
    gone: () => 'Something this needs was deleted in Moneta in the meantime. Please send it again.',
    noHolding: (p) => `“${p.query}” isn’t in your holdings. Add it in Moneta first.${p.names ? ` You hold: ${p.names}` : ''}`,
    noPrice: (p) => `I don’t know the price of ${p.holding}. Tell me the price per unit.`,
    needQuantity: () => 'Tell me how many units, or how much in total.',
    notEnoughUnits: (p) => `You only hold ${p.have} ${p.holding}.`,
    noRate: (p) => `There’s no exchange rate for ${p.currency} yet. Open Moneta once so it can fetch rates.`,
    sameSource: () => 'The money has to move to a different place.',
    badAction: () => 'I couldn’t make sense of that. Please try saying it another way.',
    tooLong: () => 'That message is too long. Please send one thing at a time.',
    aiFailed: () => 'The AI didn’t answer. Please try again, or use a command (/help).',
    aiKey: () => 'The AI company rejected the API key. Check AI_API_KEY, and that AI_PROVIDER is the same company.',
    aiCredit: () => 'The AI account is out of credit. Add credit with the AI company, or use a command (/help).',
    aiBusy: () => 'The AI is busy or can’t be reached right now. Please try again in a moment, or use a command (/help).',
    aiModel: (p) => `The AI company doesn’t know the model “${p.model}”. Check AI_MODEL.`,
    aiRefused: () => 'The AI wouldn’t read that message. Try saying it another way, or use a command (/help).',
    aiSetup: (p) => `AI isn’t fully set up: ${p.setting} is missing. See the README.`,
    unknownProvider: (p) => `AI_PROVIDER “${p.provider}” isn’t supported. Use one of: ${p.names}.`,
    generic: () => 'Something went wrong. Please try again.'
  },
  spend: (l) => `💸 <b>${l.amount}</b> ${tail([l.category, l.note && `“${l.note}”`, l.date])}\n    ${[l.card && `on ${l.card}`, l.from ? `from ${l.from}` : !l.card && 'not from a tracked balance'].filter(Boolean).join(', ')}${l.left ? ` → ${l.left} left` : ''}`,
  income: (l) => `💰 <b>+${l.amount}</b> ${tail([l.category, l.note && `“${l.note}”`, l.date])}\n    ${l.to ? `into ${l.to}` : 'not into a tracked balance'}${l.left ? ` → ${l.left}` : ''}`,
  move: (l) => `🔁 <b>${l.amount}</b> from ${l.from} to ${l.to}${l.received ? ` (${l.received} arrives)` : ''}`,
  trade: (l) =>
    `${l.side === 'buy' ? '📈 Buy' : '📉 Sell'} <b>${l.quantity} ${l.holding}</b> at ${l.price}${l.fee ? ` + ${l.fee} fee` : ''} = <b>${l.total}</b> · ${l.date}\n    ${l.cash ? `${l.side === 'buy' ? 'from' : 'to'} ${l.cash}${l.left ? ` → ${l.left} left` : ''}` : 'no cash moved'}`
}

const ja: Strings = {
  locale: 'ja-JP',
  confirm: 'この内容で記録しますか？',
  save: '✅ 記録する',
  cancel: '❌ キャンセル',
  undo: '↩️ 取り消す',
  saved: '記録しました ✅',
  cancelled: 'キャンセルしました。',
  undone: '取り消しました ↩️',
  expired: '有効期限が切れました。もう一度送ってください。',
  nothingToUndo: '取り消せる記録はありません。',
  notTracked: '管理していない残高から',
  noCash: '現金の移動なし',
  today: '今日',
  onlyText: 'テキストで送ってください。写真や音声にはまだ対応していません。',
  noAi: 'AIがまだ設定されていないため、今はコマンドだけ使えます。例：\n<code>/spend 1200 lunch from Daily</code>\n\n/help で一覧を表示します。',
  help: (ai) =>
    (ai
      ? '使ったお金・入ったお金・移動・売買を、普段の言葉で送ってください。例：\n• <i>昼ご飯 1200円 Dailyから</i>\n• <i>給料 300000 SMBCに</i>\n• <i>Wiseから IBKRへ 700ドル送金</i>\n• <i>VWRAを140で3株買った、手数料2</i>\n\n記録する前に、必ず内容を確認できます。\n\n'
      : '') +
    '<b>コマンド</b>\n' +
    '<code>/spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24</code>\n' +
    '<code>/income 300000 salary #salary to SMBC</code>\n' +
    '<code>/move 700 USD from Wise to IBKR</code>\n' +
    '<code>/buy 3 VWRA at 140 fee 2 from IBKR</code>\n' +
    '<code>/buy VWRA for 500 from IBKR</code>\n' +
    '<code>/sell 1 RKLB at 70 to IBKR</code>\n' +
    '/balances — バケットと口座の残高\n' +
    '/undo — 最後の記録を取り消す\n\n' +
    '/spend と /income は金額だけでも使えます。<code>from</code> や <code>to</code> がない場合は前回と同じ場所を使います。',
  privateBot: (id) =>
    `これは個人用のボットです。\n\nあなたのボットなら、Telegram ユーザーIDは <code>${id}</code> です。次のコマンドで追加してください：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: 'どこから支払いましたか？',
  askTo: 'どこに入りましたか？',
  askCash: (side) => (side === 'buy' ? 'どの口座から支払いましたか？' : 'どの口座に入りましたか？'),
  whichOne: (q) => `「${q}」はどれですか？`,
  cantFind: (q) => `「${q}」が見つかりません。どれですか？`,
  menu: { spend: '支出を記録', income: '収入を記録', move: 'バケットや口座の間でお金を移動', buy: '購入を記録', sell: '売却を記録', balances: 'バケットと口座の残高を表示', undo: '最後の記録を取り消す', help: '使い方' },
  balances: '残高',
  buckets: 'バケット',
  accounts: '口座',
  unassigned: (a) => `未割り当て ${a}`,
  noBalances: 'バケットや銀行口座がまだありません。先に Moneta で追加してください。',
  usage: {
    spend: '例：<code>/spend 1200 lunch from Daily</code>',
    income: '例：<code>/income 300000 salary to SMBC</code>',
    move: '例：<code>/move 700 from Wise to IBKR</code>',
    buy: '例：<code>/buy 3 VWRA at 140</code> または <code>/buy VWRA for 500</code>',
    sell: '例：<code>/sell 3 VWRA at 150</code>'
  },
  errors: {
    noSyncKey: () => '同期キーが設定されていません。MONETA_SYNC_KEY を設定してください（README を参照）。',
    badSyncKey: () => '同期キーが正しくありません。Moneta → 設定 → 同期 → 同期キーを表示 から、もう一度コピーしてください。',
    noSyncService: () => '同期サービスが見つかりません。SYNC バインディングか SYNC_URL を確認してください。',
    syncOffline: () => '同期サービスに接続できません。少し待ってからもう一度お試しください。',
    noData: () => '同期データが見つかりません。先に Moneta で同期をオンにしてください。',
    syncFailed: (p) => `同期に失敗しました（${p.status}）。もう一度お試しください。`,
    syncBusy: () => '他の端末が同時に保存していました。もう一度お試しください。',
    dataTooBig: () => 'Moneta のデータが同期サービスに保存できる 2 MB を超えたため、記録できませんでした。何も変更されていません。',
    newerData: () => 'データが新しいバージョンの Moneta で保存されています。先にボットを更新してデプロイし直してください。',
    gone: () => 'その間に Moneta で必要な項目が削除されました。もう一度送ってください。',
    noHolding: (p) => `「${p.query}」は保有銘柄にありません。先に Moneta で追加してください。${p.names ? `保有銘柄：${p.names}` : ''}`,
    noPrice: (p) => `${p.holding} の価格がわかりません。1単位あたりの価格を教えてください。`,
    needQuantity: () => '数量か合計金額を教えてください。',
    notEnoughUnits: (p) => `${p.holding} の保有数は ${p.have} だけです。`,
    noRate: (p) => `${p.currency} の為替レートがまだありません。一度 Moneta を開いてレートを取得してください。`,
    sameSource: () => '移動先は移動元と別の場所にしてください。',
    badAction: () => '内容がよくわかりませんでした。別の言い方で送ってみてください。',
    tooLong: () => 'メッセージが長すぎます。ひとつずつ送ってください。',
    aiFailed: () => 'AI から応答がありませんでした。もう一度試すか、コマンドを使ってください（/help）。',
    aiKey: () => 'AI の会社に API キーを拒否されました。AI_API_KEY と、AI_PROVIDER が同じ会社かを確認してください。',
    aiCredit: () => 'AI のアカウントの残高がありません。AI の会社でクレジットを追加するか、コマンドを使ってください（/help）。',
    aiBusy: () => 'AI が混み合っているか、接続できません。少し待ってからもう一度試すか、コマンドを使ってください（/help）。',
    aiModel: (p) => `AI の会社がモデル「${p.model}」を認識しません。AI_MODEL を確認してください。`,
    aiRefused: () => 'AI がこのメッセージを処理しませんでした。言い方を変えるか、コマンドを使ってください（/help）。',
    aiSetup: (p) => `AI の設定が足りません：${p.setting} がありません。README を確認してください。`,
    unknownProvider: (p) => `AI_PROVIDER「${p.provider}」には対応していません。使えるもの：${p.names}`,
    generic: () => 'エラーが発生しました。もう一度お試しください。'
  },
  spend: (l) => `💸 <b>${l.amount}</b> ${tail([l.category, l.note && `「${l.note}」`, l.date])}\n    ${[l.card && `${l.card}で`, l.from ? `${l.from}から` : !l.card && '管理していない残高から'].filter(Boolean).join('、')}${l.left ? ` → 残り ${l.left}` : ''}`,
  income: (l) => `💰 <b>+${l.amount}</b> ${tail([l.category, l.note && `「${l.note}」`, l.date])}\n    ${l.to ? `${l.to}へ` : '管理していない残高へ'}${l.left ? ` → ${l.left}` : ''}`,
  move: (l) => `🔁 <b>${l.amount}</b> ${l.from} → ${l.to}${l.received ? `（${l.received} が入金）` : ''}`,
  trade: (l) =>
    `${l.side === 'buy' ? '📈 買い' : '📉 売り'} <b>${l.holding} ${l.quantity}</b> @ ${l.price}${l.fee ? ` ＋ 手数料 ${l.fee}` : ''} = <b>${l.total}</b> · ${l.date}\n    ${l.cash ? `${l.cash}${l.side === 'buy' ? 'から' : 'へ'}${l.left ? ` → 残り ${l.left}` : ''}` : '現金の移動なし'}`
}

const zhHant: Strings = {
  locale: 'zh-Hant',
  confirm: '要記錄這些嗎？',
  save: '✅ 記錄',
  cancel: '❌ 取消',
  undo: '↩️ 復原',
  saved: '已記錄 ✅',
  cancelled: '已取消。',
  undone: '已復原 ↩️',
  expired: '已經過期，請再傳一次。',
  nothingToUndo: '沒有可以復原的記錄。',
  notTracked: '不從已記錄的餘額扣',
  noCash: '沒有現金變動',
  today: '今天',
  onlyText: '請傳文字。暫時不支援相片和語音。',
  noAi: '還沒有設定 AI，所以現在只看得懂指令。例如：\n<code>/spend 1200 lunch from Daily</code>\n\n傳 /help 查看全部指令。',
  help: (ai) =>
    (ai
      ? '用你平時的說法告訴我你花了、收了、轉了或買賣了甚麼。例如：\n• <i>午餐 1200 日圓 從 Daily</i>\n• <i>薪水 300000 存入 SMBC</i>\n• <i>從 Wise 轉 700 美元到 IBKR</i>\n• <i>以 140 買了 3 股 VWRA，手續費 2</i>\n\n記錄前我一定會先給你確認。\n\n'
      : '') +
    '<b>指令</b>\n' +
    '<code>/spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24</code>\n' +
    '<code>/income 300000 salary #salary to SMBC</code>\n' +
    '<code>/move 700 USD from Wise to IBKR</code>\n' +
    '<code>/buy 3 VWRA at 140 fee 2 from IBKR</code>\n' +
    '<code>/buy VWRA for 500 from IBKR</code>\n' +
    '<code>/sell 1 RKLB at 70 to IBKR</code>\n' +
    '/balances — 各個資金桶和戶口的餘額\n' +
    '/undo — 復原上一筆記錄\n\n' +
    '/spend 和 /income 只需要金額。沒有寫 <code>from</code> 或 <code>to</code> 的話，會用上次的地方。',
  privateBot: (id) =>
    `這是私人機械人。\n\n如果這是你的機械人，你的 Telegram 用戶 ID 是 <code>${id}</code>。用這個指令加入：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: '錢是從哪裡出的？',
  askTo: '錢存到哪裡？',
  askCash: (side) => (side === 'buy' ? '用哪個戶口付款？' : '錢存入哪個戶口？'),
  whichOne: (q) => `「${q}」是哪一個？`,
  cantFind: (q) => `找不到「${q}」，是哪一個？`,
  menu: { spend: '記錄支出', income: '記錄收入', move: '在資金桶或戶口之間轉帳', buy: '記錄買入', sell: '記錄賣出', balances: '查看資金桶和戶口餘額', undo: '復原上一筆記錄', help: '使用說明' },
  balances: '餘額',
  buckets: '資金桶',
  accounts: '戶口',
  unassigned: (a) => `未分配 ${a}`,
  noBalances: '你還沒有資金桶或銀行戶口。請先在 Moneta 加入。',
  usage: {
    spend: '試試：<code>/spend 1200 lunch from Daily</code>',
    income: '試試：<code>/income 300000 salary to SMBC</code>',
    move: '試試：<code>/move 700 from Wise to IBKR</code>',
    buy: '試試：<code>/buy 3 VWRA at 140</code> 或 <code>/buy VWRA for 500</code>',
    sell: '試試：<code>/sell 3 VWRA at 150</code>'
  },
  errors: {
    noSyncKey: () => '機械人還沒有同步金鑰。請設定 MONETA_SYNC_KEY（見 README）。',
    badSyncKey: () => '同步金鑰無效。請到 Moneta → 設定 → 同步 → 顯示同步金鑰，再複製一次。',
    noSyncService: () => '找不到同步服務。請檢查 SYNC 綁定或 SYNC_URL。',
    syncOffline: () => '暫時連不上同步服務，請稍後再試。',
    noData: () => '找不到同步資料。請先在 Moneta 開啟同步。',
    syncFailed: (p) => `同步失敗（${p.status}），請再試一次。`,
    syncBusy: () => '其他裝置同時在儲存，請再試一次。',
    dataTooBig: () => '你的 Moneta 資料已超過同步服務可儲存的 2 MB，所以沒有記錄。資料沒有任何改動。',
    newerData: () => '你的資料是由較新版本的 Moneta 儲存的。請先更新並重新部署機械人。',
    gone: () => '這段時間內，需要用到的項目在 Moneta 被刪除了。請再傳一次。',
    noHolding: (p) => `你的持倉中沒有「${p.query}」。請先在 Moneta 加入。${p.names ? `你持有：${p.names}` : ''}`,
    noPrice: (p) => `我不知道 ${p.holding} 的價格。請告訴我每單位的價格。`,
    needQuantity: () => '請告訴我數量，或者總金額。',
    notEnoughUnits: (p) => `你只持有 ${p.have} ${p.holding}。`,
    noRate: (p) => `還沒有 ${p.currency} 的匯率。請先開一次 Moneta 讓它取得匯率。`,
    sameSource: () => '錢要轉去另一個地方。',
    badAction: () => '我看不明白，請換個說法再試。',
    tooLong: () => '訊息太長了，請一次傳一件事。',
    aiFailed: () => 'AI 沒有回應。請再試一次，或使用指令（/help）。',
    aiKey: () => 'AI 公司拒絕了 API 金鑰。請檢查 AI_API_KEY，以及 AI_PROVIDER 是否同一間公司。',
    aiCredit: () => 'AI 帳戶的額度用完了。請到 AI 公司增值，或使用指令（/help）。',
    aiBusy: () => 'AI 現在太忙或連不上。請稍後再試，或使用指令（/help）。',
    aiModel: (p) => `AI 公司不認識模型「${p.model}」。請檢查 AI_MODEL。`,
    aiRefused: () => 'AI 沒有處理這則訊息。請換個說法，或使用指令（/help）。',
    aiSetup: (p) => `AI 還沒設定好：缺少 ${p.setting}。請看 README。`,
    unknownProvider: (p) => `不支援 AI_PROVIDER「${p.provider}」。可用的有：${p.names}`,
    generic: () => '出了點問題，請再試一次。'
  },
  spend: (l) => `💸 <b>${l.amount}</b> ${tail([l.category, l.note && `「${l.note}」`, l.date])}\n    ${[l.card && `用 ${l.card}`, l.from ? `從 ${l.from}` : !l.card && '不從已記錄的餘額扣'].filter(Boolean).join('，')}${l.left ? ` → 剩 ${l.left}` : ''}`,
  income: (l) => `💰 <b>+${l.amount}</b> ${tail([l.category, l.note && `「${l.note}」`, l.date])}\n    ${l.to ? `存入 ${l.to}` : '不存入已記錄的餘額'}${l.left ? ` → ${l.left}` : ''}`,
  move: (l) => `🔁 <b>${l.amount}</b> 由 ${l.from} 轉到 ${l.to}${l.received ? `（到帳 ${l.received}）` : ''}`,
  trade: (l) =>
    `${l.side === 'buy' ? '📈 買入' : '📉 賣出'} <b>${l.quantity} ${l.holding}</b> @ ${l.price}${l.fee ? ` ＋ 手續費 ${l.fee}` : ''} = <b>${l.total}</b> · ${l.date}\n    ${l.cash ? `${l.side === 'buy' ? '從' : '存入'} ${l.cash}${l.left ? ` → 剩 ${l.left}` : ''}` : '沒有現金變動'}`
}

const zhHans: Strings = {
  ...zhHant,
  locale: 'zh-Hans',
  confirm: '要记录这些吗？',
  save: '✅ 记录',
  undo: '↩️ 撤销',
  saved: '已记录 ✅',
  undone: '已撤销 ↩️',
  expired: '已经过期，请再发一次。',
  nothingToUndo: '没有可以撤销的记录。',
  notTracked: '不从已记录的余额扣',
  noCash: '没有现金变动',
  onlyText: '请发文字。暂时不支持图片和语音。',
  noAi: '还没有设置 AI，所以现在只能看懂指令。例如：\n<code>/spend 1200 lunch from Daily</code>\n\n发送 /help 查看全部指令。',
  help: (ai) =>
    (ai
      ? '用你平时的说法告诉我你花了、收了、转了或买卖了什么。例如：\n• <i>午饭 1200 日元 从 Daily</i>\n• <i>工资 300000 存入 SMBC</i>\n• <i>从 Wise 转 700 美元到 IBKR</i>\n• <i>以 140 买了 3 股 VWRA，手续费 2</i>\n\n记录前我一定会先让你确认。\n\n'
      : '') +
    '<b>指令</b>\n' +
    '<code>/spend 1200 JPY lunch #food from Daily card Visa on 2026-10-24</code>\n' +
    '<code>/income 300000 salary #salary to SMBC</code>\n' +
    '<code>/move 700 USD from Wise to IBKR</code>\n' +
    '<code>/buy 3 VWRA at 140 fee 2 from IBKR</code>\n' +
    '<code>/buy VWRA for 500 from IBKR</code>\n' +
    '<code>/sell 1 RKLB at 70 to IBKR</code>\n' +
    '/balances — 各个资金桶和账户的余额\n' +
    '/undo — 撤销上一笔记录\n\n' +
    '/spend 和 /income 只需要金额。没有写 <code>from</code> 或 <code>to</code> 的话，会用上次的地方。',
  privateBot: (id) =>
    `这是私人机器人。\n\n如果这是你的机器人，你的 Telegram 用户 ID 是 <code>${id}</code>。用这个指令添加：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: '钱是从哪里出的？',
  askTo: '钱存到哪里？',
  askCash: (side) => (side === 'buy' ? '用哪个账户付款？' : '钱存入哪个账户？'),
  whichOne: (q) => `“${q}”是哪一个？`,
  cantFind: (q) => `找不到“${q}”，是哪一个？`,
  menu: { spend: '记录支出', income: '记录收入', move: '在资金桶或账户之间转账', buy: '记录买入', sell: '记录卖出', balances: '查看资金桶和账户余额', undo: '撤销上一笔记录', help: '使用说明' },
  balances: '余额',
  buckets: '资金桶',
  accounts: '账户',
  unassigned: (a) => `未分配 ${a}`,
  noBalances: '你还没有资金桶或银行账户。请先在 Moneta 添加。',
  usage: {
    spend: '试试：<code>/spend 1200 lunch from Daily</code>',
    income: '试试：<code>/income 300000 salary to SMBC</code>',
    move: '试试：<code>/move 700 from Wise to IBKR</code>',
    buy: '试试：<code>/buy 3 VWRA at 140</code> 或 <code>/buy VWRA for 500</code>',
    sell: '试试：<code>/sell 3 VWRA at 150</code>'
  },
  errors: {
    noSyncKey: () => '机器人还没有同步密钥。请设置 MONETA_SYNC_KEY（见 README）。',
    badSyncKey: () => '同步密钥无效。请到 Moneta → 设置 → 同步 → 显示同步密钥，再复制一次。',
    noSyncService: () => '找不到同步服务。请检查 SYNC 绑定或 SYNC_URL。',
    syncOffline: () => '暂时连不上同步服务，请稍后再试。',
    noData: () => '找不到同步数据。请先在 Moneta 打开同步。',
    syncFailed: (p) => `同步失败（${p.status}），请再试一次。`,
    syncBusy: () => '其他设备同时在保存，请再试一次。',
    dataTooBig: () => '你的 Moneta 数据已超过同步服务可保存的 2 MB，所以没有记录。数据没有任何改动。',
    newerData: () => '你的数据是由较新版本的 Moneta 保存的。请先更新并重新部署机器人。',
    gone: () => '这段时间内，需要用到的项目在 Moneta 被删除了。请再发一次。',
    noHolding: (p) => `你的持仓中没有“${p.query}”。请先在 Moneta 添加。${p.names ? `你持有：${p.names}` : ''}`,
    noPrice: (p) => `我不知道 ${p.holding} 的价格。请告诉我每单位的价格。`,
    needQuantity: () => '请告诉我数量，或者总金额。',
    notEnoughUnits: (p) => `你只持有 ${p.have} ${p.holding}。`,
    noRate: (p) => `还没有 ${p.currency} 的汇率。请先打开一次 Moneta 让它获取汇率。`,
    sameSource: () => '钱要转到另一个地方。',
    badAction: () => '我看不明白，请换个说法再试。',
    tooLong: () => '消息太长了，请一次发一件事。',
    aiFailed: () => 'AI 没有回应。请再试一次，或使用指令（/help）。',
    aiKey: () => 'AI 公司拒绝了 API 密钥。请检查 AI_API_KEY，以及 AI_PROVIDER 是否同一家公司。',
    aiCredit: () => 'AI 账户的额度用完了。请到 AI 公司充值，或使用指令（/help）。',
    aiBusy: () => 'AI 现在太忙或连不上。请稍后再试，或使用指令（/help）。',
    aiModel: (p) => `AI 公司不认识模型“${p.model}”。请检查 AI_MODEL。`,
    aiRefused: () => 'AI 没有处理这条消息。请换个说法，或使用指令（/help）。',
    aiSetup: (p) => `AI 还没设置好：缺少 ${p.setting}。请看 README。`,
    unknownProvider: (p) => `不支持 AI_PROVIDER“${p.provider}”。可用的有：${p.names}`,
    generic: () => '出了点问题，请再试一次。'
  },
  spend: (l) => `💸 <b>${l.amount}</b> ${tail([l.category, l.note && `“${l.note}”`, l.date])}\n    ${[l.card && `用 ${l.card}`, l.from ? `从 ${l.from}` : !l.card && '不从已记录的余额扣'].filter(Boolean).join('，')}${l.left ? ` → 剩 ${l.left}` : ''}`,
  income: (l) => `💰 <b>+${l.amount}</b> ${tail([l.category, l.note && `“${l.note}”`, l.date])}\n    ${l.to ? `存入 ${l.to}` : '不存入已记录的余额'}${l.left ? ` → ${l.left}` : ''}`,
  move: (l) => `🔁 <b>${l.amount}</b> 从 ${l.from} 转到 ${l.to}${l.received ? `（到账 ${l.received}）` : ''}`,
  trade: (l) =>
    `${l.side === 'buy' ? '📈 买入' : '📉 卖出'} <b>${l.quantity} ${l.holding}</b> @ ${l.price}${l.fee ? ` ＋ 手续费 ${l.fee}` : ''} = <b>${l.total}</b> · ${l.date}\n    ${l.cash ? `${l.side === 'buy' ? '从' : '存入'} ${l.cash}${l.left ? ` → 剩 ${l.left}` : ''}` : '没有现金变动'}`
}

export const LANGS: Record<Lang, Strings> = { en, ja, 'zh-Hant': zhHant, 'zh-Hans': zhHans }

/** Picks the reply language: LANGUAGE if set, else the person's Telegram language. */
export function pickLang(forced: string | undefined, telegramCode: string | undefined): Strings {
  const code = (forced || telegramCode || 'en').toLowerCase()
  if (code.startsWith('ja')) return ja
  if (code.startsWith('zh')) {
    // Telegram sends zh-hans / zh-hant, other clients zh-cn / zh-tw / zh-hk.
    return /hant|tw|hk|mo/.test(code) ? zhHant : zhHans
  }
  return en
}

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
