import { useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { CATEGORIES, CATEGORY_LABEL, monthLabel, type HistoryPoint } from '@/core/calc'
import { formatAxis, formatPct } from '@/core/money'
import { useChartColors, useFmt } from '@/hooks'

// Chart conventions: thin marks (2px lines, bars ≤ 24px with 4px rounded ends),
// hairline solid grid, text in ink tokens only, hover tooltips on every chart,
// and a legend whenever more than one series is shown.

const AXIS_FONT = 11.5

function Tip({ title, rows, foot }: { title: ReactNode; rows: { color?: string; label: string; value: string }[]; foot?: ReactNode }) {
  return (
    <div className="chart-tip">
      <div className="t">{title}</div>
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span>
            {r.color && <i className="key-dot" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b className="num">{r.value}</b>
        </div>
      ))}
      {foot && <div className="faint" style={{ marginTop: 4 }}>{foot}</div>}
    </div>
  )
}

function useAxis() {
  const c = useChartColors()
  const fmt = useFmt()
  return {
    c,
    fmt,
    x: {
      tickLine: false,
      axisLine: { stroke: c.axis },
      tick: { fill: c.ink3, fontSize: AXIS_FONT },
      tickMargin: 8,
      minTickGap: 18,
      interval: 'preserveStartEnd' as const
    },
    y: {
      tickLine: false,
      axisLine: false,
      tick: { fill: c.ink3, fontSize: AXIS_FONT },
      width: 64,
      tickFormatter: (v: number) => (fmt.hide ? '••' : formatAxis(v, fmt.base))
    }
  }
}

// ---------- net worth over time ----------

export function NetWorthChart({ points, height = 250 }: { points: HistoryPoint[]; height?: number }) {
  const { c, fmt, x, y } = useAxis()
  const data = points.map((p, i) => ({
    month: p.month,
    label: monthLabel(p.month, 'axis'),
    value: p.totals.netWorth,
    change: i > 0 ? p.totals.netWorth - points[i - 1].totals.netWorth : null,
    live: p.live
  }))
  if (data.length < 2) {
    return (
      <div className="empty" style={{ padding: '36px 12px' }}>
        <p>Your net worth line starts once there are two months of history. Each month is recorded automatically, or add past months on the History page.</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.accent} stopOpacity={0.16} />
            <stop offset="100%" stopColor={c.accent} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" {...x} />
        <YAxis {...y} domain={['auto', 'auto']} />
        <Tooltip
          cursor={{ stroke: c.axis, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const d = active && payload?.[0]?.payload
            if (!d) return null
            return (
              <Tip
                title={`${monthLabel(d.month, 'long')}${d.live ? ' · so far' : ''}`}
                rows={[
                  { label: 'Net worth', value: fmt.money(d.value) },
                  ...(d.change != null ? [{ label: 'Change', value: fmt.money(d.change, { sign: true }) }] : [])
                ]}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={c.accent}
          strokeWidth={2}
          fill="url(#nwFill)"
          dot={(p: any) =>
            p.index === data.length - 1 ? (
              <circle key="end" cx={p.cx} cy={p.cy} r={4.5} fill={c.accent} stroke={c.surface} strokeWidth={2} />
            ) : (
              <g key={`d${p.index}`} />
            )
          }
          activeDot={{ r: 5, fill: c.accent, stroke: c.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------- allocation donut ----------

export interface Slice {
  key: string
  label: string
  value: number
  color: string
}

export function AllocationDonut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const { c, fmt } = useAxis()
  // Hovering a slice or a legend row shows that slice in the centre, so nothing covers the label.
  const [active, setActive] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const shown = slices.filter((s) => s.value > 0)
  if (total <= 0) {
    return <p className="muted">Add holdings or cash to see how your money is split.</p>
  }
  const hot = shown.find((s) => s.key === active)
  return (
    <div className="donut-box">
      <div className="donut-wrap">
        <div className="donut-center" style={{ width: 170, height: 170 }} onMouseLeave={() => setActive(null)}>
          <PieChart width={170} height={170}>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius={56}
              outerRadius={82}
              startAngle={90}
              endAngle={-270}
              stroke={c.surface}
              strokeWidth={shown.length > 1 ? 2 : 0}
              isAnimationActive={false}
              onMouseEnter={(_: unknown, i: number) => setActive(shown[i]?.key ?? null)}
            >
              {shown.map((s) => (
                <Cell key={s.key} fill={s.color} fillOpacity={hot && hot.key !== s.key ? 0.3 : 1} />
              ))}
            </Pie>
          </PieChart>
          <div className="label">
            <div>
              <b>{fmt.money(hot ? hot.value : total, { compact: true })}</b>
              <small>{hot ? `${hot.label} · ${formatPct(hot.value / total, false, 0)}` : centerLabel}</small>
            </div>
          </div>
        </div>
        <div className="list">
          {slices.map((s) => (
            <div
              className={`list-row legend-row ${active === s.key ? 'on' : ''}`}
              key={s.key}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
            >
              <i className="key-dot" style={{ background: s.color }} />
              <div className="grow title" style={{ fontWeight: 500 }}>
                {s.label}
              </div>
              <span className="faint num" style={{ fontSize: 12.5 }}>
                {total > 0 ? formatPct(Math.max(0, s.value) / total, false, 1) : '—'}
              </span>
              <span className="num" style={{ minWidth: 92, textAlign: 'right', fontWeight: 560 }}>
                {fmt.money(s.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- month-over-month change bars ----------

function RoundedBar(props: any) {
  const { x, y, width, height, fill, payload } = props
  if (!width || !height || !Number.isFinite(height)) return null
  const h = Math.abs(height)
  const top = height < 0 ? y + height : y
  const negative = (payload?.change ?? 0) < 0
  const r = Math.min(4, h, width / 2)
  const L = x
  const R = x + width
  const T = top
  const B = top + h
  const d = negative
    ? `M${L},${T} H${R} V${B - r} Q${R},${B} ${R - r},${B} H${L + r} Q${L},${B} ${L},${B - r} Z`
    : `M${L},${B} V${T + r} Q${L},${T} ${L + r},${T} H${R - r} Q${R},${T} ${R},${T + r} V${B} Z`
  return <path d={d} fill={fill} />
}

export function ChangeBars({ points, height = 220 }: { points: HistoryPoint[]; height?: number }) {
  const { c, fmt, x, y } = useAxis()
  const data = points.slice(1).map((p, i) => {
    const prev = points[i].totals.netWorth
    const change = p.totals.netWorth - prev
    return { month: p.month, label: monthLabel(p.month, 'axis'), change, pct: prev > 0 ? change / prev : null, live: p.live }
  })
  if (data.length === 0) {
    return <p className="muted">Monthly changes appear once a second month is recorded.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" {...x} />
        <YAxis {...y} />
        <ReferenceLine y={0} stroke={c.axis} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.6 }}
          content={({ active, payload }) => {
            const d = active && payload?.[0]?.payload
            if (!d) return null
            return (
              <Tip
                title={`${monthLabel(d.month, 'long')}${d.live ? ' · so far' : ''}`}
                rows={[
                  { label: 'Change', value: fmt.money(d.change, { sign: true }) },
                  { label: 'Change %', value: formatPct(d.pct) }
                ]}
              />
            )
          }}
        />
        <Bar dataKey="change" maxBarSize={24} shape={<RoundedBar />} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.month} fill={d.change >= 0 ? c.good : c.bad} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- stacked history by category ----------

export function CategoryStack({ points, height = 280 }: { points: HistoryPoint[]; height?: number }) {
  const { c, fmt, x, y } = useAxis()
  const anyUnsplit = points.some((p) => p.unsplit > 0.5)
  const keys = [...CATEGORIES, ...(anyUnsplit ? (['unsplit'] as const) : [])]
  const colorOf = (k: string) => (k === 'unsplit' ? c.none : c.series[CATEGORIES.indexOf(k as any)])
  const labelOf = (k: string) => (k === 'unsplit' ? 'Not split' : CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL])
  const data = points.map((p) => ({
    month: p.month,
    label: monthLabel(p.month, 'axis'),
    live: p.live,
    equities: p.totals.equities,
    crypto: p.totals.crypto,
    cash: p.totals.cash,
    other: p.totals.other,
    unsplit: p.unsplit,
    netWorth: p.totals.netWorth
  }))
  const used = keys.filter((k) => data.some((d) => (d as any)[k] > 0))
  const top = used[used.length - 1]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="legend">
        {used.map((k) => (
          <span key={k}>
            <i className="key-dot" style={{ background: colorOf(k) }} />
            {labelOf(k)}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="label" {...x} />
          <YAxis {...y} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const d = active && payload?.[0]?.payload
              if (!d) return null
              return (
                <Tip
                  title={`${monthLabel(d.month, 'long')}${d.live ? ' · so far' : ''}`}
                  rows={[
                    ...used
                      .slice()
                      .reverse()
                      .map((k) => ({ color: colorOf(k), label: labelOf(k), value: fmt.money(d[k]) })),
                    { label: 'Net worth', value: fmt.money(d.netWorth) }
                  ]}
                />
              )
            }}
          />
          {used.map((k) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="nw"
              fill={colorOf(k)}
              stroke={c.surface}
              strokeWidth={1.5}
              maxBarSize={28}
              radius={k === top ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
