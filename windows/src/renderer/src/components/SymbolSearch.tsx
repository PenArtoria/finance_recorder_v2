import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Search } from 'lucide-react'
import type { SymbolMatch } from '@shared/types'
import { TYPE_LABEL } from '@/core/calc'
import { useAnchoredStyle } from './popover'

/** Looks up tickers on Yahoo Finance: "vwra", "rocket lab", "bitcoin", "2800.HK". */
export function SymbolSearch({ onPick, autoFocus }: { onPick: (m: SymbolMatch) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SymbolMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const seq = useRef(0)
  const wrap = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const showList = open && query.trim().length > 0
  const listStyle = useAnchoredStyle(wrap, showList, 320)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setError(null)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.searchSymbols(q)
        if (mine !== seq.current) return
        setResults(res)
        setError(null)
        setHi(0)
      } catch {
        if (mine !== seq.current) return
        setResults([])
        setError('Search is unavailable. Check your internet connection, or type the symbol below.')
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!wrap.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (m: SymbolMatch) => {
    onPick(m)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="combo" ref={wrap}>
      <div className="input-affix">
        <span className="affix" style={{ display: 'flex' }}>
          {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
        </span>
        <input
          className="input"
          placeholder="Search by ticker or name, e.g. VWRA, Rocket Lab, Bitcoin"
          value={query}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => Math.min(results.length - 1, h + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(0, h - 1))
            } else if (e.key === 'Enter' && results[hi]) {
              e.preventDefault()
              pick(results[hi])
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation()
              setOpen(false)
            }
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
      </div>
      {showList &&
        createPortal(
        <div className="combo-list" role="listbox" ref={listRef} style={listStyle}>
          {error && <div className="combo-empty">{error}</div>}
          {!error && !loading && results.length === 0 && <div className="combo-empty">No matches for “{query}”.</div>}
          {results.map((r, i) => (
            <button
              type="button"
              key={r.symbol}
              className={`combo-item ${i === hi ? 'hi' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(r)}
            >
              <span className="code">{r.symbol}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.name}</span>
              <span className="meta">
                {TYPE_LABEL[r.type]} · {r.exchange}
              </span>
            </button>
          ))}
        </div>,
          document.body
        )}
    </div>
  )
}
