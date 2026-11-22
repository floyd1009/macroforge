import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Target, TrendingUp } from 'lucide-react'
import { BodyCard } from '../components/BodyCard'
import { Badge, Card, EmptyState, Screen, SectionTitle, Segmented } from '../components/ui'
import { addDays, daysBetween, fromKey, humanDate, todayKey, type DateKey } from '../lib/date'
import { kcal as fmtKcal, kg as fmtKg, num, signed } from '../lib/format'
import { daysToGoal, weightSlopeKgPerDay } from '../lib/nutrition'
import { buildTrends, type DayIntake } from '../lib/repo'
import { db } from '../lib/db'
import type { CheckIn } from '../lib/types'

type Range = '30' | '90' | '180' | '365'
type Point = { date: DateKey; value: number }

const shortDate = (d: DateKey) => fromKey(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function Trends() {
  const [range, setRange] = useState<Range>('90')
  const data = useLiveQuery(async () => {
    // Touch the tables so the charts refresh when anything they use changes.
    await Promise.all([db.weights.count(), db.entries.count(), db.checkins.count(), db.profile.get('me')])
    return buildTrends()
  }, [])

  if (!data) {
    return (
      <Screen title="Trends">
        <div className="mt-4 space-y-3">
          <div className="skeleton h-48 rounded-card" />
          <div className="skeleton h-32 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { profile, weights, trend, intake, expenditure, liveTargets, checkins, expenditureHistory } = data
  const from = addDays(todayKey(), -Number(range))
  const inRange = <T extends { date: DateKey }>(rows: T[]) => rows.filter((r) => r.date >= from)

  const rawPts = inRange(weights).map((w) => ({ date: w.date, value: w.kg }))
  const trendPts = inRange(trend).map((t) => ({ date: t.date, value: t.trendKg }))
  const last = trend[trend.length - 1]
  const firstInRange = trendPts[0]
  const changeInRange = last && firstInRange ? last.trendKg - firstInRange.value : undefined
  const target = checkins[0]?.targets.kcal ?? profile.manualTargets?.kcal ?? liveTargets.kcal

  return (
    <Screen title="Trends">
      <Segmented
        className="mt-2"
        options={[
          { value: '30' as Range, label: '1 M' },
          { value: '90' as Range, label: '3 M' },
          { value: '180' as Range, label: '6 M' },
          { value: '365' as Range, label: '1 Y' },
        ]}
        value={range}
        onChange={setRange}
      />

      <SectionTitle>Weight</SectionTitle>
      {trend.length < 2 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp size={28} />}
            title="Not enough data yet"
            body="Two weigh-ins gives you a smoothed trend. About three weeks makes your real expenditure calculable."
          />
        </Card>
      ) : (
        <Card className="p-4">
          <LineChart
            label="Weight over time"
            unit="kg"
            digits={1}
            series={[
              { points: rawPts, color: 'var(--color-raw)', width: 1.25, gaps: true, name: 'Scale' },
              { points: trendPts, color: 'var(--color-trend)', width: 2.25, name: 'Trend' },
            ]}
            guide={profile.goalWeightKg != null ? { value: profile.goalWeightKg, name: 'Goal' } : undefined}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
            <Stat label="Scale" value={`${fmtKg(weights[weights.length - 1].kg)} kg`} />
            <Stat label="Trend" value={`${fmtKg(last.trendKg)} kg`} />
            <Stat
              label="In this range"
              value={changeInRange != null ? `${signed(changeInRange, 'en', 1)} kg` : '–'}
            />
          </div>
        </Card>
      )}

      {profile.goal !== 'maintain' && last && (
        <GoalProgress
          trend={trend}
          startKg={trend[0].trendKg}
          currentKg={last.trendKg}
          goalKg={profile.goalWeightKg}
          plannedRate={profile.rateKgPerWeek}
        />
      )}

      <SectionTitle
        action={
          <Badge tone={expenditure.confidence === 'high' ? 'ok' : expenditure.confidence === 'medium' ? 'warn' : 'neutral'}>
            {expenditure.confidence === 'high'
              ? 'measured'
              : expenditure.confidence === 'medium'
                ? 'part measured'
                : 'estimated'}
          </Badge>
        }
      >
        Expenditure
      </SectionTitle>
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-display text-[2.5rem] leading-none">{fmtKcal(expenditure.tdee)}</div>
            <div className="mt-1.5 text-xs font-semibold text-txt-2">kcal per day</div>
          </div>
          {expenditure.meanIntake > 0 && (
            <div className="text-right">
              <div className="numeric text-sm font-extrabold">
                {signed(expenditure.meanIntake - expenditure.tdee)} kcal
              </div>
              <div className="label-micro mt-1.5 text-[0.5625rem] text-txt-3">energy balance</div>
            </div>
          )}
        </div>

        {inRange(expenditureHistory).length >= 2 && (
          <div className="mt-4">
            <LineChart
              label="Expenditure over time"
              unit="kcal"
              digits={0}
              height={96}
              series={[
                {
                  points: inRange(expenditureHistory).map((e) => ({ date: e.date, value: e.tdee })),
                  color: 'var(--color-fat)',
                  width: 2.25,
                  name: 'Expenditure',
                },
              ]}
            />
          </div>
        )}

        {/* How much of the number is real data vs. a population formula. */}
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[0.6875rem] text-txt-3">
            <span>Share from real measurements</span>
            <span>{Math.round(expenditure.dataWeight * 100)} %</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-trend transition-[width] duration-500"
              style={{ width: `${expenditure.dataWeight * 100}%` }}
            />
          </div>
        </div>

        <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          {expenditure.note}. Calories out equal calories in minus the change in stored energy: your
          average intake
          {expenditure.meanIntake > 0 && ` (${fmtKcal(expenditure.meanIntake)} kcal)`}, minus the trend
          weight change at 7,700 kcal per kg. That constant assumes the change is mostly fat; it
          overstates the energy when lean mass or water is moving, as in the first week of a diet.
        </p>
      </Card>

      <SectionTitle>Intake, last 14 days</SectionTitle>
      {intake.length === 0 ? (
        <Card>
          <EmptyState title="Nothing logged yet" />
        </Card>
      ) : (
        <Card className="p-4">
          <IntakeBars intake={intake} target={target} />
        </Card>
      )}

      {checkins.length > 0 && (
        <>
          <SectionTitle>Check-ins</SectionTitle>
          <Card>
            <ul>
              {checkins.slice(0, 8).map((c) => (
                <CheckinRow key={c.id} c={c} />
              ))}
            </ul>
          </Card>
        </>
      )}

      <BodyCard />
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="numeric text-[1.0625rem] font-extrabold">{value}</div>
      <div className="label-micro mt-1 text-[0.5625rem] text-txt-3">{label}</div>
    </div>
  )
}

function CheckinRow({ c }: { c: CheckIn }) {
  const delta = c.prevTargets ? c.targets.kcal - c.prevTargets.kcal : 0
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
      <div>
        <p className="text-[0.875rem] font-bold tracking-[-0.015em]">{shortDate(c.date)}</p>
        <p className="numeric mt-0.5 text-[0.6875rem] font-semibold text-txt-3">
          Burned {fmtKcal(c.tdee)}
          {c.trendDeltaKg != null && ` · ${signed(c.trendDeltaKg, 'en', 2)} kg`}
        </p>
      </div>
      <div className="text-right">
        <p className="numeric text-[0.9375rem] font-extrabold">{fmtKcal(c.targets.kcal)} kcal</p>
        <p className="numeric mt-0.5 text-[0.6875rem] font-semibold text-txt-3">
          {delta === 0 ? 'unchanged' : signed(delta)}
        </p>
      </div>
    </li>
  )
}

/**
 * Where the goal stands: distance covered, and when it lands at the pace the
 * scale has actually shown rather than the pace that was planned.
 */
function GoalProgress({
  trend,
  startKg,
  currentKg,
  goalKg,
  plannedRate,
}: {
  trend: Array<{ date: DateKey; trendKg: number }>
  startKg: number
  currentKg: number
  goalKg?: number
  plannedRate: number
}) {
  const fit = weightSlopeKgPerDay(trend, 28)
  const actualRate = fit ? fit.slope * 7 : 0
  const planned = daysToGoal(currentKg, goalKg, plannedRate)
  const actual = daysToGoal(currentKg, goalKg, actualRate)
  const done = goalKg != null && startKg !== goalKg ? (startKg - currentKg) / (startKg - goalKg) : null
  const reached = goalKg != null && Math.sign(goalKg - currentKg) !== Math.sign(plannedRate)
  const eta = (days: number) =>
    fromKey(addDays(todayKey(), days)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <SectionTitle>Goal</SectionTitle>
      <Card className="p-4">
        {goalKg == null ? (
          <div className="flex items-start gap-3">
            <Target size={18} className="mt-0.5 shrink-0 text-txt-3" />
            <p className="text-[0.8125rem] leading-relaxed text-txt-2">
              Planned {signed(plannedRate, 'en', 2)} kg a week, measured {signed(actualRate, 'en', 2)} kg a
              week over the last four weeks. Set a goal weight in Settings to get an end date.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-[0.6875rem] font-semibold text-txt-3">
              <span className="numeric">{fmtKg(startKg)} kg</span>
              <span className="numeric text-[0.9375rem] font-extrabold text-txt">
                {reached ? 'Goal reached' : `${num(Math.abs(goalKg - currentKg), 1)} kg to go`}
              </span>
              <span className="numeric">{fmtKg(goalKg)} kg</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
              <div
                className="h-full rounded-full bg-trend transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(1, done ?? 0)) * 100}%` }}
              />
            </div>
            {!reached && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3.5">
                <Stat label="At planned pace" value={planned != null ? eta(planned) : '–'} />
                <Stat label="At measured pace" value={actual != null ? eta(actual) : 'not converging'} />
              </div>
            )}
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
              Planned {signed(plannedRate, 'en', 2)} kg a week, measured {signed(actualRate, 'en', 2)} kg a
              week over the last four weeks. The measured date is a straight-line projection and moves as
              the trend does.
            </p>
          </>
        )}
      </Card>
    </>
  )
}

interface Series {
  points: Point[]
  color: string
  width: number
  name: string
  /** Break the line where readings are more than three days apart. */
  gaps?: boolean
}

/**
 * Time series on a shared date axis. For weight, the raw scale readings are
 * drawn faintly with real gaps where days were missed and the smoothed trend
 * solid on top — the raw line is the noise the trend exists to remove.
 */
function LineChart({
  series,
  label,
  unit,
  digits,
  height = 130,
  guide,
}: {
  series: Series[]
  label: string
  unit: string
  digits: number
  height?: number
  guide?: { value: number; name: string }
}) {
  const W = 320
  const H = height

  const { paths, min, max, first, guideY } = useMemo(() => {
    const PAD = { l: 4, r: 4, t: 8, b: 14 }
    const all = series.flatMap((s) => s.points.map((p) => p.value))
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    // The goal line is only worth stretching the axis for when it is close.
    const showGuide = guide != null && Math.abs(guide.value - (lo + hi) / 2) < Math.max(4, (hi - lo) * 2)
    if (showGuide) {
      lo = Math.min(lo, guide.value)
      hi = Math.max(hi, guide.value)
    }
    // Never let a flat series render as a flat line at the very edge.
    const minSpan = digits === 0 ? 200 : 1
    if (hi - lo < minSpan) {
      const mid = (hi + lo) / 2
      lo = mid - minSpan * 0.75
      hi = mid + minSpan * 0.75
    }
    const pad = (hi - lo) * 0.12
    lo -= pad
    hi += pad

    const dates = series.flatMap((s) => s.points.map((p) => p.date)).sort()
    const start = dates[0] ?? todayKey()
    const span = Math.max(1, daysBetween(start, todayKey()))
    const x = (d: DateKey) => PAD.l + (daysBetween(start, d) / span) * (W - PAD.l - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)

    return {
      paths: series.map((s) => {
        let d = ''
        let prev: DateKey | null = null
        for (const p of s.points) {
          const joined = prev && (!s.gaps || daysBetween(prev, p.date) <= 3)
          d += `${joined ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)} `
          prev = p.date
        }
        return d
      }),
      min: lo,
      max: hi,
      first: start,
      guideY: showGuide ? y(guide.value) : null,
    }
  }, [series, guide, digits, H])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {guideY != null && (
          <line x1={4} x2={W - 4} y1={guideY} y2={guideY} stroke="var(--color-ok)" strokeWidth={1} strokeDasharray="3 4" />
        )}
        {paths.map((d, i) => (
          <path
            key={series[i].name}
            d={d}
            fill="none"
            stroke={series[i].color}
            strokeWidth={series[i].width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <text x={4} y={H - 2} textAnchor="start" className="fill-txt-3" style={{ fontSize: 9 }}>
          {shortDate(first)}
        </text>
        <text x={W - 4} y={H - 2} textAnchor="end" className="fill-txt-3" style={{ fontSize: 9 }}>
          today
        </text>
      </svg>
      <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-txt-3">
        <span className="inline-flex items-center gap-3">
          {series.length > 1 &&
            series
              .slice()
              .reverse()
              .map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ background: s.color }} /> {s.name}
                </span>
              ))}
          {guideY != null && guide && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t border-dashed border-ok" /> {guide.name}
            </span>
          )}
        </span>
        <span className="tabular-nums">
          {num(min, digits)}–{num(max, digits)} {unit}
        </span>
      </div>
    </div>
  )
}

function IntakeBars({ intake, target }: { intake: DayIntake[]; target: number }) {
  const days = 14
  const start = addDays(todayKey(), -(days - 1))
  const byDate = new Map(intake.map((i) => [i.date, i]))
  const series = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i)
    return { date: d, kcal: byDate.get(d)?.kcal ?? 0 }
  })
  const max = Math.max(target * 1.25, ...series.map((s) => s.kcal))
  const logged = series.filter((s) => s.kcal > 0)
  const mean = (k: 'kcal' | 'protein' | 'carbs' | 'fat') =>
    logged.length ? logged.reduce((s, x) => s + (byDate.get(x.date)?.[k] ?? 0), 0) / logged.length : 0

  return (
    <div>
      <div className="relative flex h-20 items-end gap-1">
        {/* The target as a line across the bars, so over and under read at a glance. */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-tick/40"
          style={{ bottom: `${(target / max) * 100}%` }}
        />
        {series.map((s) => (
          <div
            key={s.date}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(s.kcal > 0 ? 3 : 0, (s.kcal / max) * 100)}%`,
              background: s.kcal > 0 ? 'var(--color-kcal)' : 'transparent',
              opacity: 0.85,
            }}
            title={`${humanDate(s.date)}: ${fmtKcal(s.kcal)} kcal`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {series.map((s) => (
          <span key={s.date} className="flex-1 text-center text-[0.5625rem] leading-none text-txt-4">
            {fromKey(s.date).getDate()}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3.5 text-center">
        {[
          ['kcal', fmtKcal(mean('kcal'))],
          ['Protein', `${Math.round(mean('protein'))} g`],
          ['Carbs', `${Math.round(mean('carbs'))} g`],
          ['Fat', `${Math.round(mean('fat'))} g`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="numeric text-[0.9375rem] font-extrabold">{value}</div>
            <div className="mt-0.5 text-[0.6875rem] text-txt-3">{label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.6875rem] text-txt-3">
        Daily average over {logged.length} logged {logged.length === 1 ? 'day' : 'days'}. Dashed line:
        target of {num(Math.round(target))} kcal.
      </p>
    </div>
  )
}
