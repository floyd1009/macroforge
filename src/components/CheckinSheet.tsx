import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Sheet } from './ui'
import { fromKey, type DateKey } from '../lib/date'
import { kcal as fmtKcal, kg as fmtKg, signed } from '../lib/format'
import { buildCheckinReview, completeCheckin } from '../lib/repo'
import type { MacroTargets } from '../lib/types'

const day = (d: DateKey) => fromKey(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

type Review = Awaited<ReturnType<typeof buildCheckinReview>>

/**
 * The weekly check-in: what happened, what the estimate now says, and the
 * targets that follow from it. Nothing changes until the user accepts.
 */
export function CheckinSheet({ onClose }: { onClose: () => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void buildCheckinReview().then(setReview)
  }, [])

  const finish = async (accept: boolean) => {
    if (!review) return
    setBusy(true)
    await completeCheckin(review, accept)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Weekly check-in" full>
      {!review ? (
        <div className="skeleton h-48 rounded-card" />
      ) : (
        <div className="space-y-5 pb-2">
          <p className="text-[0.8125rem] font-semibold text-txt-3">
            {day(review.from)} to {day(review.to)} · {review.days} days
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Tile label="Days logged" value={`${review.daysLogged} / ${review.days}`} />
            <Tile label="Weigh-ins" value={String(review.weighIns)} />
            <Tile
              label="Average intake"
              value={review.avgIntake != null ? `${fmtKcal(review.avgIntake)} kcal` : '–'}
            />
            <Tile
              label="Trend weight"
              value={review.trendKg != null ? `${fmtKg(review.trendKg)} kg` : '–'}
              sub={review.trendDeltaKg != null ? `${signed(review.trendDeltaKg, 'en', 2)} kg` : undefined}
            />
          </div>

          <section>
            <h3 className="label-micro mb-2 text-txt-3">Expenditure</h3>
            <div className="rounded-tile border border-line bg-surface-2 px-4 py-3.5">
              <Change
                from={review.prevTdee != null ? `${fmtKcal(review.prevTdee)}` : undefined}
                to={`${fmtKcal(review.tdee)} kcal`}
              />
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-txt-3">
                Average intake minus the energy stored or released by the change in trend weight, at
                7,700 kcal per kg. {Math.round(review.dataWeight * 100)}% of this number is measured from
                your log; the rest is still a formula estimate.
              </p>
            </div>
          </section>

          <section>
            <h3 className="label-micro mb-2 text-txt-3">Targets for the coming week</h3>
            <div className="rounded-tile border border-line bg-surface-2 px-4 py-1">
              <TargetRow label="Calories" unit="kcal" k="kcal" next={review.targets} prev={review.prevTargets} />
              <TargetRow label="Protein" unit="g" k="protein" next={review.targets} prev={review.prevTargets} />
              <TargetRow label="Carbs" unit="g" k="carbs" next={review.targets} prev={review.prevTargets} />
              <TargetRow label="Fat" unit="g" k="fat" next={review.targets} prev={review.prevTargets} />
            </div>
          </section>

          {review.notes.length > 0 && (
            <ul className="space-y-2">
              {review.notes.map((n) => (
                <li
                  key={n}
                  className="rounded-tile border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-txt-2"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[0.6875rem] leading-relaxed text-txt-3">
            Targets come from what you burned, not from how closely you hit last week's numbers. A week
            over or under target is not carried forward.
          </p>

          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void finish(false)}>
              Keep current
            </Button>
            <Button variant="primary" className="flex-1" loading={busy} onClick={() => void finish(true)}>
              Accept targets
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-tile border border-line bg-surface-2 px-3.5 py-3">
      <div className="label-micro text-[0.5625rem] text-txt-3">{label}</div>
      <div className="numeric mt-1.5 text-[1.0625rem] font-extrabold leading-none">{value}</div>
      {sub && <div className="numeric mt-1 text-[0.6875rem] font-semibold text-txt-3">{sub}</div>}
    </div>
  )
}

function Change({ from, to }: { from?: string; to: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {from && (
        <>
          <span className="numeric text-[0.9375rem] font-bold text-txt-3">{from}</span>
          <ArrowRight size={14} className="text-txt-4" />
        </>
      )}
      <span className="numeric text-[1.25rem] font-extrabold leading-none">{to}</span>
    </div>
  )
}

function TargetRow({
  label,
  unit,
  k,
  next,
  prev,
}: {
  label: string
  unit: string
  k: keyof Pick<MacroTargets, 'kcal' | 'protein' | 'carbs' | 'fat'>
  next: MacroTargets
  prev?: MacroTargets
}) {
  const delta = prev ? next[k] - prev[k] : 0
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2.5 last:border-b-0">
      <span className="text-[0.8125rem] font-semibold text-txt-2">{label}</span>
      <span className="flex items-baseline gap-2">
        {prev && delta !== 0 && (
          <span className="numeric text-[0.6875rem] font-semibold text-txt-3">{signed(delta)}</span>
        )}
        <span className="numeric text-[0.9375rem] font-extrabold">
          {fmtKcal(next[k])} <span className="text-[0.6875rem] font-semibold text-txt-3">{unit}</span>
        </span>
      </span>
    </div>
  )
}
