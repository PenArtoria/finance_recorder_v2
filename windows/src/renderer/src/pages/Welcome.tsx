import { useState } from 'react'
import { FileUp, Link2, PencilLine, Sparkles } from 'lucide-react'
import { exampleData } from '@/core/example'
import { useNav } from '@/nav'
import { useApp } from '@/store'
import { CurrencySelect } from '@/components/CurrencySelect'
import { ImportDialog } from '@/components/HistoryDialogs'
import { Logo } from '@/components/Logo'
import { LinkDialog } from '@/components/SyncCard'
import { Field } from '@/components/ui'

export function Welcome() {
  const mutate = useApp((s) => s.mutate)
  const replace = useApp((s) => s.replace)
  const refresh = useApp((s) => s.refreshPrices)
  const settings = useApp((s) => s.data.settings)
  const go = useNav((s) => s.go)
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [name, setName] = useState(settings.name)
  const [importing, setImporting] = useState(false)
  const [linking, setLinking] = useState(false)

  const start = (page: 'overview' | 'holdings' | 'history') => {
    mutate((d) => {
      d.onboarded = true
      d.settings.baseCurrency = currency
      d.settings.name = name.trim()
    })
    go(page)
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <Logo size={48} />
        <div>
          <h1>Your money, month by month.</h1>
          <p className="lead">
            Track your stocks, ETFs, crypto, bank accounts and daily spending in one place. Prices update by themselves, every month is saved for you, and your goals show how close you are.
          </p>
        </div>
        <div className="form-row">
          <Field label="Your name (optional)">
            <input className="input" value={name} placeholder="For the greeting" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Main currency" hint="You can change this any time.">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {window.api.platform === 'web' && (
            <button className="choice" onClick={() => setLinking(true)}>
              <div className="ic">
                <Link2 size={19} />
              </div>
              <div>
                <b>Link to Moneta on my computer</b>
                <span>Type the code from Settings → Sync on your computer. Your data appears here and stays in sync.</span>
              </div>
            </button>
          )}
          <button className="choice" onClick={() => start('holdings')}>
            <div className="ic">
              <PencilLine size={19} />
            </div>
            <div>
              <b>Start with my own numbers</b>
              <span>Add your holdings and cash buckets. Takes a few minutes.</span>
            </div>
          </button>
          <button className="choice" onClick={() => setImporting(true)}>
            <div className="ic">
              <FileUp size={19} />
            </div>
            <div>
              <b>Bring in my Google Sheets history</b>
              <span>Import the monthly totals you’ve been tracking, then add your current holdings.</span>
            </div>
          </button>
          <button
            className="choice"
            onClick={() => {
              const ex = exampleData()
              ex.settings = { ...ex.settings, baseCurrency: currency, name: name.trim() }
              replace(ex)
              go('overview')
              refresh({ silent: true, forceFx: true })
            }}
          >
            <div className="ic">
              <Sparkles size={19} />
            </div>
            <div>
              <b>Look around with an example</b>
              <span>A made-up portfolio with VWRA, VALL, RKLB and Bitcoin at live prices, plus bank accounts, buckets and a month of spending. Clear it when you’re ready.</span>
            </div>
          </button>
        </div>
      </div>
      {linking && <LinkDialog onClose={() => setLinking(false)} onLinked={() => go('overview')} />}
      {importing && (
        <ImportDialog
          onClose={() => {
            setImporting(false)
            if (useApp.getState().data.snapshots.length) start('history')
          }}
        />
      )}
    </div>
  )
}
