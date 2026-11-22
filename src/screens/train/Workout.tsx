import { useState } from 'react'
import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, History, MoreHorizontal, Plus, Trash2, TrendingUp } from 'lucide-react'
import { Button, Card, EmptyState, Field, IconButton, Screen, Segmented, Sheet, Textarea } from '../../components/ui'
import { db, getSettings, newId } from '../../lib/db'
import { REASON_LABEL, type ProgressionReason } from '../../lib/progression'
import { isLogged, isWarmup, lastPerformance } from '../../lib/training'
import type { Exercise, SetType, Settings, Workout, WorkoutSet } from '../../lib/types'
import { startRest, stopRest, useRest } from './rest'
import { BackButton, ExercisePicker, Group, NumField, PlateBreakdown, Stepper } from './shared'
import { clock, fmtLoad, fmtSet, restLabel, useNow } from './util'
import { discardWorkout, finishWorkout, getActiveWorkout, orderedExerciseIds, patchWorkout, planSets } from './store'

const GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)_3.75rem_3.25rem_2.5rem_2.5rem] items-center gap-1.5'

export default function WorkoutScreen() {
  const navigate = useNavigate()
  const rest = useRest()
  const [leaving, setLeaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; from: string } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [setSheet, setSetSheet] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    const [active, exercises, history, settings] = await Promise.all([
      getActiveWorkout(),
      db.exercises.toArray(),
      db.workouts.toArray(),
      getSettings(),
    ])
    return { active: active ?? null, exercises, history, settings }
  }, [])

  if (!data || leaving) {
    return (
      <Screen title="Workout" left={<BackButton to="/train" />}>
        <div className="mt-4 space-y-3">
          <div className="skeleton h-44 rounded-card" />
          <div className="skeleton h-44 rounded-card" />
        </div>
      </Screen>
    )
  }
  // Reached by a stale link or after finishing in another tab.
  if (!data.active) return <Navigate to="/train" replace />

  const { active: w, exercises, history, settings } = data
  const exMap = new Map(exercises.map((e) => [e.id, e]))
  const order = orderedExerciseIds(w)
  const ticked = w.sets.filter((s) => s.completedAt != null).length
  const restFor = (exId: string) => w.restSec?.[exId] ?? settings.restSec

  const patchSet = (id: string, changes: Partial<WorkoutSet>) =>
    void patchWorkout(w.id, (cur) => ({
      sets: cur.sets.map((s) => (s.id === id ? { ...s, ...changes } : s)),
    }))

  const addSet = (exId: string) =>
    void patchWorkout(w.id, (cur) => {
      const mine = cur.sets.filter((s) => s.exerciseId === exId)
      const prev = mine[mine.length - 1]
      // Copy the previous row: the next set is almost always the same load.
      const row: WorkoutSet = {
        id: newId(),
        exerciseId: exId,
        index: mine.length + 1,
        weightKg: 0,
        reps: 0,
        type: prev?.type === 'warmup' ? 'warmup' : 'normal',
        warmup: prev?.type === 'warmup',
        targetRepMin: prev?.targetRepMin,
        targetRepMax: prev?.targetRepMax,
        targetRir: prev?.targetRir,
        suggestedKg: prev ? prev.weightKg || prev.suggestedKg : undefined,
        suggestedReps: prev ? prev.reps || prev.suggestedReps : undefined,
      }
      return { sets: [...cur.sets, row] }
    })

  const removeSet = (id: string) =>
    void patchWorkout(w.id, (cur) => ({ sets: cur.sets.filter((s) => s.id !== id) }))

  const removeExercise = (exId: string) =>
    void patchWorkout(w.id, (cur) => ({
      sets: cur.sets.filter((s) => s.exerciseId !== exId),
      exerciseOrder: orderedExerciseIds(cur).filter((x) => x !== exId),
    }))

  const move = (exId: string, dir: -1 | 1) =>
    void patchWorkout(w.id, (cur) => {
      const ids = orderedExerciseIds(cur)
      const i = ids.indexOf(exId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ids.length) return
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      return { exerciseOrder: ids }
    })

  const addExercise = (ex: Exercise) =>
    void patchWorkout(w.id, (cur) => {
      const plan = planSets(ex, ex.id, null, history, cur.startedAt)
      return { sets: [...cur.sets, ...plan.sets], exerciseOrder: [...orderedExerciseIds(cur), ex.id] }
    })

  /**
   * Replace an exercise for this session. Sets already done stay where they
   * were logged; the open ones move to the new exercise and are re-planned
   * from *its* history, so a swap never inherits the old lift's numbers.
   */
  const swapExercise = (fromId: string, ex: Exercise) =>
    void patchWorkout(w.id, (cur) => {
      const mine = cur.sets.filter((s) => s.exerciseId === fromId)
      const done = mine.filter(isLogged)
      const open = mine.filter((s) => !isLogged(s))
      const ref = open.find((s) => s.targetRepMin != null && s.targetRepMax != null)
      const target = ref
        ? { sets: Math.max(1, open.length), repMin: ref.targetRepMin!, repMax: ref.targetRepMax!, rir: ref.targetRir ?? 2 }
        : null
      const plan = planSets(ex, ex.id, target, history, cur.startedAt)
      const ids = orderedExerciseIds(cur)
      const at = ids.indexOf(fromId)
      const nextIds = done.length ? [...ids.slice(0, at + 1), ex.id, ...ids.slice(at + 1)] : ids.map((x) => (x === fromId ? ex.id : x))
      return {
        sets: [...cur.sets.filter((s) => !(s.exerciseId === fromId && !isLogged(s))), ...plan.sets],
        exerciseOrder: nextIds,
        restSec: { ...cur.restSec, [ex.id]: cur.restSec?.[fromId] ?? settings.restSec },
      }
    })

  const finish = async () => {
    setLeaving(true)
    // A countdown for a set that will never follow should not outlive the session.
    stopRest()
    const kept = await finishWorkout(w.id)
    navigate(kept ? `/train/session/${w.id}?done=1` : '/train', { replace: true })
  }

  const discard = async () => {
    setLeaving(true)
    stopRest()
    await discardWorkout(w.id)
    navigate('/train', { replace: true })
  }

  const menuEx = menuFor ? exMap.get(menuFor) : undefined
  const sheetSet = setSheet ? w.sets.find((s) => s.id === setSheet) : undefined

  return (
    <Screen
      title={w.name ?? 'Workout'}
      subtitle={<Elapsed startedAt={w.startedAt} suffix={`${ticked} of ${w.sets.length} sets`} />}
      left={<BackButton to="/train" />}
      right={
        <Button variant="primary" className="min-h-9 px-3.5 text-[0.8125rem]" onClick={() => setFinishing(true)}>
          Finish
        </Button>
      }
    >
      {order.length === 0 && (
        <Card className="mt-2">
          <EmptyState
            title="No exercises yet"
            body="Add the first movement. The app remembers what you did and offers it next time."
          />
        </Card>
      )}

      <div className="mt-2 space-y-3">
        {order.map((exId, i) => (
          <ExerciseBlock
            key={exId}
            exercise={exMap.get(exId)}
            sets={w.sets.filter((s) => s.exerciseId === exId)}
            last={lastPerformance(history, exId, w.startedAt)}
            note={w.exerciseNotes?.[exId]}
            restSec={restFor(exId)}
            onPatch={patchSet}
            onAddSet={() => addSet(exId)}
            onMenu={() => setMenuFor(exId)}
            onSetOptions={setSetSheet}
            onOpen={() => navigate(`/train/exercise/${encodeURIComponent(exId)}`)}
            onComplete={(s, values) => {
              // An empty RIR field takes the prescribed value, like the other
              // grey numbers do. Warm-ups carry no effort rating.
              const rir = isWarmup(s) ? s.rir : s.type === 'failure' ? 0 : (s.rir ?? s.targetRir)
              patchSet(s.id, { ...values, rir, completedAt: Date.now() })
              if (!isWarmup(s)) {
                startRest(restFor(exId), { label: exMap.get(exId)?.name, sound: settings.restSound })
              }
            }}
            first={i === 0}
          />
        ))}
      </div>

      <Button className="mt-3 w-full" onClick={() => setPicker({ mode: 'add' })}>
        <Plus size={16} /> Add exercise
      </Button>

      {/* Room for the rest bar, so the last row is not hidden under it. */}
      {rest && <div className="h-20" />}

      {picker && (
        <ExercisePicker
          exercises={exercises}
          title={picker.mode === 'swap' ? 'Swap for' : 'Add exercise'}
          exclude={new Set(order)}
          preferMuscle={picker.mode === 'swap' ? (exMap.get(picker.from)?.primary ?? null) : null}
          onClose={() => setPicker(null)}
          onPick={(ex) => {
            if (picker.mode === 'swap') swapExercise(picker.from, ex)
            else addExercise(ex)
            setPicker(null)
          }}
        />
      )}

      {menuFor && (
        <Sheet open onClose={() => setMenuFor(null)} title={menuEx?.name ?? 'Exercise'}>
          <div className="space-y-4">
            <Group label="Rest after each set">
              <Stepper
                label="rest"
                value={restFor(menuFor)}
                min={15}
                max={600}
                step={15}
                format={restLabel}
                onChange={(v) => void patchWorkout(w.id, (cur) => ({ restSec: { ...cur.restSec, [menuFor]: v } }))}
              />
            </Group>
            <Field label="Note for this session">
              <Textarea
                rows={2}
                defaultValue={w.exerciseNotes?.[menuFor] ?? ''}
                placeholder="Seat height, grip, how it felt"
                onBlur={(e) => {
                  const text = e.target.value.trim()
                  void patchWorkout(w.id, (cur) => {
                    const notes = { ...cur.exerciseNotes }
                    if (text) notes[menuFor] = text
                    else delete notes[menuFor]
                    return { exerciseNotes: notes }
                  })
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  setPicker({ mode: 'swap', from: menuFor })
                  setMenuFor(null)
                }}
              >
                <ArrowLeftRight size={16} /> Swap
              </Button>
              <Button onClick={() => navigate(`/train/exercise/${encodeURIComponent(menuFor)}`)}>
                <History size={16} /> History
              </Button>
              <Button disabled={order.indexOf(menuFor) === 0} onClick={() => move(menuFor, -1)}>
                <ArrowUp size={16} /> Move up
              </Button>
              <Button disabled={order.indexOf(menuFor) === order.length - 1} onClick={() => move(menuFor, 1)}>
                <ArrowDown size={16} /> Move down
              </Button>
            </div>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                removeExercise(menuFor)
                setMenuFor(null)
              }}
            >
              <Trash2 size={16} /> Remove from this workout
            </Button>
          </div>
        </Sheet>
      )}

      {sheetSet && (
        <SetSheet
          set={sheetSet}
          exercise={exMap.get(sheetSet.exerciseId)}
          settings={settings}
          onClose={() => setSetSheet(null)}
          onType={(type) => patchSet(sheetSet.id, { type, warmup: type === 'warmup' })}
          onRemove={() => {
            removeSet(sheetSet.id)
            setSetSheet(null)
          }}
        />
      )}

      {finishing && (
        <FinishSheet
          workout={w}
          onClose={() => setFinishing(false)}
          onFinish={() => void finish()}
          onDiscard={() => void discard()}
        />
      )}
    </Screen>
  )
}

/** Ticks on its own so the whole screen does not re-render every second. */
function Elapsed({ startedAt, suffix }: { startedAt: number; suffix: string }) {
  const now = useNow(1000)
  return (
    <span className="numeric">
      {clock(now - startedAt)} · {suffix}
    </span>
  )
}

/** What changed against last time, read off the stored proposal. */
function reasonFor(sets: WorkoutSet[], last: WorkoutSet[] | null): ProgressionReason | null {
  const first = sets.find((s) => !isWarmup(s) && s.suggestedReps != null)
  const prev = last?.[0]
  if (!first || !prev || first.targetRepMax == null) return null
  const kg = first.suggestedKg ?? 0
  if (kg > prev.weightKg) return 'increase'
  if (kg < prev.weightKg) return 'reduce'
  if ((first.suggestedReps ?? 0) > first.targetRepMax) return 'expand'
  if ((first.suggestedReps ?? 0) > prev.reps) return 'add_reps'
  return 'repeat'
}

function ExerciseBlock({
  exercise,
  sets,
  last,
  note,
  restSec,
  first,
  onPatch,
  onAddSet,
  onMenu,
  onSetOptions,
  onOpen,
  onComplete,
}: {
  exercise?: Exercise
  sets: WorkoutSet[]
  last: WorkoutSet[] | null
  note?: string
  restSec: number
  first: boolean
  onPatch: (id: string, changes: Partial<WorkoutSet>) => void
  onAddSet: () => void
  onMenu: () => void
  onSetOptions: (id: string) => void
  onOpen: () => void
  onComplete: (s: WorkoutSet, values: { weightKg: number; reps: number }) => void
}) {
  const [nudge, setNudge] = useState<string | null>(null)
  const ref = sets.find((s) => s.targetRepMin != null && s.targetRepMax != null)
  const planned = sets.filter((s) => !isWarmup(s)).length
  const reason = reasonFor(sets, last)
  // "Last time" lines up with working sets only: a warm-up row has no counterpart.
  const lastBase = (last ?? []).filter((s) => s.type !== 'drop')

  let working = 0
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="truncate text-[1.0625rem] font-extrabold leading-tight tracking-[-0.015em]">
            {exercise?.name ?? 'Exercise'}
          </p>
          <p className="numeric mt-0.5 truncate text-[0.75rem] font-semibold text-txt-3">
            {ref
              ? `${planned} × ${ref.targetRepMin}–${ref.targetRepMax} @ ${ref.targetRir ?? 2} RIR · rest ${restLabel(restSec)}`
              : `rest ${restLabel(restSec)}`}
          </p>
        </button>
        <IconButton label="Exercise options" onClick={onMenu} className="-mr-1 -mt-1">
          <MoreHorizontal size={20} />
        </IconButton>
      </div>

      {reason && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-semibold text-protein">
          <TrendingUp size={13} className="shrink-0" />
          {REASON_LABEL[reason]}
        </p>
      )}
      {note && <p className="mt-2 text-[0.75rem] leading-snug text-txt-3">{note}</p>}

      <div className={clsx(GRID, 'label-micro mt-3 px-0.5 text-[0.5625rem] text-txt-4')}>
        <span>Set</span>
        <span>Last</span>
        <span className="text-center">kg</span>
        <span className="text-center">Reps</span>
        <span className="text-center">RIR</span>
        <span />
      </div>

      <div className="mt-1.5 space-y-1.5">
        {sets.map((s) => {
          const warm = isWarmup(s)
          const prev = warm ? undefined : lastBase[Math.min(working, Math.max(0, lastBase.length - 1))]
          const n = warm ? 0 : ++working
          const done = s.completedAt != null
          const fallbackKg = s.suggestedKg ?? prev?.weightKg
          const fallbackReps = s.suggestedReps ?? prev?.reps
          const badge = warm ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : String(n)
          return (
            <div key={s.id} className={clsx(GRID, done && 'opacity-60')}>
              <button
                aria-label={`Set ${badge} options`}
                onClick={() => onSetOptions(s.id)}
                className={clsx(
                  'grid h-10 place-items-center rounded-lg text-[0.8125rem] font-extrabold active:bg-surface-3',
                  warm ? 'text-warn' : s.type === 'drop' ? 'text-carb' : s.type === 'failure' ? 'text-brand-text' : 'text-txt-2',
                )}
              >
                {badge}
              </button>
              <span className="numeric truncate text-[0.75rem] font-semibold text-txt-3">
                {prev && !warm ? `${fmtSet(prev.weightKg, prev.reps)}` : '–'}
              </span>
              <NumField
                label="Weight in kg"
                decimal
                value={s.weightKg}
                placeholder={fallbackKg ? fmtLoad(fallbackKg) : exercise?.bodyweight ? 'BW' : '0'}
                onCommit={(v) => onPatch(s.id, { weightKg: v ?? 0 })}
              />
              <NumField
                label="Reps"
                value={s.reps}
                placeholder={
                  fallbackReps
                    ? String(fallbackReps)
                    : s.targetRepMin != null
                      ? `${s.targetRepMin}–${s.targetRepMax}`
                      : '0'
                }
                className={clsx(nudge === s.id && 'border-warn ring-1 ring-warn/50')}
                onCommit={(v) => onPatch(s.id, { reps: Math.round(v ?? 0) })}
              />
              <NumField
                label="Reps in reserve"
                allowZero
                value={s.rir}
                placeholder={s.targetRir != null ? String(s.targetRir) : '–'}
                className="text-[0.8125rem]"
                onCommit={(v) => onPatch(s.id, { rir: v == null ? undefined : Math.min(10, Math.round(v)) })}
              />
              <button
                aria-label={done ? 'Mark set as not done' : 'Mark set as done'}
                aria-pressed={done}
                onClick={() => {
                  if (done) {
                    onPatch(s.id, { completedAt: undefined })
                    return
                  }
                  const weightKg = s.weightKg || fallbackKg || 0
                  const reps = s.reps || fallbackReps || 0
                  if (reps <= 0) {
                    // Nothing typed and nothing to prefill from: say where the gap is.
                    setNudge(s.id)
                    setTimeout(() => setNudge(null), 1200)
                    return
                  }
                  onComplete(s, { weightKg, reps })
                }}
                className={clsx(
                  'grid h-10 place-items-center rounded-lg border transition-colors',
                  done
                    ? 'border-ok/50 bg-ok/20 text-ok'
                    : 'border-line-strong bg-surface-2 text-txt-3 active:bg-surface-3',
                )}
              >
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={onAddSet}
        className="mt-2 w-full rounded-lg border border-line py-2 text-[0.8125rem] font-bold text-txt-2 active:bg-surface-3"
      >
        + Set
      </button>

      {first && sets.every((s) => s.completedAt == null) && (
        <p className="mt-2 text-[0.6875rem] leading-snug text-txt-3">
          Tap the tick when a set is done. Empty fields take the grey numbers. Tap the set number for
          warm-up, drop set or plates.
        </p>
      )}
    </Card>
  )
}

const TYPES: Array<{ value: SetType; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'drop', label: 'Drop' },
  { value: 'failure', label: 'Failure' },
]

const TYPE_HELP: Record<SetType, string> = {
  normal: 'Counts toward volume, records and next session’s targets.',
  warmup: 'Not counted anywhere and starts no rest timer.',
  drop: 'Counts as a hard set. Ignored when choosing next session’s load.',
  failure: 'Counts as a full hard set with zero reps in reserve.',
}

function SetSheet({
  set,
  exercise,
  settings,
  onClose,
  onType,
  onRemove,
}: {
  set: WorkoutSet
  exercise?: Exercise
  settings: Settings
  onClose: () => void
  onType: (t: SetType) => void
  onRemove: () => void
}) {
  const type: SetType = set.type ?? (set.warmup ? 'warmup' : 'normal')
  const kg = set.weightKg || set.suggestedKg || 0
  return (
    <Sheet open onClose={onClose} title={exercise?.name ?? 'Set'}>
      <div className="space-y-4">
        <Group label="Set type" hint={TYPE_HELP[type]}>
          <Segmented options={TYPES} value={type} onChange={onType} />
        </Group>
        {exercise?.equipment === 'Barbell' && (
          <div>
            <p className="mb-1 text-[0.8125rem] font-semibold tracking-tight text-txt-2">
              Plates{kg > 0 ? ` for ${fmtLoad(kg)} kg` : ''}
            </p>
            <PlateBreakdown weightKg={kg} settings={settings} />
          </div>
        )}
        <Button variant="danger" className="w-full" onClick={onRemove}>
          <Trash2 size={16} /> Remove set
        </Button>
      </div>
    </Sheet>
  )
}

function FinishSheet({
  workout,
  onClose,
  onFinish,
  onDiscard,
}: {
  workout: Workout
  onClose: () => void
  onFinish: () => void
  onDiscard: () => void
}) {
  const logged = workout.sets.filter(isLogged).length
  const open = workout.sets.length - logged
  return (
    <Sheet open onClose={onClose} title={logged ? 'Finish workout?' : 'Nothing logged yet'}>
      <p className="text-[0.9375rem] leading-relaxed text-txt-2">
        {logged === 0
          ? 'No set has been done, so there is nothing to save.'
          : open > 0
            ? `${logged} sets done. ${open} planned ${open === 1 ? 'set was' : 'sets were'} not done and will be left out.`
            : `All ${logged} sets done.`}
      </p>
      <div className="mt-5 space-y-2">
        {logged > 0 && (
          <Button variant="primary" className="w-full" onClick={onFinish}>
            <Check size={16} /> Finish and save
          </Button>
        )}
        <Button className="w-full" onClick={onClose}>
          Keep going
        </Button>
        <Button variant="danger" className="w-full" onClick={onDiscard}>
          Discard workout
        </Button>
      </div>
    </Sheet>
  )
}
