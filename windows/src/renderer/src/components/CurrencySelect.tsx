import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { allCurrencies, currencyName, POPULAR_CURRENCIES } from '@/core/currencies'
import { useApp } from '@/store'
import { useAnchoredStyle } from './popover'

/** Searchable picker over every supported currency. Type a code ("hkd") or a name ("yen"). */
export function CurrencySelect({ value, onChange, id }: { value: string; onChange: (code: string) => void; id?: string }) {
  const fxCodes = useApp((s) => s.data.fx?.rates)
  const all = useMemo(() => allCurrencies(Object.keys(fxCodes ?? {})), [fxCodes])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listStyle = useAnchoredStyle(wrap, open)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      const popular = POPULAR_CURRENCIES.filter((c) => all.includes(c))
      return { popular, rest: all.filter((c) => !popular.includes(c)) }
    }
    const match = all.filter((c) => c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q))
    match.sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
    return { popular: [] as string[], rest: match }
  }, [all, query])
  const flat = [...items.popular, ...items.rest]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!wrap.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  const row = (c: string, i: number) => (
    <button
      type="button"
      key={c}
      className={`combo-item ${i === hi ? 'hi' : ''}`}
      onMouseEnter={() => setHi(i)}
      onClick={() => pick(c)}
    >
      <span className="code">{c}</span>
      <span className="name">{currencyName(c)}</span>
      {c === value && <span className="meta">Selected</span>}
    </button>
  )

  return (
    <div className="combo" ref={wrap}>
      <input
        id={id}
        className="input"
        value={open ? query : `${value} · ${currencyName(value)}`}
        placeholder="Search currency"
        onFocus={() => {
          setOpen(true)
          setHi(0)
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setHi(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((h) => Math.min(flat.length - 1, h + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(0, h - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (flat[hi]) pick(flat[hi])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
            setQuery('')
          }
        }}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
      />
      {open &&
        createPortal(
          <div className="combo-list" ref={listRef} role="listbox" style={listStyle}>
            {flat.length === 0 && <div className="combo-empty">No currency matches “{query}”.</div>}
            {items.popular.map((c, i) => row(c, i))}
            {items.popular.length > 0 && <div className="combo-sep" />}
            {items.rest.map((c, i) => row(c, i + items.popular.length))}
          </div>,
          document.body
        )}
    </div>
  )
}
