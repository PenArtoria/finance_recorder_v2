// Everything the bot says. To add a language, copy `en`, translate it, add it to LANGS
// and LANGUAGE_NAMES, and teach `pickLang` its Telegram language codes.
//
// Messages are Telegram HTML. Values passed to the card functions are already escaped.

export type Lang = 'en' | 'ja' | 'zh-Hant' | 'zh-Hans'

/** Each language's name in that language, for the /language buttons. */
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', ja: '日本語', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文' }

export const MENU = ['spend', 'income', 'move', 'buy', 'sell', 'balances', 'undo', 'language', 'help'] as const
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
  /** Set when the buy adds a new holding: its full name. */
  newName?: string
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
  | 'noSymbol'
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

type Kind = 'spend' | 'income' | 'move' | 'buy' | 'sell'

/** Row labels on entry cards, punctuation included. */
interface Labels {
  from: string
  moveFrom: string
  to: string
  into: string
  card: string
  left: string
  balance: string
  arrives: string
  price: string
  fee: string
  total: string
  paidFrom: string
  paidTo: string
  newHolding: string
  date: string
}

export interface Strings {
  lang: Lang
  /** BCP 47 locale for dates. */
  locale: string
  quote: (text: string) => string
  // Status lines on top of a message.
  confirm: string
  saved: string
  cancelled: string
  undone: string
  // Buttons.
  save: string
  cancel: string
  undo: string
  // Short notices on a pressed button (plain text).
  expired: string
  nothingToUndo: string
  notTracked: string
  noCash: string
  today: string
  kinds: Record<Kind, string>
  labels: Labels
  onlyText: string
  noAi: string
  help: (ai: boolean) => string
  privateBot: (id: string) => string
  askFrom: string
  askTo: string
  askCash: (side: 'buy' | 'sell') => string
  whichOne: (query: string) => string
  cantFind: (query: string) => string
  whichStock: (query: string) => string
  whichBank: string
  /** Command descriptions for Telegram's menu. */
  menu: Record<MenuCommand, string>
  bal: {
    netWorth: string
    today: string
    investments: string
    accounts: string
    buckets: string
    assets: string
    cards: string
    notInBucket: (amount: string) => string
    target: (amount: string) => string
    owed: string
    prices: (when: string) => string
    livePrices: string
    empty: string
  }
  language: {
    title: string
    now: (name: string) => string
    auto: string
    fromTelegram: (code: string) => string
    set: string
  }
  usage: Record<'spend' | 'income' | 'move' | 'buy' | 'sell', string>
  errors: Record<ErrorKey, (p: Record<string, string>) => string>
}

const COMMANDS =
  '<code>/spend 1200 lunch from Daily</code>\n' +
  '<code>/income 300000 salary to SMBC</code>\n' +
  '<code>/move 700 USD from Wise to IBKR</code>\n' +
  '<code>/buy 3 VWRA at 140 fee 2 from IBKR</code>\n' +
  '<code>/sell 1 RKLB at 70 to IBKR</code>'

const en: Strings = {
  lang: 'en',
  locale: 'en-GB',
  quote: (s) => `“${s}”`,
  confirm: 'Save this?',
  saved: 'Saved',
  cancelled: 'Cancelled',
  undone: 'Undone',
  save: '✅ Save',
  cancel: '❌ Cancel',
  undo: '↩️ Undo',
  expired: 'This has expired. Please send it again.',
  nothingToUndo: 'There’s nothing to undo.',
  notTracked: 'not tracked in Moneta',
  noCash: 'No cash moved',
  today: 'Today',
  kinds: { spend: 'Spend', income: 'Income', move: 'Move', buy: 'Buy', sell: 'Sell' },
  labels: {
    from: 'From: ',
    moveFrom: 'From: ',
    to: 'To: ',
    into: 'Into: ',
    card: 'Card: ',
    left: 'Left: ',
    balance: 'Balance: ',
    arrives: 'Arrives: ',
    price: 'Price: ',
    fee: 'Fee: ',
    total: 'Total: ',
    paidFrom: 'Paid from: ',
    paidTo: 'Paid into: ',
    newHolding: 'New holding: ',
    date: 'Date: '
  },
  onlyText: 'Please send text. Photos and voice messages aren’t supported yet.',
  noAi: '🤖 AI isn’t set up yet, so for now I understand commands. For example:\n<code>/spend 1200 lunch from Daily</code>\n\nSend /help to see them all.',
  help: (ai) =>
    '👋 <b>Moneta bot</b>\nI record your spending, income, transfers and trades in Moneta, and always show you the entry before saving.\n\n' +
    (ai
      ? '💬 <b>Just write</b>\n<i>lunch 1200 yen from daily</i>\n<i>transfer 700 dollars from Wise to IBKR</i>\n<i>bought 3 VWRA at 140, fee 2</i>\n\n'
      : '') +
    `✏️ <b>Commands</b>\n${COMMANDS}\n\n` +
    '📊 <b>More</b>\n/balances — net worth, accounts and investments\n/undo — undo the last entry\n/language — change the language\n\n' +
    '💡 <b>Tips</b>\n• Without <code>from</code> or <code>to</code>, I use the same place as last time.\n• <code>#food</code> sets the category, <code>on yesterday</code> the date, <code>card Visa</code> a credit card.',
  privateBot: (id) =>
    `🔒 This is a private bot.\n\nIf it’s yours, your Telegram user id is <code>${id}</code>. Add it with:\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: 'Where did the money come from?',
  askTo: 'Where did the money go?',
  askCash: (side) => (side === 'buy' ? 'Which account paid for it?' : 'Which account got the money?'),
  whichOne: (q) => `Which one is “${q}”?`,
  cantFind: (q) => `I can’t find “${q}”. Which one is it?`,
  whichStock: (q) => `Which “${q}” do you mean?`,
  whichBank: 'Which bank account?',
  menu: {
    spend: 'Record spending',
    income: 'Record income',
    move: 'Move money between buckets or accounts',
    buy: 'Record a buy',
    sell: 'Record a sale',
    balances: 'Net worth, accounts and investments',
    undo: 'Undo the last entry',
    language: 'Change the language',
    help: 'How to use the bot'
  },
  bal: {
    netWorth: 'Net worth',
    today: 'Today',
    investments: 'Investments',
    accounts: 'Bank accounts',
    buckets: 'Buckets',
    assets: 'Other assets',
    cards: 'Credit cards',
    notInBucket: (a) => `${a} not in a bucket`,
    target: (a) => `of ${a}`,
    owed: 'owed',
    prices: (w) => `Prices from ${w}`,
    livePrices: 'Live prices',
    empty: 'Nothing to show yet. Add accounts, buckets or holdings in Moneta first.'
  },
  language: {
    title: 'Language',
    now: (n) => `Now: ${n}`,
    auto: 'Automatic',
    fromTelegram: (c) => `from your Telegram (${c})`,
    set: 'OK, I’ll reply in English from now on.'
  },
  usage: {
    spend: '✏️ Try: <code>/spend 1200 lunch from Daily</code>',
    income: '✏️ Try: <code>/income 300000 salary to SMBC</code>',
    move: '✏️ Try: <code>/move 700 from Wise to IBKR</code>',
    buy: '✏️ Try: <code>/buy 3 VWRA at 140</code> or <code>/buy VWRA for 500</code>',
    sell: '✏️ Try: <code>/sell 3 VWRA at 150</code>'
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
    noHolding: (p) => `You don’t hold “${p.query}”.${p.names ? ` You hold: ${p.names}` : ''}`,
    noSymbol: (p) => `I can’t find “${p.query}” in your holdings or on Yahoo Finance. Try its ticker, like PANW, VWRA.L or 7203.T.`,
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
  }
}

const ja: Strings = {
  lang: 'ja',
  locale: 'ja-JP',
  quote: (s) => `「${s}」`,
  confirm: 'この内容で記録しますか？',
  saved: '記録しました',
  cancelled: 'キャンセルしました',
  undone: '取り消しました',
  save: '✅ 記録する',
  cancel: '❌ キャンセル',
  undo: '↩️ 取り消す',
  expired: '有効期限が切れました。もう一度送ってください。',
  nothingToUndo: '取り消せる記録はありません。',
  notTracked: 'Moneta で管理していない残高',
  noCash: '現金の移動なし',
  today: '今日',
  kinds: { spend: '支出', income: '収入', move: '移動', buy: '購入', sell: '売却' },
  labels: {
    from: '支払元：',
    moveFrom: '移動元：',
    to: '移動先：',
    into: '入金先：',
    card: 'カード：',
    left: '残り：',
    balance: '残高：',
    arrives: '入金額：',
    price: '単価：',
    fee: '手数料：',
    total: '合計：',
    paidFrom: '支払元：',
    paidTo: '入金先：',
    newHolding: '新規銘柄：',
    date: '日付：'
  },
  onlyText: 'テキストで送ってください。写真や音声にはまだ対応していません。',
  noAi: '🤖 AI がまだ設定されていないため、今はコマンドを使えます。例：\n<code>/spend 1200 lunch from Daily</code>\n\n/help で一覧を表示します。',
  help: (ai) =>
    '👋 <b>Moneta ボット</b>\n支出・収入・振替・売買を Moneta に記録します。記録する前に必ず内容を確認できます。\n\n' +
    (ai ? '💬 <b>そのまま書くだけ</b>\n<i>昼ご飯 1200円 Dailyから</i>\n<i>Wiseから IBKRへ 700ドル送金</i>\n<i>VWRAを140で3株買った、手数料2</i>\n\n' : '') +
    `✏️ <b>コマンド</b>\n${COMMANDS}\n\n` +
    '📊 <b>その他</b>\n/balances — 純資産・口座・投資\n/undo — 最後の記録を取り消す\n/language — 言語を変更\n\n' +
    '💡 <b>ヒント</b>\n• <code>from</code> や <code>to</code> がなければ、前回と同じ場所を使います。\n• <code>#food</code> でカテゴリ、<code>on yesterday</code> で日付、<code>card Visa</code> でクレジットカードを指定できます。',
  privateBot: (id) =>
    `🔒 これは個人用のボットです。\n\nあなたのボットなら、Telegram ユーザーIDは <code>${id}</code> です。次のコマンドで追加してください：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: 'どこから支払いましたか？',
  askTo: 'どこに入りましたか？',
  askCash: (side) => (side === 'buy' ? 'どの口座から支払いましたか？' : 'どの口座に入りましたか？'),
  whichOne: (q) => `「${q}」はどれですか？`,
  cantFind: (q) => `「${q}」が見つかりません。どれですか？`,
  whichStock: (q) => `「${q}」はどの銘柄ですか？`,
  whichBank: 'どの銀行口座ですか？',
  menu: {
    spend: '支出を記録',
    income: '収入を記録',
    move: 'バケットや口座の間でお金を移動',
    buy: '購入を記録',
    sell: '売却を記録',
    balances: '純資産・口座・投資を表示',
    undo: '最後の記録を取り消す',
    language: '言語を変更',
    help: '使い方'
  },
  bal: {
    netWorth: '純資産',
    today: '今日',
    investments: '投資',
    accounts: '銀行口座',
    buckets: 'バケット',
    assets: 'その他の資産',
    cards: 'クレジットカード',
    notInBucket: (a) => `うち未割り当て ${a}`,
    target: (a) => `目標 ${a}`,
    owed: '未払い',
    prices: (w) => `価格：${w} 時点`,
    livePrices: '最新の価格',
    empty: 'まだ表示するものがありません。先に Moneta で口座・バケット・保有銘柄を追加してください。'
  },
  language: {
    title: '言語',
    now: (n) => `現在：${n}`,
    auto: '自動',
    fromTelegram: (c) => `Telegram の設定から（${c}）`,
    set: 'これからは日本語で返信します。'
  },
  usage: {
    spend: '✏️ 例：<code>/spend 1200 lunch from Daily</code>',
    income: '✏️ 例：<code>/income 300000 salary to SMBC</code>',
    move: '✏️ 例：<code>/move 700 from Wise to IBKR</code>',
    buy: '✏️ 例：<code>/buy 3 VWRA at 140</code> または <code>/buy VWRA for 500</code>',
    sell: '✏️ 例：<code>/sell 3 VWRA at 150</code>'
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
    noHolding: (p) => `「${p.query}」は保有していません。${p.names ? `保有銘柄：${p.names}` : ''}`,
    noSymbol: (p) => `「${p.query}」は保有銘柄にも Yahoo Finance にも見つかりません。PANW、VWRA.L、7203.T のようなティッカーで試してください。`,
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
  }
}

const zhHant: Strings = {
  lang: 'zh-Hant',
  locale: 'zh-Hant',
  quote: (s) => `「${s}」`,
  confirm: '要記錄這些嗎？',
  saved: '已記錄',
  cancelled: '已取消',
  undone: '已復原',
  save: '✅ 記錄',
  cancel: '❌ 取消',
  undo: '↩️ 復原',
  expired: '已經過期，請再傳一次。',
  nothingToUndo: '沒有可以復原的記錄。',
  notTracked: '不在 Moneta 記錄的餘額',
  noCash: '沒有現金變動',
  today: '今天',
  kinds: { spend: '支出', income: '收入', move: '轉帳', buy: '買入', sell: '賣出' },
  labels: {
    from: '付款：',
    moveFrom: '轉出：',
    to: '轉入：',
    into: '存入：',
    card: '信用卡：',
    left: '剩餘：',
    balance: '餘額：',
    arrives: '到帳：',
    price: '單價：',
    fee: '手續費：',
    total: '總額：',
    paidFrom: '付款戶口：',
    paidTo: '存入戶口：',
    newHolding: '新增持倉：',
    date: '日期：'
  },
  onlyText: '請傳文字。暫時不支援相片和語音。',
  noAi: '🤖 還沒有設定 AI，所以現在只看得懂指令。例如：\n<code>/spend 1200 lunch from Daily</code>\n\n傳 /help 查看全部指令。',
  help: (ai) =>
    '👋 <b>Moneta 機械人</b>\n我會把你的支出、收入、轉帳和買賣記錄到 Moneta，記錄前一定會先給你確認。\n\n' +
    (ai ? '💬 <b>直接寫就可以</b>\n<i>午餐 1200 日圓 從 Daily</i>\n<i>從 Wise 轉 700 美元到 IBKR</i>\n<i>以 140 買了 3 股 VWRA，手續費 2</i>\n\n' : '') +
    `✏️ <b>指令</b>\n${COMMANDS}\n\n` +
    '📊 <b>其他</b>\n/balances — 淨資產、戶口和投資\n/undo — 復原上一筆記錄\n/language — 更改語言\n\n' +
    '💡 <b>小提示</b>\n• 沒有寫 <code>from</code> 或 <code>to</code> 的話，會用上次的地方。\n• <code>#food</code> 設定類別，<code>on yesterday</code> 設定日期，<code>card Visa</code> 設定信用卡。',
  privateBot: (id) =>
    `🔒 這是私人機械人。\n\n如果這是你的機械人，你的 Telegram 用戶 ID 是 <code>${id}</code>。用這個指令加入：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: '錢是從哪裡出的？',
  askTo: '錢存到哪裡？',
  askCash: (side) => (side === 'buy' ? '用哪個戶口付款？' : '錢存入哪個戶口？'),
  whichOne: (q) => `「${q}」是哪一個？`,
  cantFind: (q) => `找不到「${q}」，是哪一個？`,
  whichStock: (q) => `「${q}」是哪一隻？`,
  whichBank: '哪一個銀行戶口？',
  menu: {
    spend: '記錄支出',
    income: '記錄收入',
    move: '在資金桶或戶口之間轉帳',
    buy: '記錄買入',
    sell: '記錄賣出',
    balances: '查看淨資產、戶口和投資',
    undo: '復原上一筆記錄',
    language: '更改語言',
    help: '使用說明'
  },
  bal: {
    netWorth: '淨資產',
    today: '今日',
    investments: '投資',
    accounts: '銀行戶口',
    buckets: '資金桶',
    assets: '其他資產',
    cards: '信用卡',
    notInBucket: (a) => `未分配 ${a}`,
    target: (a) => `目標 ${a}`,
    owed: '未還',
    prices: (w) => `價格更新於 ${w}`,
    livePrices: '即時價格',
    empty: '還沒有可以顯示的內容。請先在 Moneta 加入戶口、資金桶或持倉。'
  },
  language: {
    title: '語言',
    now: (n) => `目前：${n}`,
    auto: '自動',
    fromTelegram: (c) => `跟隨 Telegram（${c}）`,
    set: '好的，之後我會用繁體中文回覆。'
  },
  usage: {
    spend: '✏️ 試試：<code>/spend 1200 lunch from Daily</code>',
    income: '✏️ 試試：<code>/income 300000 salary to SMBC</code>',
    move: '✏️ 試試：<code>/move 700 from Wise to IBKR</code>',
    buy: '✏️ 試試：<code>/buy 3 VWRA at 140</code> 或 <code>/buy VWRA for 500</code>',
    sell: '✏️ 試試：<code>/sell 3 VWRA at 150</code>'
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
    noHolding: (p) => `你沒有持有「${p.query}」。${p.names ? `你持有：${p.names}` : ''}`,
    noSymbol: (p) => `在你的持倉和 Yahoo Finance 都找不到「${p.query}」。請試試代號，例如 PANW、VWRA.L 或 0700.HK。`,
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
  }
}

const zhHans: Strings = {
  lang: 'zh-Hans',
  locale: 'zh-Hans',
  quote: (s) => `“${s}”`,
  confirm: '要记录这些吗？',
  saved: '已记录',
  cancelled: '已取消',
  undone: '已撤销',
  save: '✅ 记录',
  cancel: '❌ 取消',
  undo: '↩️ 撤销',
  expired: '已经过期，请再发一次。',
  nothingToUndo: '没有可以撤销的记录。',
  notTracked: '不在 Moneta 记录的余额',
  noCash: '没有现金变动',
  today: '今天',
  kinds: { spend: '支出', income: '收入', move: '转账', buy: '买入', sell: '卖出' },
  labels: {
    from: '付款：',
    moveFrom: '转出：',
    to: '转入：',
    into: '存入：',
    card: '信用卡：',
    left: '剩余：',
    balance: '余额：',
    arrives: '到账：',
    price: '单价：',
    fee: '手续费：',
    total: '总额：',
    paidFrom: '付款账户：',
    paidTo: '存入账户：',
    newHolding: '新增持仓：',
    date: '日期：'
  },
  onlyText: '请发文字。暂时不支持图片和语音。',
  noAi: '🤖 还没有设置 AI，所以现在只能看懂指令。例如：\n<code>/spend 1200 lunch from Daily</code>\n\n发送 /help 查看全部指令。',
  help: (ai) =>
    '👋 <b>Moneta 机器人</b>\n我会把你的支出、收入、转账和买卖记录到 Moneta，记录前一定会先让你确认。\n\n' +
    (ai ? '💬 <b>直接写就可以</b>\n<i>午饭 1200 日元 从 Daily</i>\n<i>从 Wise 转 700 美元到 IBKR</i>\n<i>以 140 买了 3 股 VWRA，手续费 2</i>\n\n' : '') +
    `✏️ <b>指令</b>\n${COMMANDS}\n\n` +
    '📊 <b>其他</b>\n/balances — 净资产、账户和投资\n/undo — 撤销上一笔记录\n/language — 更改语言\n\n' +
    '💡 <b>小提示</b>\n• 没有写 <code>from</code> 或 <code>to</code> 的话，会用上次的地方。\n• <code>#food</code> 设置类别，<code>on yesterday</code> 设置日期，<code>card Visa</code> 设置信用卡。',
  privateBot: (id) =>
    `🔒 这是私人机器人。\n\n如果这是你的机器人，你的 Telegram 用户 ID 是 <code>${id}</code>。用这个指令添加：\n<code>npx wrangler secret put ALLOWED_USER_IDS</code>`,
  askFrom: '钱是从哪里出的？',
  askTo: '钱存到哪里？',
  askCash: (side) => (side === 'buy' ? '用哪个账户付款？' : '钱存入哪个账户？'),
  whichOne: (q) => `“${q}”是哪一个？`,
  cantFind: (q) => `找不到“${q}”，是哪一个？`,
  whichStock: (q) => `“${q}”是哪一只？`,
  whichBank: '哪个银行账户？',
  menu: {
    spend: '记录支出',
    income: '记录收入',
    move: '在资金桶或账户之间转账',
    buy: '记录买入',
    sell: '记录卖出',
    balances: '查看净资产、账户和投资',
    undo: '撤销上一笔记录',
    language: '更改语言',
    help: '使用说明'
  },
  bal: {
    netWorth: '净资产',
    today: '今日',
    investments: '投资',
    accounts: '银行账户',
    buckets: '资金桶',
    assets: '其他资产',
    cards: '信用卡',
    notInBucket: (a) => `未分配 ${a}`,
    target: (a) => `目标 ${a}`,
    owed: '未还',
    prices: (w) => `价格更新于 ${w}`,
    livePrices: '实时价格',
    empty: '还没有可以显示的内容。请先在 Moneta 添加账户、资金桶或持仓。'
  },
  language: {
    title: '语言',
    now: (n) => `当前：${n}`,
    auto: '自动',
    fromTelegram: (c) => `跟随 Telegram（${c}）`,
    set: '好的，之后我会用简体中文回复。'
  },
  usage: {
    spend: '✏️ 试试：<code>/spend 1200 lunch from Daily</code>',
    income: '✏️ 试试：<code>/income 300000 salary to SMBC</code>',
    move: '✏️ 试试：<code>/move 700 from Wise to IBKR</code>',
    buy: '✏️ 试试：<code>/buy 3 VWRA at 140</code> 或 <code>/buy VWRA for 500</code>',
    sell: '✏️ 试试：<code>/sell 3 VWRA at 150</code>'
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
    noHolding: (p) => `你没有持有“${p.query}”。${p.names ? `你持有：${p.names}` : ''}`,
    noSymbol: (p) => `在你的持仓和 Yahoo Finance 都找不到“${p.query}”。请试试代码，例如 PANW、VWRA.L 或 0700.HK。`,
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
  }
}

export const LANGS: Record<Lang, Strings> = { en, ja, 'zh-Hant': zhHant, 'zh-Hans': zhHans }

/** The language for a code: a saved choice ("zh-Hant"), LANGUAGE, or Telegram's ("zh-hans", "zh-tw"…). */
export function pickLang(code: string | undefined): Strings {
  const c = (code || 'en').toLowerCase()
  if (c.startsWith('ja')) return ja
  // Telegram sends zh-hans / zh-hant; other clients zh-cn / zh-tw / zh-hk.
  if (c.startsWith('zh')) return /hant|tw|hk|mo/.test(c) ? zhHant : zhHans
  return en
}

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------- entry cards ----------

const card = (title: string, rows: (string | false | null | undefined)[]) => `<blockquote>${[title, ...rows.filter(Boolean)].join('\n')}</blockquote>`
const what = (t: Strings, category: string, note?: string) => [category, note && t.quote(note)].filter(Boolean).join(' · ')

export function spendCard(t: Strings, l: SpendLine): string {
  return card(`💸 <b>${t.kinds.spend} ${l.amount}</b>`, [
    what(t, l.category, l.note),
    l.card && t.labels.card + l.card,
    // A card charge that no bucket pays for has no "from".
    (l.from || !l.card) && t.labels.from + (l.from ?? t.notTracked),
    l.left && t.labels.left + l.left,
    t.labels.date + l.date
  ])
}

export function incomeCard(t: Strings, l: IncomeLine): string {
  return card(`💰 <b>${t.kinds.income} +${l.amount}</b>`, [
    what(t, l.category, l.note),
    t.labels.into + (l.to ?? t.notTracked),
    l.left && t.labels.balance + l.left,
    t.labels.date + l.date
  ])
}

export function moveCard(t: Strings, l: MoveLine): string {
  return card(`🔁 <b>${t.kinds.move} ${l.amount}</b>`, [
    t.labels.moveFrom + l.from,
    t.labels.to + l.to,
    l.received && t.labels.arrives + l.received
  ])
}

export function tradeCard(t: Strings, l: TradeLine): string {
  return card(`${l.side === 'buy' ? '📈' : '📉'} <b>${t.kinds[l.side]} ${l.quantity} ${l.holding}</b>`, [
    l.newName && `🆕 ${t.labels.newHolding}${l.newName}`,
    t.labels.price + l.price,
    l.fee && t.labels.fee + l.fee,
    t.labels.total + `<b>${l.total}</b>`,
    l.cash ? (l.side === 'buy' ? t.labels.paidFrom : t.labels.paidTo) + l.cash : t.noCash,
    l.cash && l.left && t.labels.left + l.left,
    t.labels.date + l.date
  ])
}

/** A status line on top, the entry cards below. */
export function withCards(status: string, cards: string[]): string {
  return `${status}\n\n${cards.join('\n')}`
}

/** A card crossed out, for undone or cancelled entries. */
export function struck(cardHtml: string): string {
  return cardHtml.replace(/^<blockquote>/, '<blockquote><s>').replace(/<\/blockquote>$/, '</s></blockquote>')
}
