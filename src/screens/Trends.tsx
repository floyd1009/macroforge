import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, EmptyState, Screen, SectionTitle, Badge } from '../components/ui'
import { TrendingUp } from 'lucide-react'
import { addDays, daysBetween, todayKey, type DateKey } from '../lib/date'
import { kcal as fmtKcal, kg as fmtKg, num, signed } from '../lib/format'
import { getProfile, getSettings } from '../lib/db'
import { intakeHistory, weightHistory } from '../lib/repo'
import { adaptiveExpenditure, trendSeries } from '../lib/nutrition'

export default function Trends() {
  const data = useLiveQuery(async () => {
    const [weights, intake, profile, settings] = await Promise.all([
      weightHistory(180),
      intakeHistory(90),
      getProfile(),
      getSettings(),
    ])
    const trend = trendSeries(
      weights.map((w) => ({ date: w.date, kg: w.kg })),
      settings.weightTrendAlpha,
    )
    const last = trend[trend.length - 1]
    const expenditure = adaptiveExpenditure({
      profile,
      intake,
      trend,
      currentKg: last?.trendKg ?? last?.kg ?? 75,
      bodyFatPct: weights[weights.length - 1]?.bodyFatPct,
    })
    return { weights, intake, trend, expenditure }
  }, [])

  if (!data) {
    return (
      <Screen title="Verlauf">
        <div className="mt-4 space-y-3">
          <div className="skeleton h-48 rounded-card" />
          <div className="skeleton h-32 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { weights, intake, trend, expenditure } = data

  return (
    <Screen title="Verlauf">
      <SectionTitle>Gewicht</SectionTitle>
      {trend.length < 2 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp size={28} />}
            title="Noch zu wenig Daten"
            body="Ab zwei Wiegungen erscheint hier dein geglätteter Trend. Ab etwa drei Wochen wird dein tatsächlicher Verbrauch berechenbar."
          />
        </Card>
      ) : (
        <Card className="p-4">
          <WeightChart
            raw={weights.map((w) => ({ date: w.date, value: w.kg }))}
            trend={trend.map((t) => ({ date: t.date, value: t.trendKg }))}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
            <Stat label="Aktuell" value={`${fmtKg(weights[weights.length - 1].kg)} kg`} />
            <Stat label="Trend" value={`${fmtKg(trend[trend.length - 1].trendKg)} kg`} />
            <Stat
              label="pro Woche"
              value={`${signed(expenditure.slopeKgPerWeek, 'de', 2)} kg`}
            />
          </div>
        </Card>
      )}

      <SectionTitle>Verbrauch</SectionTitle>
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[1.75rem] font-bold leading-none">{fmtKcal(expenditure.tdee)}</div>
            <div className="mt-1.5 text-xs text-txt-2">kcal pro Tag</div>
          </div>
          <Badge tone={expenditure.confidence === 'high' ? 'ok' : expenditure.confidence === 'medium' ? 'warn' : 'neutral'}>
            {expenditure.confidence === 'high'
              ? 'gemessen'
              : expenditure.confidence === 'medium'
                ? 'teilweise gemessen'
                : 'geschätzt'}
          </Badge>
        </div>

        {/* How much of the number is real data vs. a population formula. */}
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[0.6875rem] text-txt-3">
            <span>Anteil echter Messdaten</span>
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
          {expenditure.note}. Berechnet aus deiner durchschnittlichen Zufuhr
          {expenditure.meanIntake > 0 && ` (${fmtKcal(expenditure.meanIntake)} kcal)`} und der
          tatsächlichen Gewichtsveränderung — nicht aus einer Formel für einen Durchschnittsmenschen.
        </p>
      </Card>

      <SectionTitle>Zufuhr, letzte 14 Tage</SectionTitle>
      {intake.length === 0 ? (
        <Card>
          <EmptyState title="Noch nichts protokolliert" />
        </Card>
      ) : (
        <Card className="p-4">
          <IntakeBars intake={intake} target={expenditure.tdee} />
        </Card>
      )}
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.9375rem] font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[0.6875rem] text-txt-3">{label}</div>
    </div>
  )
}

/**
 * Weight over time: the raw scale readings drawn faintly with real gaps where
 * days were missed, and the smoothed trend drawn solid on top. Showing both is
 * the point — the raw line is the noise the trend exists to remove.
 */
function WeightChart({
  raw,
  trend,
}: {
  raw: Array<{ date: DateKey; value: number }>
  trend: Array<{ date: DateKey; value: number }>
}) {
  const W = 320
  const H = 130
  const PAD = { l: 4, r: 4, t: 8, b: 14 }

  const { rawPath, trendPath, min, max, labels } = useMemo(() => {
    const all = [...raw.map((r) => r.value), ...trend.map((t) => t.value)]
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    // Never let a flat series render as a flat line at the very edge.
    if (hi - lo < 1) {
      const mid = (hi + lo) / 2
      lo = mid - 0.75
      hi = mid + 0.75
    }
    const pad = (hi - lo) * 0.12
    lo -= pad
    hi += pad

    const first = trend[0]?.date ?? raw[0]?.date ?? todayKey()
    const last = todayKey()
    const span = Math.max(1, daysBetween(first, last))

    const x = (d: DateKey) => PAD.l + (daysBetween(first, d) / span) * (W - PAD.l - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)

    // Raw readings break the line at gaps so a missing week is visible.
    let rp = ''
    let prev: DateKey | null = null
    for (const p of raw) {
      const cmd = prev && daysBetween(prev, p.date) <= 3 ? 'L' : 'M'
      rp += `${cmd}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)} `
      prev = p.date
    }

    const tp = trend
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')

    return {
      rawPath: rp,
      trendPath: tp,
      min: lo,
      max: hi,
      labels: [
        { x: PAD.l, text: new Date(first).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) },
        { x: W - PAD.r, text: 'heute' },
      ],
    }
  }, [raw, trend])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gewichtsverlauf">
        <path d={rawPath} fill="none" stroke="var(--color-raw)" strokeWidth={1.25} strokeLinecap="round" opacity={0.85} />
        <path d={trendPath} fill="none" stroke="var(--color-trend)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 2}
            textAnchor={i === 0 ? 'start' : 'end'}
            className="fill-txt-3"
            style={{ fontSize: 9 }}
          >
            {l.text}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-txt-3">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-trend" /> Trend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-raw" /> Waage
          </span>
        </span>
        <span className="tabular-nums">
          {fmtKg(min)}–{fmtKg(max)} kg
        </span>
      </div>
    </div>
  )
}

function IntakeBars({ intake, target }: { intake: Array<{ date: DateKey; kcal: number }>; target: number }) {
  const days = 14
  const start = addDays(todayKey(), -(days - 1))
  const byDate = new Map(intake.map((i) => [i.date, i.kcal]))
  const series = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i)
    return { date: d, kcal: byDate.get(d) ?? 0 }
  })
  const max = Math.max(target * 1.25, ...series.map((s) => s.kcal))
  const logged = series.filter((s) => s.kcal > 0)
  const avg = logged.length ? logged.reduce((s, x) => s + x.kcal, 0) / logged.length : 0

  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {series.map((s) => (
          <div key={s.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-full w-full items-end">
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${Math.max(s.kcal > 0 ? 3 : 0, (s.kcal / max) * 100)}%`,
                  background: s.kcal > 0 ? 'var(--color-kcal)' : 'transparent',
                  opacity: s.kcal > 0 ? 0.85 : 1,
                }}
                title={`${s.date}: ${fmtKcal(s.kcal)} kcal`}
              />
            </div>
            <span className="text-[0.5625rem] text-txt-4">
              {new Date(s.date).getDate()}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-line pt-3 text-[0.6875rem] text-txt-3">
        <span>
          Ø {fmtKcal(avg)} kcal an {logged.length} protokollierten Tagen
        </span>
        <span className="tabular-nums">Ziel {num(Math.round(target))}</span>
      </div>
    </div>
  )
}
