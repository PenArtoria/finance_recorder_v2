import { useEffect, useState } from 'react'
import { Download, FolderInput, FolderOpen, RefreshCw, Upload } from 'lucide-react'
import type { AppData } from '@shared/types'
import { emptyData, normalizeData } from '@/core/data'
import { exampleData } from '@/core/example'
import { timeAgo } from '@/hooks'
import { useApp } from '@/store'
import { CurrencySelect } from '@/components/CurrencySelect'
import { Card, CardHead, ConfirmDialog, PageHead, Segmented, Toggle } from '@/components/ui'

export function Settings() {
  const data = useApp((s) => s.data)
  const info = useApp((s) => s.info)
  const setInfo = useApp((s) => s.setInfo)
  const mutate = useApp((s) => s.mutate)
  const replace = useApp((s) => s.replace)
  const reload = useApp((s) => s.reloadFromDisk)
  const refresh = useApp((s) => s.refreshPrices)
  const prices = useApp((s) => s.prices)
  const toast = useApp((s) => s.toast)
  const [version, setVersion] = useState('')
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void }>(null)
  const [name, setName] = useState(data.settings.name)
  const s = data.settings

  useEffect(() => {
    window.api.appInfo().then((i) => setVersion(i.version))
  }, [])

  const set = <K extends keyof AppData['settings']>(key: K, value: AppData['settings'][K]) =>
    mutate((d) => {
      d.settings[key] = value
    })

  const exportBackup = async () => {
    const path = await window.api.exportFile({
      defaultName: `moneta-backup-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(data, null, 1),
      filters: [{ name: 'Moneta backup', extensions: ['json'] }]
    })
    if (path) toast('Backup saved.', 'success')
  }

  const restoreBackup = async () => {
    const file = await window.api.importFile([{ name: 'Moneta backup', extensions: ['json'] }])
    if (!file) return
    let parsed: AppData
    try {
      const raw = JSON.parse(file.content)
      if (!raw || typeof raw !== 'object' || !('holdings' in raw || 'snapshots' in raw)) throw new Error('not a backup')
      parsed = normalizeData(raw)
    } catch {
      toast('That file is not a Moneta backup.', 'error')
      return
    }
    setConfirm({
      title: 'Restore this backup?',
      body: `Everything in Moneta is replaced with ${file.name}: ${parsed.holdings.length} holdings, ${parsed.buckets.length} buckets, ${parsed.goals.length} goals and ${parsed.snapshots.length} months.`,
      label: 'Restore',
      run: () => {
        replace({ ...parsed, onboarded: true })
        toast('Backup restored.', 'success')
      }
    })
  }

  const moveFolder = async () => {
    const res = await window.api.chooseDataFolder()
    if (!res) return
    setInfo(res.info)
    if (res.reload) await reload()
    else await window.api.saveData(useApp.getState().data)
    toast('Data folder changed.', 'success')
  }

  const resetFolder = async () => {
    await window.api.saveData(data)
    const info = await window.api.resetDataFolder()
    setInfo(info)
    await window.api.saveData(useApp.getState().data)
    toast('Using the default data folder.', 'success')
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHead title="Settings" />

      <Card>
        <CardHead title="General" />
        <div className="setting-row">
          <div className="text">
            <b>Your name</b>
            <span>Used in the greeting on the overview.</span>
          </div>
          <input
            className="input"
            style={{ width: 240 }}
            value={name}
            placeholder="Optional"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== s.name && set('name', name.trim())}
          />
        </div>
        <div className="setting-row">
          <div className="text">
            <b>Main currency</b>
            <span>Totals, charts and history are shown in this currency. Each holding and bucket keeps its own.</span>
          </div>
          <div style={{ width: 240, flex: 'none' }}>
            <CurrencySelect value={s.baseCurrency} onChange={(c) => set('baseCurrency', c)} />
          </div>
        </div>
        <div className="setting-row">
          <div className="text">
            <b>Appearance</b>
          </div>
          <Segmented
            value={s.theme}
            onChange={(v) => set('theme', v)}
            label="Appearance"
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </div>
        <div className="setting-row">
          <div className="text">
            <b>Hide amounts</b>
            <span>Masks every amount, for when someone can see your screen.</span>
          </div>
          <Toggle on={s.hideAmounts} onChange={(v) => set('hideAmounts', v)} label="Hide amounts" />
        </div>
        <div className="setting-row">
          <div className="text">
            <b>Refresh prices</b>
            <span>While Moneta is open. Prices come from Yahoo Finance and can be delayed up to 15 minutes.</span>
          </div>
          <select className="select" style={{ width: 180 }} value={s.refreshMinutes} onChange={(e) => set('refreshMinutes', Number(e.target.value))}>
            <option value={0}>Only when I ask</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
          </select>
        </div>
      </Card>

      <Card>
        <CardHead title="Exchange rates" />
        <div className="setting-row">
          <div className="text">
            <b>{data.fx && data.fx.source !== 'example' ? `${Object.keys(data.fx.rates).length} currencies` : 'Not loaded yet'}</b>
            <span>
              {data.fx && data.fx.fetchedAt
                ? `From ${data.fx.source}, checked ${timeAgo(data.fx.fetchedAt)}. Rates update once a day.`
                : 'Rates load the first time prices refresh.'}
              {prices.fxError ? ` Last attempt failed: ${prices.fxError}.` : ''}
            </span>
          </div>
          <button className="btn" onClick={() => refresh({ forceFx: true })} disabled={prices.loading}>
            <RefreshCw size={15} className={prices.loading ? 'spin' : ''} /> Update now
          </button>
        </div>
      </Card>

      <Card>
        <CardHead title="Your data" />
        <div className="setting-row" style={{ alignItems: 'flex-start' }}>
          <div className="text">
            <b>Where it’s saved</b>
            <span>
              Everything is in one file on this computer, with a daily backup kept for 30 days. Put it in a OneDrive or iCloud Drive folder to back it up and to share it with
              another computer running Moneta.
            </span>
            {info && <div className="path">{info.file}</div>}
          </div>
        </div>
        <div className="actions" style={{ paddingTop: 12 }}>
          <button className="btn" onClick={() => window.api.openDataFolder()}>
            <FolderOpen size={15} /> Open folder
          </button>
          <button className="btn" onClick={moveFolder}>
            <FolderInput size={15} /> Move to another folder…
          </button>
          {info && !info.isDefault && (
            <button className="btn ghost" onClick={resetFolder}>
              Use the default folder
            </button>
          )}
        </div>
        <div className="setting-row" style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <div className="text">
            <b>Backup file</b>
            <span>Save a copy of everything, or restore one.</span>
          </div>
          <div className="actions">
            <button className="btn" onClick={exportBackup}>
              <Download size={15} /> Save backup…
            </button>
            <button className="btn" onClick={restoreBackup}>
              <Upload size={15} /> Restore…
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Start over" />
        <div className="setting-row">
          <div className="text">
            <b>{data.example ? 'Clear the example portfolio' : 'Erase all data'}</b>
            <span>Removes holdings, buckets, goals and history. Your settings stay. Save a backup first if you might want it back.</span>
          </div>
          <button
            className="btn danger"
            onClick={() =>
              setConfirm({
                title: data.example ? 'Clear the example?' : 'Erase all data?',
                body: 'Holdings, buckets, goals and every month of history are removed. This can’t be undone, except from a backup.',
                label: data.example ? 'Clear example' : 'Erase everything',
                run: () => {
                  const d = emptyData()
                  d.onboarded = true
                  d.settings = { ...s }
                  d.fx = data.fx?.source === 'example' ? null : data.fx
                  replace(d)
                  toast('All data cleared.', 'info')
                }
              })
            }
          >
            {data.example ? 'Clear example' : 'Erase all data'}
          </button>
        </div>
        {!data.example && data.holdings.length === 0 && data.buckets.length === 0 && (
          <div className="setting-row">
            <div className="text">
              <b>Explore with an example</b>
              <span>Loads a made-up portfolio with VWRA, VALL, RKLB, Bitcoin, bank accounts, buckets and spending.</span>
            </div>
            <button
              className="btn"
              onClick={() => {
                const ex = exampleData()
                ex.settings = { ...s }
                replace(ex)
                refresh({ silent: true, forceFx: true })
              }}
            >
              Load example
            </button>
          </div>
        )}
      </Card>

      <p className="faint" style={{ fontSize: 12.5, textAlign: 'center' }}>
        Moneta {version} · Prices from Yahoo Finance, exchange rates from open.er-api.com. For tracking only, not financial advice.
      </p>

      {confirm && <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel={confirm.label} onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
    </div>
  )
}
