import { useState } from 'react'
import { CalendarDays, Cloud, CreditCard, Ellipsis, Eye, EyeOff, Goal, History, LayoutDashboard, LineChart, RefreshCw, Settings, Wallet } from 'lucide-react'
import { timeAgo, useNow } from '@/hooks'
import { useNav, type Page } from '@/nav'
import { useApp } from '@/store'
import { SyncStatusLine } from './SyncCard'

// Phone navigation: four tabs plus More. Shown instead of the sidebar on narrow screens.

const TABS: { page: Page; label: string; icon: typeof Wallet }[] = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'holdings', label: 'Holdings', icon: LineChart },
  { page: 'spending', label: 'Spending', icon: CalendarDays },
  { page: 'cash', label: 'Cash', icon: Wallet }
]

const MORE: { page: Page; label: string; icon: typeof Wallet }[] = [
  { page: 'cards', label: 'Credit cards', icon: CreditCard },
  { page: 'goals', label: 'Goals', icon: Goal },
  { page: 'history', label: 'Monthly history', icon: History },
  { page: 'settings', label: 'Settings', icon: Settings }
]

export function BottomNav() {
  const page = useNav((s) => s.page)
  const go = useNav((s) => s.go)
  const [more, setMore] = useState(false)
  const inMore = MORE.some((m) => m.page === page)

  return (
    <>
      <nav className="bottom-nav" aria-label="Main">
        {TABS.map(({ page: p, label, icon: Icon }) => (
          <button key={p} className={page === p ? 'on' : ''} onClick={() => go(p)} aria-current={page === p ? 'page' : undefined}>
            <Icon size={21} strokeWidth={page === p ? 2.2 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
        <button className={inMore || more ? 'on' : ''} onClick={() => setMore(true)}>
          <Ellipsis size={21} strokeWidth={inMore ? 2.2 : 1.8} />
          <span>More</span>
        </button>
      </nav>
      {more && <MoreSheet onClose={() => setMore(false)} />}
    </>
  )
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const go = useNav((s) => s.go)
  const page = useNav((s) => s.page)
  const hide = useApp((s) => s.data.settings.hideAmounts)
  const mutate = useApp((s) => s.mutate)
  const prices = useApp((s) => s.prices)
  const refresh = useApp((s) => s.refreshPrices)
  const syncOn = useApp((s) => s.sync.enabled)
  const now = useNow(20000)

  return (
    <div className="overlay sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="More">
        <div className="sheet-grip" aria-hidden />
        {MORE.map(({ page: p, label, icon: Icon }) => (
          <button
            key={p}
            className={`sheet-item ${page === p ? 'on' : ''}`}
            onClick={() => {
              go(p)
              onClose()
            }}
          >
            <Icon size={19} strokeWidth={1.9} />
            {label}
          </button>
        ))}
        <div className="sheet-sep" />
        <button
          className="sheet-item"
          onClick={() =>
            mutate((d) => {
              d.settings.hideAmounts = !d.settings.hideAmounts
            })
          }
        >
          {hide ? <EyeOff size={19} strokeWidth={1.9} /> : <Eye size={19} strokeWidth={1.9} />}
          {hide ? 'Show amounts' : 'Hide amounts'}
        </button>
        <button className="sheet-item" onClick={() => refresh({ forceFx: true })} disabled={prices.loading}>
          <RefreshCw size={19} strokeWidth={1.9} className={prices.loading ? 'spin' : ''} />
          <span className="grow">Refresh prices</span>
          <span className="faint">{prices.loading ? 'Updating…' : timeAgo(prices.lastRun, now)}</span>
        </button>
        {syncOn && (
          <div className="sheet-item static">
            <Cloud size={19} strokeWidth={1.9} />
            <span className="grow faint">
              <SyncStatusLine />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
