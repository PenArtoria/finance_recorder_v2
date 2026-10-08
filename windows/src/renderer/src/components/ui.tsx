import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react'
import { formatPct, parseNumber } from '@/core/money'
import { useApp } from '@/store'

export function Card({ children, className = '', flush = false }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <section className={`card ${flush ? 'flush' : ''} ${className}`}>{children}</section>
}

export function CardHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  )
}

export function Tile({ label, value, foot }: { label: ReactNode; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {foot != null && <div className="tile-foot">{foot}</div>}
    </div>
  )
}

/** A signed change: arrow + text, colored by direction (never color alone). */
export function Delta({ value, text, size = 14 }: { value: number | null | undefined; text: ReactNode; size?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="delta flat">—</span>
  const dir = Math.abs(value) < 1e-9 ? 'flat' : value > 0 ? 'up' : 'down'
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus
  return (
    <span className={`delta ${dir}`}>
      <Icon size={size} strokeWidth={2.2} aria-hidden />
      {text}
    </span>
  )
}

export function PctDelta({ value }: { value: number | null | undefined }) {
  return <Delta value={value} text={formatPct(value)} size={13} />
}

export function Progress({ value, tone }: { value: number; tone?: 'good' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

/** Text box for numbers that accepts "1,234.50" and keeps what was typed while editing. */
export function NumberInput({
  value,
  onChange,
  id,
  placeholder,
  prefix,
  autoFocus,
  allowNegative = false
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  id?: string
  placeholder?: string
  prefix?: string
  autoFocus?: boolean
  allowNegative?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      const parsed = parseNumber(text)
      if (parsed !== value) setText(value == null ? '' : String(value))
    }
  }, [value, text])

  const input = (
    <input
      id={id}
      className="input num"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      autoFocus={autoFocus}
      onChange={(e) => {
        setText(e.target.value)
        let n = parseNumber(e.target.value)
        if (n != null && !allowNegative && n < 0) n = Math.abs(n)
        last.current = n
        onChange(n)
      }}
    />
  )
  if (!prefix) return input
  return (
    <div className="input-affix" style={{ ['--affix-pad' as string]: `${Math.max(30, prefix.length * 8 + 20)}px` }}>
      <span className="affix">{prefix}</span>
      {input}
    </div>
  )
}

let openDialogs: string[] = []

export function Dialog({
  title,
  sub,
  onClose,
  children,
  footer,
  wide = false
}: {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const titleId = useId()
  // Dialogs can open on top of each other; Escape closes only the top one.
  useEffect(() => {
    openDialogs.push(titleId)
    return () => {
      openDialogs = openDialogs.filter((x) => x !== titleId)
    }
  }, [titleId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === titleId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, titleId])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title" id={titleId}>
              {title}
            </h2>
            {sub && <p className="dialog-sub">{sub}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger solid"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{body}</p>
    </Dialog>
  )
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

export function AssetMark({ symbol, name }: { symbol: string; name: string }) {
  const text = (symbol || name).replace(/[-.=].*$/, '').slice(0, 4).toUpperCase()
  // Four letters need a smaller size to stay inside the badge.
  return (
    <div className="asset-mark" style={{ fontSize: text.length >= 4 ? 10 : 11.5 }}>
      {text}
    </div>
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
