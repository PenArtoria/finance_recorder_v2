import { useState } from 'react'
import { CheckCircle2, Circle, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import type { GoalStatus } from '@/core/calc'
import { emptyData } from '@/core/data'
import { useApp } from '@/store'
import { ConfirmDialog } from '@/components/ui'

export function ExampleBanner() {
  const example = useApp((s) => s.data.example)
  const settings = useApp((s) => s.data.settings)
  const replace = useApp((s) => s.replace)
  const [confirm, setConfirm] = useState(false)
  if (!example) return null
  return (
    <>
      <div className="banner">
        <div className="grow">
          <b>You’re looking at an example portfolio.</b> The holdings and history are made up. Live prices are real.
        </div>
        <button className="btn sm primary" onClick={() => setConfirm(true)}>
          Start with my own numbers
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Clear the example?"
          body="The example holdings, buckets, goals and history are removed so you can enter your own."
          confirmLabel="Clear example"
          onConfirm={() => {
            const d = emptyData()
            d.onboarded = true
            d.settings = { ...settings }
            replace(d)
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  )
}

const STATUS: Record<GoalStatus, { label: string; cls: string; icon: typeof Clock }> = {
  reached: { label: 'Reached', cls: 'good', icon: CheckCircle2 },
  'on-track': { label: 'On track', cls: 'good', icon: TrendingUp },
  behind: { label: 'Behind', cls: 'warn', icon: TrendingDown },
  open: { label: 'No deadline', cls: '', icon: Circle },
  unknown: { label: 'Building history', cls: '', icon: Clock }
}

export function GoalStatusPill({ status }: { status: GoalStatus }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span className={`pill ${s.cls}`}>
      <Icon size={12} strokeWidth={2.4} />
      {s.label}
    </span>
  )
}
