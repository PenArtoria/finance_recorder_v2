import { CalendarDays, Eye, EyeOff, Goal, History, LayoutDashboard, LineChart, RefreshCw, Settings, Wallet } from 'lucide-react'
import { timeAgo, useNow, usePortfolio } from '@/hooks'
import { useNav, type Page } from '@/nav'
import { useApp } from '@/store'
import { Logo } from './Logo'

const NAV: { page: Page; label: string; icon: typeof Wallet }[] = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'holdings', label: 'Holdings', icon: LineChart },
  { page: 'cash', label: 'Cash buckets', icon: Wallet },
  { page: 'spending', label: 'Spending', icon: CalendarDays },
  { page: 'goals', label: 'Goals', icon: Goal },
  { page: 'history', label: 'Monthly history', icon: History }
]

export function Sidebar() {
  const page = useNav((s) => s.page)
  const go = useNav((s) => s.go)
  const hide = useApp((s) => s.data.settings.hideAmounts)
  const mutate = useApp((s) => s.mutate)
  const prices = useApp((s) => s.prices)
  const refresh = useApp((s) => s.refreshPrices)
  const refreshMinutes = useApp((s) => s.data.settings.refreshMinutes)
  const hasSymbols = useApp((s) => s.data.holdings.some((h) => h.symbol))
  const p = usePortfolio()
  const now = useNow(20000)

  const last = prices.lastRun ?? p.oldestQuote
  const stale = !last || now - last > Math.max(refreshMinutes || 60, 15) * 60 * 1000 * 2
  const dotClass = prices.offline ? 'off' : stale ? 'stale' : ''
  const statusText = prices.loading
    ? 'Updating prices…'
    : prices.offline
      ? 'Offline. Showing last prices.'
      : !hasSymbols
        ? 'No live prices to track yet'
        : `Prices updated ${timeAgo(last, now)}`

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={26} />
        <span className="brand-name">Moneta</span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <button key={p} className={`nav-item ${page === p ? 'active' : ''}`} onClick={() => go(p)} aria-current={page === p ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.9} />
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button
          className="nav-item"
          onClick={() =>
            mutate((d) => {
              d.settings.hideAmounts = !d.settings.hideAmounts
            })
          }
          title="Hide amounts when someone can see your screen"
        >
          {hide ? <EyeOff size={17} strokeWidth={1.9} /> : <Eye size={17} strokeWidth={1.9} />}
          {hide ? 'Show amounts' : 'Hide amounts'}
        </button>
        <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
          <Settings size={17} strokeWidth={1.9} />
          Settings
        </button>
        <div className="price-status">
          <span className={`dot ${dotClass}`} aria-hidden />
          <span className="grow">{statusText}</span>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => refresh({ forceFx: true })} disabled={prices.loading} aria-label="Refresh prices" title="Refresh prices">
            <RefreshCw size={15} className={prices.loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
    </aside>
  )
}
