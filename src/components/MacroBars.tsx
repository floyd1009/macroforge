import clsx from 'clsx'
import { clamp, grams as fmtGrams, kcal as fmtKcal, num } from '../lib/format'
import type { MacroTargets, Nutrients } from '../lib/types'

/**
 * Progress as a bar with a target tick, not a ring.
 *
 * A ring forces a 0–100 % mental model that breaks the moment you go over
 * target — and going over is normal. A bar lets the fill simply continue past
 * a white tick, showing overshoot neutrally, in the nutrient's own colour.
 * No red, no warning: red is the brand colour and the error colour, and using
 * it for "over budget" would make the app shame the user for a 40 kcal miss.
 */
export function ProgressBar({
  value,
  target,
  color,
  height = 8,
  className,
}: {
  value: number
  target: number
  color: string
  height?: number
  className?: string
}) {
  // The bar's full width represents 125% of target, so the tick sits at 80%
  // and there is visible room to overshoot into.
  const SCALE = 1.25
  const ratio = target > 0 ? value / target : 0
  const fill = clamp(ratio / SCALE, 0, 1)
  const tick = 1 / SCALE

  return (
    <div
      className={clsx('relative w-full overflow-hidden rounded-full bg-track', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${fill * 100}%`,
          background: color,
          transition: 'width 0.55s var(--ease-out-quint)',
        }}
      />
      <div
        className="absolute inset-y-0 w-px bg-tick/70"
        style={{ left: `${tick * 100}%` }}
        aria-hidden
      />
    </div>
  )
}

/** The day's calorie headline: number, target, bar, and the uncertainty band. */
export function CalorieHeader({
  consumed,
  target,
  uncertainty = 0,
  locale = 'de',
}: {
  consumed: number
  target: number
  /** Absolute ± kcal across everything logged today. */
  uncertainty?: number
  locale?: 'de' | 'en'
}) {
  const left = target - consumed
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[2.75rem] font-bold leading-none tracking-tight text-kcal">
            {fmtKcal(consumed, locale)}
          </div>
          <div className="mt-1.5 text-[0.8125rem] text-txt-2">
            kcal · von {fmtKcal(target, locale)}
          </div>
        </div>
        <div className="pb-0.5 text-right">
          <div className="text-lg font-semibold leading-none text-txt">
            {fmtKcal(Math.abs(left), locale)}
          </div>
          <div className="mt-1 text-[0.6875rem] text-txt-3">
            {left >= 0 ? 'übrig' : 'darüber'}
          </div>
        </div>
      </div>

      <ProgressBar value={consumed} target={target} color="var(--color-kcal)" height={10} className="mt-3.5" />

      {uncertainty > 0 && (
        // Showing the band is the honest alternative to false precision: a day
        // built from photo estimates is simply not known to the kcal.
        <div className="mt-2 text-[0.6875rem] text-txt-3">
          ± {num(Math.round(uncertainty), 0, locale)} kcal Unsicherheit aus deinen Schätzungen
        </div>
      )}
    </div>
  )
}

const MACROS = [
  { key: 'protein', label: 'Eiweiß', short: 'EW', color: 'var(--color-protein)' },
  { key: 'carbs', label: 'Kohlenhydrate', short: 'KH', color: 'var(--color-carb)' },
  { key: 'fat', label: 'Fett', short: 'F', color: 'var(--color-fat)' },
] as const

export function MacroRows({
  consumed,
  targets,
  showFiber = false,
  locale = 'de',
}: {
  consumed: Nutrients
  targets: MacroTargets
  showFiber?: boolean
  locale?: 'de' | 'en'
}) {
  const rows: Array<{ label: string; value: number; target: number; color: string }> = MACROS.map((m) => ({
    label: m.label,
    value: consumed[m.key],
    target: targets[m.key],
    color: m.color,
  }))

  // Fibre data is missing from most packaged products, so showing an empty
  // bar every day would be noise. Only show it when there is something to show.
  if (showFiber && targets.fiber) {
    rows.push({
      label: 'Ballaststoffe',
      value: consumed.fiber ?? 0,
      target: targets.fiber,
      color: 'var(--color-fiber)',
    })
  }

  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            {/* German macro names are long; keep them on one line and let the
                numbers hold the right edge. */}
            <span className="truncate text-[0.8125rem] text-txt-2">{r.label}</span>
            <span className="shrink-0 text-[0.8125rem] tabular-nums text-txt">
              {fmtGrams(r.value, locale)}
              <span className="text-txt-3"> / {fmtGrams(r.target, locale)} g</span>
            </span>
          </div>
          <ProgressBar value={r.value} target={r.target} color={r.color} />
        </div>
      ))}
    </div>
  )
}

/** Compact three-dot macro summary for list rows. */
export function MacroChips({ n, locale = 'de' }: { n: Nutrients; locale?: 'de' | 'en' }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.6875rem] tabular-nums text-txt-3">
      <Chip color="var(--color-protein)" label={`${fmtGrams(n.protein, locale)} EW`} />
      <Chip color="var(--color-carb)" label={`${fmtGrams(n.carbs, locale)} KH`} />
      <Chip color="var(--color-fat)" label={`${fmtGrams(n.fat, locale)} F`} />
    </span>
  )
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}
