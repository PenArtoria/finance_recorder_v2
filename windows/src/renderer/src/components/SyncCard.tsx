import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Copy, KeyRound, Link2, RefreshCw, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { formatPairCode } from '@/sync/crypto'
import { DEFAULT_SERVER } from '@/sync/engine'
import { timeAgo, useNow } from '@/hooks'
import { useApp } from '@/store'
import { Card, CardHead, Dialog, Field } from './ui'

const isWeb = () => window.api.platform === 'web'

/** The address of the phone app. On the phone itself it's wherever this page is served from. */
export const phoneAppUrl = () => (isWeb() ? location.origin : DEFAULT_SERVER)

export function SyncStatusLine() {
  const sync = useApp((s) => s.sync)
  const now = useNow(15000)
  if (!sync.enabled) return <span>Sync is off</span>
  if (sync.state === 'syncing') return <span>Syncing…</span>
  if (sync.state === 'offline') return <span>Offline. Changes sync when you’re back online.</span>
  if (sync.state === 'error') return <span className="bad">Sync problem: {sync.error}</span>
  return <span>Synced {timeAgo(sync.lastSync, now)}</span>
}

export function SyncCard() {
  const sync = useApp((s) => s.sync)
  const syncNow = useApp((s) => s.syncNow)
  const enableSync = useApp((s) => s.enableSync)
  const toast = useApp((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [turnOff, setTurnOff] = useState(false)

  const turnOn = async () => {
    setBusy(true)
    try {
      await enableSync()
      toast('Sync is on. Your data is encrypted and uploaded.', 'success')
    } catch (err: any) {
      toast(err?.message || 'Couldn’t turn on sync.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title={isWeb() ? 'Sync with your computer' : 'Sync with your phone'} />
      {!sync.enabled ? (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            Keeps Moneta on {isWeb() ? 'this phone and your computer' : 'this computer and your iPhone'} in step. Your data is encrypted on the device before it’s uploaded, so
            only your devices can read it.
          </p>
          <div className="actions">
            {isWeb() ? (
              <>
                <button className="btn primary" onClick={() => setLinking(true)}>
                  <Link2 size={15} /> Link to my computer
                </button>
                <button className="btn" onClick={turnOn} disabled={busy}>
                  Start syncing from this phone
                </button>
              </>
            ) : (
              <>
                <button className="btn primary" onClick={turnOn} disabled={busy}>
                  <Cloud size={15} /> {busy ? 'Turning on…' : 'Turn on sync'}
                </button>
                <button className="btn" onClick={() => setLinking(true)}>
                  I already sync on another device
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="setting-row">
            <div className="text">
              <b>
                <Cloud size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Sync is on
              </b>
              <span>
                <SyncStatusLine />
              </span>
            </div>
            <button className="btn" onClick={() => syncNow()} disabled={sync.state === 'syncing'}>
              <RefreshCw size={15} className={sync.state === 'syncing' ? 'spin' : ''} /> Sync now
            </button>
          </div>
          <div className="setting-row">
            <div className="text">
              <b>{isWeb() ? 'Link another device' : 'Link your iPhone'}</b>
              <span>Get a one-time code to type on the other device. It works for 10 minutes.</span>
            </div>
            <button className="btn primary" onClick={() => setPairing(true)}>
              <Smartphone size={15} /> Link a device
            </button>
          </div>
          <div className="actions" style={{ paddingTop: 12 }}>
            <button className="btn ghost" onClick={() => setShowKey(true)}>
              <KeyRound size={15} /> Show sync key
            </button>
            <button className="btn ghost danger" onClick={() => setTurnOff(true)}>
              <CloudOff size={15} /> Turn off sync
            </button>
          </div>
        </>
      )}
      {pairing && <PairDialog onClose={() => setPairing(false)} />}
      {linking && <LinkDialog onClose={() => setLinking(false)} />}
      {showKey && <KeyDialog onClose={() => setShowKey(false)} />}
      {turnOff && <TurnOffDialog onClose={() => setTurnOff(false)} />}
    </Card>
  )
}

function PairDialog({ onClose }: { onClose: () => void }) {
  const createPairCode = useApp((s) => s.createPairCode)
  const [pair, setPair] = useState<{ code: string; expires: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const now = useNow(1000)
  const url = phoneAppUrl()

  const make = () => {
    setError(null)
    setPair(null)
    createPairCode()
      .then(setPair)
      .catch((err) => setError(err?.message || 'Couldn’t make a code.'))
  }
  useEffect(make, [createPairCode])
  useEffect(() => {
    if (isWeb()) return
    QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#1f1e1d', light: '#ffffff' } }).then(setQr, () => setQr(null))
  }, [url])

  const left = pair ? Math.max(0, Math.round((pair.expires - now) / 1000)) : 0

  return (
    <Dialog title="Link a device" sub="The code works once, for 10 minutes." onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="form">
        {!isWeb() && (
          <div className="pair-steps">
            {qr && <img className="qr" src={qr} alt={`QR code for ${url}`} width={140} height={140} />}
            <ol>
              <li>
                On your iPhone, scan this with the Camera, or open <b className="sel">{url.replace('https://', '')}</b> in Safari.
              </li>
              <li>Tap Share, then <b>Add to Home Screen</b>.</li>
              <li>Open Moneta from the Home Screen, choose <b>Link to my computer</b> and type the code below.</li>
            </ol>
          </div>
        )}
        <div className="pair-code" aria-live="polite">
          {error ? <span className="bad" style={{ fontSize: 15 }}>{error}</span> : pair ? formatPairCode(pair.code) : '····-····'}
        </div>
        <p className="faint" style={{ textAlign: 'center' }}>
          {pair && left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : pair ? 'This code has expired.' : error ? '' : 'Making a code…'}{' '}
          {(left === 0 && pair) || error ? (
            <button className="link-btn" onClick={make}>
              Make a new code
            </button>
          ) : null}
        </p>
      </div>
    </Dialog>
  )
}

export function LinkDialog({ onClose, onLinked }: { onClose: () => void; onLinked?: () => void }) {
  const linkSync = useApp((s) => s.linkSync)
  const toast = useApp((s) => s.toast)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link = async () => {
    setBusy(true)
    setError(null)
    try {
      await linkSync(code)
      toast('Linked. Your data is here now and stays in sync.', 'success')
      onLinked?.()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'That didn’t work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={isWeb() ? 'Link to my computer' : 'Link to another device'}
      sub="This device’s data is replaced with the synced data."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={link} disabled={busy || code.trim().length < 8}>
            {busy ? 'Linking…' : 'Link'}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted">
          On the device that already syncs, open Moneta → Settings → Sync and choose <b>Link a device</b>. Type the code it shows. You can also paste a sync key.
        </p>
        <Field label="Code" error={error ?? undefined}>
          <input
            className="input pair-input"
            value={code}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 8 && link()}
          />
        </Field>
      </div>
    </Dialog>
  )
}

function KeyDialog({ onClose }: { onClose: () => void }) {
  const exportSyncKey = useApp((s) => s.exportSyncKey)
  const toast = useApp((s) => s.toast)
  const [key, setKey] = useState<string | null>(null)
  useEffect(() => {
    exportSyncKey().then(setKey)
  }, [exportSyncKey])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? '')
      toast('Sync key copied.', 'success')
    } catch {
      toast('Select the key and copy it.', 'info')
    }
  }
  return (
    <Dialog title="Your sync key" sub="Anyone with this key can read your synced data. Keep it private." onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="form">
        <div className="path sel" style={{ fontSize: 14 }}>{key ?? '…'}</div>
        <p className="muted">Keep a copy in a password manager. If you lose every linked device, this key is the only way to get the synced data back.</p>
        <div>
          <button className="btn" onClick={copy}>
            <Copy size={15} /> Copy
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function TurnOffDialog({ onClose }: { onClose: () => void }) {
  const disableSync = useApp((s) => s.disableSync)
  const toast = useApp((s) => s.toast)
  const off = async (deleteRemote: boolean) => {
    try {
      await disableSync(deleteRemote)
      toast(deleteRemote ? 'Sync is off and the cloud copy is deleted.' : 'Sync is off on this device.', 'info')
      onClose()
    } catch (err: any) {
      toast(err?.message || 'Couldn’t reach the sync service.', 'error')
    }
  }
  return (
    <Dialog
      title="Turn off sync?"
      sub="This device keeps its data either way."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={() => off(false)}>
            Only on this device
          </button>
          <button className="btn danger solid" onClick={() => off(true)}>
            Everywhere, delete cloud copy
          </button>
        </>
      }
    >
      <p className="muted">
        Turning it off only here leaves your other devices syncing. Deleting the cloud copy stops sync on every device. Each keeps the data it has now.
      </p>
    </Dialog>
  )
}
