import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Screen, SectionTitle, Sheet } from '../../components/ui'
import { MUSCLE_LABELS } from '../../data/exercises'
import { humanDate, type DateKey } from '../../lib/date'
import { db } from '../../lib/db'
import { num } from '../../lib/format'
import { exerciseHistory, exerciseRecords, type ExerciseSession } from '../../lib/training'
import { BackButton } from './shared'
import { fmtLoad, fmtSet } from './util'
import { incrementFor } from './store'

export default function ExerciseDetail() {
  const { id: raw = '' } = useParams()
  const id = decodeURIComponent(raw)
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const data = useLiveQuery(async () => {
    const [exercise, workouts] = await Promise.all([db.exercises.get(id), db.workouts.toArray()])
    return { exercise: exercise ?? null, workouts }
  }, [id])

  if (!data) {
    return (
      <Screen title="Exercise" left={<BackButton />}>
        <div className="skeleton mt-4 h-40 rounded-card" />
      </Screen>
    )
  }
  const { exercise: ex, workouts } = data
  if (!ex || ex.deleted) {
    return (
      <Screen title="Exercise" left={<BackButton />}>
        <Card className="mt-2">
          <EmptyState title="Exercise not found" />
        </Card>
      </Screen>
    )
  }

  const history = exerciseHistory(workouts, id)
  const rec = exerciseRecords(history)
  const points = history.filter((h) => h.bestE1rm > 0).map((h) => ({ date: h.date, at: h.startedAt, value: h.bestE1rm }))
  const loaded = history.some((h) => h.topWeight > 0)

  return (
    <Screen
      title={ex.name}
      subtitle={[MUSCLE_LABELS[ex.primary], ex.equipment].filter(Boolean).join(' · ')}
      left={<BackButton />}
      right={
        ex.isCustom ? (
          <IconButton label="Delete exercise" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} />
          </IconButton>
        ) : undefined
      }
    >
      <Card className="mt-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="brand">{MUSCLE_LABELS[ex.primary]}</Badge>
          {ex.secondary.map((m) => (
            <Badge key={m}>{MUSCLE_LABELS[m]}</Badge>
          ))}
          {ex.bodyweight && <Badge>Bodyweight</Badge>}
        </div>
        {ex.cues?.length ? (
          <ul className="mt-3.5 space-y-2">
            {ex.cues.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-snug text-txt-2">
                <span className="numeric mt-px shrink-0 font-extrabold text-txt-4">{i + 1}</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-snug text-txt-3">
            {ex.isCustom ? 'Your own exercise.' : 'No technique notes for this movement yet.'}
          </p>
        )}
        <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          {ex.bodyweight
            ? 'The weight field is load added to your body. Leave it empty for bodyweight only.'
            : ex.equipment === 'Dumbbell'
              ? `Log the weight of one dumbbell. Load goes up in ${fmtLoad(incrementFor(ex))} kg steps.`
              : `Load goes up in ${fmtLoad(incrementFor(ex))} kg steps.`}
        </p>
      </Card>

      <SectionTitle>Records</SectionTitle>
      {history.length === 0 ? (
        <Card>
          <EmptyState title="Not logged yet" body="Records and the strength trend appear after the first session." />
        </Card>
      ) : (
        <Card className="grid grid-cols-2 gap-x-3 gap-y-4 p-4">
          {rec.e1rm && (
            <Record
              label="Estimated 1RM"
              value={`${Math.round(rec.e1rm.value)} kg`}
              detail={`${fmtSet(rec.e1rm.weight, rec.e1rm.reps)} · ${humanDate(rec.e1rm.date)}`}
            />
          )}
          {rec.heaviest && (
            <Record
              label="Heaviest set"
              value={`${fmtLoad(rec.heaviest.weight)} kg`}
              detail={`× ${rec.heaviest.reps} · ${humanDate(rec.heaviest.date)}`}
            />
          )}
          {rec.mostReps && (
            <Record
              label="Most reps"
              value={String(rec.mostReps.reps)}
              detail={`${rec.mostReps.weight > 0 ? `at ${fmtLoad(rec.mostReps.weight)} kg · ` : ''}${humanDate(rec.mostReps.date)}`}
            />
          )}
          {rec.volume && (
            <Record
              label="Most load in a session"
              value={`${num(Math.round(rec.volume.value))} kg`}
              detail={humanDate(rec.volume.date)}
            />
          )}
          <Record label="Sessions" value={String(history.length)} detail={`since ${humanDate(history[0].date)}`} />
        </Card>
      )}

      {loaded && (
        <>
          <SectionTitle>Estimated 1RM over time</SectionTitle>
          <Card className="p-4">
            {points.length < 2 ? (
              <p className="py-4 text-center text-[0.8125rem] text-txt-3">
                A trend needs at least two sessions with sets of 12 reps or fewer.
              </p>
            ) : (
              <StrengthChart points={points} />
            )}
            <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
              Best set of each session, converted with the Brzycki and Epley formulas and adjusted for
              reps in reserve. Those formulas are averages over many lifters: read the direction of
              the line, not the exact number. Sets above 12 reps are left out because the estimate
              degrades there.
            </p>
          </Card>
        </>
      )}

      {history.length > 0 && (
        <>
          <SectionTitle>History</SectionTitle>
          <ul className="space-y-2">
            {[...history].reverse().slice(0, 30).map((h) => (
              <li key={h.workoutId}>
                <HistoryRow session={h} onOpen={() => navigate(`/train/session/${h.workoutId}`)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {confirmDelete && (
        <Sheet open onClose={() => setConfirmDelete(false)} title="Delete this exercise?">
          <p className="text-[0.9375rem] leading-relaxed text-txt-2">
            It disappears from the library. Sessions that already contain it keep their sets.
          </p>
          <div className="mt-5 space-y-2">
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                await db.exercises.update(id, { deleted: true })
                navigate(-1)
              }}
            >
              <Trash2 size={16} /> Delete exercise
            </Button>
            <Button className="w-full" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}

function Record({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="label-micro text-[0.5625rem] text-txt-3">{label}</div>
      <div className="numeric mt-1 text-[1.25rem] font-extrabold leading-none tracking-[-0.02em]">{value}</div>
      <div className="numeric mt-1 truncate text-[0.6875rem] text-txt-3">{detail}</div>
    </div>
  )
}

function HistoryRow({ session: h, onOpen }: { session: ExerciseSession; onOpen: () => void }) {
  return (
    <button className="block w-full text-left" onClick={onOpen}>
      <Card className="px-4 py-3 active:bg-surface-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[0.8125rem] font-bold">{humanDate(h.date)}</p>
          {h.bestE1rm > 0 && (
            <p className="numeric text-[0.6875rem] text-txt-3">≈ {Math.round(h.bestE1rm)} kg 1RM</p>
          )}
        </div>
        <p className="numeric mt-1 text-[0.8125rem] leading-snug text-txt-2">
          {h.sets.map((s) => fmtSet(s.weightKg, s.reps)).join(' · ')}
        </p>
      </Card>
    </button>
  )
}

/**
 * Best estimated 1RM per session. Points are spaced by real time, not by
 * session number, so a three-week break shows as a gap instead of being
 * compressed into a misleadingly smooth line.
 */
function StrengthChart({ points }: { points: Array<{ date: DateKey; at: number; value: number }> }) {
  const W = 320
  const H = 130
  const PAD_L = 6
  const PAD_R = 6
  const PAD_T = 10
  const PAD_B = 16

  const { path, dots, lo, hi, firstLabel, lastLabel } = useMemo(() => {
    const values = points.map((p) => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    // A flat series should sit mid-chart, not on an edge.
    if (max - min < 2) {
      const mid = (max + min) / 2
      min = mid - 2
      max = mid + 2
    }
    const pad = (max - min) * 0.14
    min -= pad
    max += pad

    // Position by timestamp rather than calendar day, so two sessions on the
    // same day do not land on one x and draw a vertical line.
    const t0 = points[0].at
    const span = Math.max(1, points[points.length - 1].at - t0)
    const x = (at: number) => PAD_L + ((at - t0) / span) * (W - PAD_L - PAD_R)
    const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B)

    const first = points[0].date
    const last = points[points.length - 1].date
    const xy = points.map((p) => ({ x: x(p.at), y: y(p.value) }))
    const fmt = (d: DateKey) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return {
      path: xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      dots: xy,
      lo: Math.min(...values),
      hi: Math.max(...values),
      firstLabel: fmt(first),
      lastLabel: fmt(last),
    }
  }, [points])

  const change = points[points.length - 1].value - points[0].value

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Estimated one-rep max over time">
        <path d={path} fill="none" stroke="var(--color-trend)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        {dots.length <= 40 &&
          dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={i === dots.length - 1 ? 3.5 : 2.25}
              fill={i === dots.length - 1 ? 'var(--color-tick)' : 'var(--color-trend)'}
            />
          ))}
        <text x={PAD_L} y={H - 2} textAnchor="start" className="fill-txt-3" style={{ fontSize: 9 }}>
          {firstLabel}
        </text>
        <text x={W - PAD_R} y={H - 2} textAnchor="end" className="fill-txt-3" style={{ fontSize: 9 }}>
          {lastLabel}
        </text>
      </svg>
      <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-txt-3">
        <span className="numeric">
          {change >= 0 ? '+' : '−'}
          {num(Math.abs(change), 1)} kg over {points.length} sessions
        </span>
        <span className="numeric">
          {Math.round(lo)}–{Math.round(hi)} kg
        </span>
      </div>
    </div>
  )
}
