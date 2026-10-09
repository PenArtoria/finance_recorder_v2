import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { applyThemeAttr, useIsDark } from './hooks'
import { useNav } from './nav'
import { useApp } from './store'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/ui'
import { Cards } from './pages/Cards'
import { Cash } from './pages/Cash'
import { Goals } from './pages/Goals'
import { History } from './pages/History'
import { Holdings } from './pages/Holdings'
import { Overview } from './pages/Overview'
import { Settings } from './pages/Settings'
import { Spending } from './pages/Spending'
import { Welcome } from './pages/Welcome'

const PAGES = { overview: Overview, holdings: Holdings, cash: Cash, spending: Spending, cards: Cards, goals: Goals, history: History, settings: Settings }

export function App() {
  const status = useApp((s) => s.status)
  const loadError = useApp((s) => s.loadError)
  const onboarded = useApp((s) => s.data.onboarded)
  const theme = useApp((s) => s.data.settings.theme)
  const refreshMinutes = useApp((s) => s.data.settings.refreshMinutes)
  const init = useApp((s) => s.init)
  const refresh = useApp((s) => s.refreshPrices)
  const page = useNav((s) => s.page)
  const dark = useIsDark()

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    applyThemeAttr(theme)
    window.api.setTheme(dark)
  }, [theme, dark])

  // Refresh once after loading, then on the chosen interval and when the window comes back into focus.
  useEffect(() => {
    if (status !== 'ready' || !onboarded) return
    refresh({ silent: true })
    if (!refreshMinutes) return
    const ms = refreshMinutes * 60 * 1000
    const timer = setInterval(() => refresh({ silent: true }), ms)
    const onFocus = () => {
      const last = useApp.getState().prices.lastRun ?? 0
      if (Date.now() - last > ms) refresh({ silent: true })
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [status, onboarded, refreshMinutes, refresh])

  if (status === 'loading') {
    return (
      <div className="welcome">
        <Loader2 className="spin faint" size={22} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="welcome">
        <div className="welcome-inner">
          <h1 style={{ fontSize: 28 }}>Moneta couldn’t open your data</h1>
          <p className="lead">{loadError}</p>
          <p className="muted">
            Your data file may be damaged or locked by another program. Daily backups are kept in the “backups” folder next to it.
          </p>
          <div className="actions">
            <button className="btn" onClick={() => window.api.openDataFolder()}>
              Open data folder
            </button>
            <button className="btn primary" onClick={() => init()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const Page = PAGES[page]
  return (
    <>
      <div className="titlebar-drag" />
      {onboarded ? (
        <div className="shell">
          <Sidebar />
          <main className="main">
            <Page />
          </main>
        </div>
      ) : (
        <div className="main" style={{ height: '100%' }}>
          <Welcome />
        </div>
      )}
      <Toasts />
    </>
  )
}
