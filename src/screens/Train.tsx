import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Dumbbell, Plus, Trophy, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Screen, SectionTitle, Sheet } from '../components/ui'
import { MUSCLE_LABELS } from '../data/exercises'
import { db, newId } from '../lib/db'
import { addDays, humanDate, todayKey } from '../lib/date'
import { num } from '../lib/format'
import { LANDMARKS, e1rm, hardSets, personalRecord, tonnage, volumeStatus, weeklyVolume } from '../lib/training'
import type { Exercise, MuscleGroup, Workout, WorkoutSet } from '../lib/types'

export default function Train() {
  const [picking, setPicking] = useState(false)

  const data = useLiveQuery(async () => {
    const [workouts, exercises] = await Promise.all([
      db.workouts.orderBy('date').reverse().limit(60).toArray(),
      db.exercises.toArray(),
    ])
    const live = workouts.filter((w) => !w.deleted)
    const today = live.find((w) => w.date === todayKey() && !w.endedAt)
    return { workouts: live, exercises, today }
  }, [])

  if (!data) {
    return (
      <Screen title="Training">
        <div className="mt-4 space-y-3">
          <div className="skeleton h-32 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { workouts, exercises, today } = data
  const exMap = new Map(exercises.map((e) => [e.id, { primary: e.primary, secondary: e.secondary }]))
  const weekStart = addDays(todayKey(), -6)
  const thisWeek = workouts.filter((w) => w.date >= weekStart)
  const volume = weeklyVolume(thisWeek, exMap)

  const startWorkout = async () => {
    const w: Workout = {
      id: newId(),
      date: todayKey(),
      startedAt: Date.now(),
      sets: [],
    }
    await db.workouts.add(w)
  }

  return (
    <Screen title="Training">
      {today ? (
        <ActiveWorkout
          workout={today}
          exercises={exercises}
          onAddExercise={() => setPicking(true)}
        />
      ) : (
        <Card className="mt-2">
          <EmptyState
            icon={<Dumbbell size={28} />}
            title="Kein laufendes Training"
            body="Starte ein Training, um Sätze, Gewichte und Wiederholungen zu protokollieren."
            action={
              <Button variant="primary" onClick={() => void startWorkout()}>
                Training starten
              </Button>
            }
          />
        </Card>
      )}

      <SectionTitle>Wochenvolumen</SectionTitle>
      {volume.size === 0 ? (
        <Card>
          <EmptyState title="Diese Woche noch nichts trainiert" />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-3">
            {[...volume.entries()]
              .filter(([m]) => m !== 'cardio')
              .sort((a, b) => b[1] - a[1])
              .map(([muscle, sets]) => (
                <VolumeRow key={muscle} muscle={muscle} sets={sets} />
              ))}
          </div>
          <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
            Harte Sätze pro Woche. Aufwärmsätze zählen nicht, Sätze weit vom Muskelversagen nur
            halb. Die Marken sind allgemeine Richtwerte aus der Trainingsliteratur, keine
            persönliche Vorgabe.
          </p>
        </Card>
      )}

      <SectionTitle>Letzte Einheiten</SectionTitle>
      {workouts.filter((w) => w.endedAt).length === 0 ? (
        <Card>
          <EmptyState title="Noch keine abgeschlossenen Einheiten" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {workouts
            .filter((w) => w.endedAt)
            .slice(0, 10)
            .map((w) => {
              const names = new Set(w.sets.map((s) => s.exerciseId))
              return (
                <li key={w.id}>
                  <Card className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[0.9375rem]">{w.name ?? 'Training'}</p>
                      <p className="mt-0.5 text-[0.6875rem] text-txt-3">
                        {humanDate(w.date)} · {names.size} Übungen · {w.sets.length} Sätze
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-[0.9375rem] font-medium tabular-nums">
                        {num(Math.round(tonnage(w.sets)))} kg
                      </div>
                      <div className="text-[0.6875rem] text-txt-3">Gesamtlast</div>
                    </div>
                  </Card>
                </li>
              )
            })}
        </ul>
      )}

      {picking && today && (
        <ExercisePicker
          exercises={exercises}
          onClose={() => setPicking(false)}
          onPick={async (ex) => {
            const set: WorkoutSet = {
              id: newId(),
              exerciseId: ex.id,
              index: 1,
              weightKg: 0,
              reps: 0,
            }
            await db.workouts.update(today.id, { sets: [...today.sets, set] })
            await db.exercises.update(ex.id, {
              useCount: (ex.useCount ?? 0) + 1,
              lastUsedAt: Date.now(),
            })
            setPicking(false)
          }}
        />
      )}
    </Screen>
  )
}

function VolumeRow({ muscle, sets }: { muscle: MuscleGroup; sets: number }) {
  const l = LANDMARKS[muscle]
  const status = volumeStatus(sets, muscle)
  const pct = Math.min(1, sets / l.mrv)
  const tone =
    status === 'below' ? 'var(--color-txt-3)' : status === 'over' ? 'var(--color-warn)' : 'var(--color-protein)'

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[0.8125rem]">
        <span className="text-txt-2">{MUSCLE_LABELS[muscle]}</span>
        <span className="tabular-nums text-txt">
          {num(sets, sets % 1 ? 1 : 0)}
          <span className="text-txt-3"> Sätze</span>
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct * 100}%`, background: tone }}
        />
        <div className="absolute inset-y-0 w-px bg-tick/50" style={{ left: `${(l.mev / l.mrv) * 100}%` }} />
        <div className="absolute inset-y-0 w-px bg-tick/50" style={{ left: `${(l.mav / l.mrv) * 100}%` }} />
      </div>
    </div>
  )
}

function ActiveWorkout({
  workout,
  exercises,
  onAddExercise,
}: {
  workout: Workout
  exercises: Exercise[]
  onAddExercise: () => void
}) {
  const exMap = new Map(exercises.map((e) => [e.id, e]))
  const grouped = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>()
    for (const s of workout.sets) {
      if (!map.has(s.exerciseId)) map.set(s.exerciseId, [])
      map.get(s.exerciseId)!.push(s)
    }
    return [...map.entries()]
  }, [workout.sets])

  const update = async (sets: WorkoutSet[]) => {
    await db.workouts.update(workout.id, { sets })
  }

  const finish = async () => {
    // An empty workout is a mis-tap, not a session worth keeping.
    if (workout.sets.filter((s) => s.reps > 0).length === 0) {
      await db.workouts.delete(workout.id)
      return
    }
    await db.workouts.update(workout.id, { endedAt: Date.now() })
  }

  const elapsed = Math.round((Date.now() - workout.startedAt) / 60000)

  return (
    <Card className="mt-2 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.9375rem] font-medium">Laufendes Training</p>
          <p className="mt-0.5 text-[0.6875rem] text-txt-3">
            {elapsed} min · {workout.sets.filter((s) => s.reps > 0).length} Sätze ·{' '}
            {num(hardSets(workout.sets), 1)} harte Sätze
          </p>
        </div>
        <Button onClick={() => void finish()}>
          <Check size={16} /> Beenden
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map(([exId, sets]) => (
          <ExerciseBlock
            key={exId}
            exercise={exMap.get(exId)}
            sets={sets}
            allSets={workout.sets}
            onChange={update}
          />
        ))}
      </div>

      <Button className="mt-4 w-full" onClick={onAddExercise}>
        <Plus size={16} /> Übung hinzufügen
      </Button>
    </Card>
  )
}

function ExerciseBlock({
  exercise,
  sets,
  allSets,
  onChange,
}: {
  exercise?: Exercise
  sets: WorkoutSet[]
  allSets: WorkoutSet[]
  onChange: (sets: WorkoutSet[]) => void
}) {
  const pr = useLiveQuery(async () => {
    if (!exercise) return null
    const workouts = await db.workouts.toArray()
    return personalRecord(workouts, exercise.id)
  }, [exercise?.id])

  const patch = (id: string, changes: Partial<WorkoutSet>) =>
    onChange(allSets.map((s) => (s.id === id ? { ...s, ...changes } : s)))

  const addSet = () => {
    const last = sets[sets.length - 1]
    onChange([
      ...allSets,
      {
        id: newId(),
        exerciseId: sets[0].exerciseId,
        index: sets.length + 1,
        // Pre-filling with the previous set is what makes logging fast.
        weightKg: last?.weightKg ?? 0,
        reps: last?.reps ?? 0,
      },
    ])
  }

  return (
    <div className="rounded-tile border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.9375rem]">{exercise?.nameDe ?? exercise?.name ?? 'Übung'}</p>
        {pr && (
          <Badge tone="brand">
            <Trophy size={9} /> {Math.round(pr.e1rm)} kg
          </Badge>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="grid grid-cols-[1.5rem_1fr_1fr_2.5rem_1.75rem] items-center gap-2 px-0.5 text-[0.625rem] uppercase tracking-wide text-txt-4">
          <span>#</span>
          <span>kg</span>
          <span>Wdh.</span>
          <span>RIR</span>
          <span />
        </div>
        {sets.map((s, i) => (
          <div key={s.id} className="grid grid-cols-[1.5rem_1fr_1fr_2.5rem_1.75rem] items-center gap-2">
            <span className="text-[0.8125rem] tabular-nums text-txt-3">{i + 1}</span>
            <Input
              type="text"
              inputMode="decimal"
              value={s.weightKg || ''}
              placeholder="0"
              onChange={(e) => patch(s.id, { weightKg: Number(e.target.value.replace(',', '.')) || 0 })}
              className="h-10 px-2 py-0 text-center text-[0.9375rem]"
            />
            <Input
              type="text"
              inputMode="numeric"
              value={s.reps || ''}
              placeholder="0"
              onChange={(e) => patch(s.id, { reps: Number(e.target.value) || 0 })}
              className="h-10 px-2 py-0 text-center text-[0.9375rem]"
            />
            <Input
              type="text"
              inputMode="numeric"
              value={s.rir ?? ''}
              placeholder="2"
              onChange={(e) => patch(s.id, { rir: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-10 px-1 py-0 text-center text-[0.8125rem]"
            />
            <button
              aria-label="Satz entfernen"
              onClick={() => onChange(allSets.filter((x) => x.id !== s.id))}
              className="grid size-7 place-items-center rounded-lg text-txt-4 active:bg-surface-3"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {sets.some((s) => s.reps > 0 && s.weightKg > 0) && (
        <p className="mt-2 text-[0.6875rem] text-txt-3">
          Bester Satz ≈ {Math.round(
            Math.max(...sets.filter((s) => s.reps > 0).map((s) => e1rm(s.weightKg, s.reps, s.rpe).value)),
          )}{' '}
          kg geschätztes 1RM
        </p>
      )}

      <button
        onClick={addSet}
        className="mt-2 w-full rounded-lg border border-line py-2 text-[0.8125rem] text-txt-2 active:bg-surface-3"
      >
        + Satz
      </button>
    </div>
  )
}

function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: Exercise[]
  onPick: (e: Exercise) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = exercises
    .filter((e) => {
      const hay = `${e.nameDe ?? ''} ${e.name} ${e.equipment ?? ''}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
    .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))

  return (
    <Sheet open onClose={onClose} title="Übung wählen" full>
      <Input
        autoFocus
        type="search"
        placeholder="Übung suchen"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-3"
      />
      <ul className="space-y-1.5">
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => void onPick(e)}
              className="flex w-full items-center justify-between gap-3 rounded-tile border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem]">{e.nameDe ?? e.name}</p>
                <p className="mt-0.5 text-[0.6875rem] text-txt-3">
                  {MUSCLE_LABELS[e.primary]}
                  {e.equipment && ` · ${e.equipment}`}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
