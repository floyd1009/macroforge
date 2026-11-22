import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2, Trophy } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Screen, SectionTitle, Sheet } from '../../components/ui'
import { humanDate } from '../../lib/date'
import { db } from '../../lib/db'
import { duration, num } from '../../lib/format'
import {
  hardSets,
  isLogged,
  isWarmup,
  isWorking,
  newRecords,
  sessionVolume,
  setE1rm,
  tonnage,
  type NewRecord,
} from '../../lib/training'
import type { Exercise, Workout } from '../../lib/types'
import { BackButton, VolumeRow } from './shared'
import { fmtLoad, fmtSet } from './util'
import { orderedExerciseIds } from './store'

/**
 * One finished session. Arriving with `?done=1` (straight from finishing) it
 * opens with the summary sheet on top; later visits from history show the
 * same numbers inline.
 */
export default function Session() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const justFinished = params.get('done') === '1'

  const data = useLiveQuery(async () => {
    const [workout, all, exercises] = await Promise.all([
      db.workouts.get(id),
      db.workouts.toArray(),
      db.exercises.toArray(),
    ])
    return { workout: workout && !workout.deleted ? workout : null, all, exercises }
  }, [id])

  if (!data) {
    return (
      <Screen title="Session" left={<BackButton to="/train" />}>
        <div className="skeleton mt-4 h-40 rounded-card" />
      </Screen>
    )
  }
  if (!data.workout) {
    return (
      <Screen title="Session" left={<BackButton to="/train" />}>
        <Card className="mt-2">
          <EmptyState title="This session no longer exists" />
        </Card>
      </Screen>
    )
  }

  const { workout: w, all, exercises } = data
  const exMap = new Map(exercises.map((e) => [e.id, e]))
  const records = newRecords(w, all)
  const recordIds = new Set(records.map((r) => r.exerciseId))

  return (
    <Screen
      title={w.name ?? 'Workout'}
      subtitle={`${humanDate(w.date)} · ${new Date(w.startedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`}
      left={<BackButton to="/train" />}
      right={
        <IconButton label="Delete session" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={18} />
        </IconButton>
      }
    >
      <Summary workout={w} exercises={exMap} records={records} />

      <SectionTitle>Exercises</SectionTitle>
      <div className="space-y-2">
        {orderedExerciseIds(w)
          .filter((exId) => w.sets.some((s) => s.exerciseId === exId && isLogged(s)))
          .map((exId) => {
            const ex = exMap.get(exId)
            const sets = w.sets.filter((s) => s.exerciseId === exId && isLogged(s))
            const best = Math.max(0, ...sets.filter(isWorking).map((s) => (setE1rm(s).reliable ? setE1rm(s).value : 0)))
            return (
              <button
                key={exId}
                className="block w-full text-left"
                onClick={() => navigate(`/train/exercise/${encodeURIComponent(exId)}`)}
              >
                <Card className="p-3.5 active:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[0.9375rem] font-bold">{ex?.name ?? 'Exercise'}</p>
                    {recordIds.has(exId) && (
                      <Badge tone="brand">
                        <Trophy size={9} /> Record
                      </Badge>
                    )}
                  </div>
                  <ul className="numeric mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] text-txt-2">
                    {sets.map((s) => (
                      <li key={s.id} className={isWarmup(s) ? 'text-txt-4' : undefined}>
                        {fmtSet(s.weightKg, s.reps)}
                        {isWarmup(s) && ' W'}
                        {s.type === 'drop' && ' D'}
                        {s.type === 'failure' && ' F'}
                        {s.rir != null && !isWarmup(s) && <span className="text-txt-4"> @{s.rir}</span>}
                      </li>
                    ))}
                  </ul>
                  {best > 0 && (
                    <p className="mt-2 text-[0.6875rem] text-txt-3">Best set ≈ {Math.round(best)} kg estimated 1RM</p>
                  )}
                  {w.exerciseNotes?.[exId] && (
                    <p className="mt-1.5 text-[0.75rem] leading-snug text-txt-3">{w.exerciseNotes[exId]}</p>
                  )}
                </Card>
              </button>
            )
          })}
      </div>

      {justFinished && (
        <Sheet open onClose={() => setParams({}, { replace: true })} title="Workout complete">
          <Summary workout={w} exercises={exMap} records={records} bare />
          <Button variant="primary" className="mt-5 w-full" onClick={() => navigate('/train', { replace: true })}>
            Done
          </Button>
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet open onClose={() => setConfirmDelete(false)} title="Delete this session?">
          <p className="text-[0.9375rem] leading-relaxed text-txt-2">
            Its sets leave your history, records and volume. Next session’s targets will be based on
            the session before it. This cannot be undone.
          </p>
          <div className="mt-5 space-y-2">
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                await db.workouts.delete(w.id)
                navigate('/train', { replace: true })
              }}
            >
              <Trash2 size={16} /> Delete session
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

const RECORD_TEXT: Record<NewRecord['kind'], (r: NewRecord) => string> = {
  e1rm: (r) => `Estimated 1RM ${Math.round(r.value)} kg, from ${fmtSet(r.weight, r.reps)}`,
  weight: (r) => `Heaviest set ${fmtLoad(r.weight)} kg × ${r.reps}`,
  reps: (r) => `Most reps in a set: ${r.reps}`,
}

function Summary({
  workout: w,
  exercises,
  records,
  bare = false,
}: {
  workout: Workout
  exercises: Map<string, Exercise>
  records: NewRecord[]
  /** Inside a sheet the surrounding card chrome is redundant. */
  bare?: boolean
}) {
  const working = w.sets.filter(isWorking)
  const hard = hardSets(w.sets)
  const volume = sessionVolume(
    w,
    new Map([...exercises].map(([k, e]) => [k, { primary: e.primary, secondary: e.secondary }])),
  )
  const Box = bare ? 'div' : Card
  const pad = bare ? '' : 'p-4'

  return (
    <div className={bare ? 'space-y-4' : 'mt-2 space-y-2'}>
      <Box className={`grid grid-cols-3 gap-y-4 text-center ${pad}`}>
        <Stat value={w.endedAt ? duration(w.endedAt - w.startedAt) : '–'} label="Duration" />
        <Stat value={String(working.length)} label="Working sets" />
        <Stat value={`${num(Math.round(tonnage(w.sets)))} kg`} label="Total load" />
      </Box>

      {records.length > 0 && (
        <Box className={pad}>
          <p className="label-micro flex items-center gap-1.5 text-brand-text">
            <Trophy size={12} /> New records
          </p>
          <ul className="mt-2.5 space-y-2">
            {records.map((r, i) => (
              <li key={i} className="text-[0.8125rem] leading-snug">
                <span className="font-bold">{exercises.get(r.exerciseId)?.name ?? 'Exercise'}</span>
                <span className="text-txt-2"> · {RECORD_TEXT[r.kind](r)}</span>
                {r.previous != null && (
                  <span className="text-txt-3">
                    {' '}
                    (was {r.kind === 'reps' ? r.previous : `${fmtLoad(Math.round(r.previous * 10) / 10)} kg`})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Box>
      )}

      {volume.length > 0 && (
        <Box className={pad}>
          <p className="label-micro text-txt-3">Hard sets by muscle · {num(hard, hard % 1 ? 1 : 0)} total</p>
          <div className="mt-3 space-y-2.5">
            {volume.map(([m, n]) => (
              <VolumeRow key={m} muscle={m} sets={n} scaleToWeek={false} />
            ))}
          </div>
        </Box>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1">
      <div className="numeric text-[1.125rem] font-extrabold leading-none tracking-[-0.02em]">{value}</div>
      <div className="label-micro mt-1.5 text-[0.5625rem] text-txt-3">{label}</div>
    </div>
  )
}
