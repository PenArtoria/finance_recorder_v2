import { useMemo } from 'react'
import { bankAccounts, linkedAccount, sourceKey, unassignedIn } from '@/core/cash'
import { ratesOf } from '@/core/calc'
import { formatMoney } from '@/core/money'
import { useApp } from '@/store'

/** A select over every bucket and bank account, plus a "none" choice. Values are source keys ("bucket:id"). */
export function MoneySourceSelect({
  value,
  onChange,
  noneLabel,
  id,
  exclude
}: {
  value: string
  onChange: (key: string) => void
  noneLabel: string
  id?: string
  exclude?: string
}) {
  const data = useApp((s) => s.data)
  const hide = data.settings.hideAmounts
  const rates = useMemo(() => ratesOf(data), [data])
  const accounts = bankAccounts(data).filter((a) => a.id !== exclude)
  const money = (v: number, c: string) => formatMoney(v, c, { hide })

  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{noneLabel}</option>
      {data.buckets.length > 0 && (
        <optgroup label="Buckets">
          {data.buckets.map((b) => {
            const a = linkedAccount(data, b)
            return (
              <option key={b.id} value={sourceKey({ kind: 'bucket', id: b.id })}>
                {b.name}
                {a ? ` · ${a.name}` : ''} ({money(b.amount, b.currency)})
              </option>
            )
          })}
        </optgroup>
      )}
      {accounts.length > 0 && (
        <optgroup label="Bank accounts, unassigned money">
          {accounts.map((a) => (
            <option key={a.id} value={sourceKey({ kind: 'account', id: a.id })}>
              {a.name} ({money(unassignedIn(data, a.id, rates), a.currency)} unassigned)
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
