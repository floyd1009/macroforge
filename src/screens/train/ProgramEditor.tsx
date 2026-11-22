import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Screen, Sheet } from '../../components/ui'
import { db, getSettings, newId } from '../../lib/db'
import type { Exercise, Program, RoutineDay, RoutineExercise } from '../../lib/types'
import { BackButton, ExercisePicker, Group, Stepper } from './shared'
import { restLabel } from './util'
import { activateProgram, deleteProgram, duplicateProgram, saveProgram } from './store'

/** Move an item one place within its list, returning a new list. */
function shift<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[index], out[j]] = [out[j], out[index]]
  return out
}

export default function ProgramEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [addTo, setAddTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ dayId: string; slotId: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const data = useLiveQuery(async () => {
    const [program, exercises, settings] = await Promise.all([db.programs.get(id), db.exercises.toArray(), getSettings()])
    return { program: program && !program.deleted ? program : null, exercises, settings }
  }, [id])

  if (!data) {
    return (
      <Screen title="Program" left={<BackButton to="/train/programs" />}>
        <div className="skeleton mt-4 h-40 rounded-card" />
      </Screen>
    )
  }
  if (!data.program) {
    return (
      <Screen title="Program" left={<BackButton to="/train/programs" />}>
        <Card className="mt-2">
          <EmptyState title="Program not found" />
        </Card>
      </Screen>
    )
  }

  const { program: p, exercises, settings } = data
  const exMap = new Map(exercises.map((e) => [e.id, e]))

  const setDays = (days: RoutineDay[]) => {
    // Keep "next" pointing at a day that exists after days are removed or reordered.
    const nextDayIndex = days.length ? Math.min(p.nextDayIndex, days.length - 1) : 0
    void saveProgram(p.id, { days, nextDayIndex })
  }
  const patchDay = (dayId: string, fn: (d: RoutineDay) => RoutineDay) =>
    setDays(p.days.map((d) => (d.id === dayId ? fn(d) : d)))
  const patchSlot = (dayId: string, slotId: string, changes: Partial<RoutineExercise>) =>
    patchDay(dayId, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.id === slotId ? { ...e, ...changes } : e)),
    }))

  const addExercise = (dayId: string, ex: Exercise) =>
    patchDay(dayId, (d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        // A neutral hypertrophy default; everything is editable right after.
        { id: newId(), exerciseId: ex.id, sets: 3, repMin: 8, repMax: 12, rir: 2, restSec: settings.restSec },
      ],
    }))

  const editDay = editing ? p.days.find((d) => d.id === editing.dayId) : undefined
  const editSlot = editDay?.exercises.find((e) => e.id === editing?.slotId)
  const editIndex = editDay && editSlot ? editDay.exercises.indexOf(editSlot) : -1

  return (
    <Screen
      title="Edit program"
      subtitle={p.active ? 'Active program' : undefined}
      left={<BackButton to="/train/programs" />}
      right={
        p.active ? (
          <Badge tone="brand">Active</Badge>
        ) : (
          <Button className="min-h-9 px-3 text-[0.8125rem]" onClick={() => void activateProgram(p.id)}>
            Use
          </Button>
        )
      }
    >
      <Field label="Name" className="mt-2">
        <Input
          // Keyed by id so switching programs resets the uncontrolled field.
          key={p.id}
          defaultValue={p.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== p.name) void saveProgram(p.id, { name })
          }}
        />
      </Field>

      <div className="mt-4 space-y-3">
        {p.days.map((d, di) => (
          <Card key={d.id} className="p-3">
            <div className="flex items-center gap-1.5">
              <Input
                key={d.id}
                aria-label="Day name"
                defaultValue={d.name}
                className="h-10 flex-1 py-0 text-[0.9375rem]"
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== d.name) patchDay(d.id, (x) => ({ ...x, name }))
                }}
              />
              <SmallIcon label="Move day up" disabled={di === 0} onClick={() => setDays(shift(p.days, di, -1))}>
                <ArrowUp size={16} />
              </SmallIcon>
              <SmallIcon
                label="Move day down"
                disabled={di === p.days.length - 1}
                onClick={() => setDays(shift(p.days, di, 1))}
              >
                <ArrowDown size={16} />
              </SmallIcon>
              <SmallIcon label="Delete day" onClick={() => setDays(p.days.filter((x) => x.id !== d.id))}>
                <Trash2 size={15} />
              </SmallIcon>
            </div>

            {d.exercises.length === 0 ? (
              <p className="px-1 py-4 text-[0.8125rem] text-txt-3">No exercises in this day yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {d.exercises.map((s) => (
                  <li key={s.id}>
                    <button
                      className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left active:bg-surface-2"
                      onClick={() => setEditing({ dayId: d.id, slotId: s.id })}
                    >
                      <span className="min-w-0 truncate text-[0.875rem] font-semibold">
                        {exMap.get(s.exerciseId)?.name ?? 'Unknown exercise'}
                      </span>
                      <span className="numeric shrink-0 text-[0.75rem] text-txt-3">
                        {s.sets} × {s.repMin}–{s.repMax} @ {s.rir}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setAddTo(d.id)}
              className="mt-2 w-full rounded-lg border border-line py-2 text-[0.8125rem] font-bold text-txt-2 active:bg-surface-3"
            >
              + Exercise
            </button>
          </Card>
        ))}
      </div>

      <Button
        className="mt-3 w-full"
        onClick={() => setDays([...p.days, { id: newId(), name: `Day ${p.days.length + 1}`, exercises: [] }])}
      >
        <Plus size={16} /> Add day
      </Button>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          onClick={async () => {
            const copy = await duplicateProgram(p.id)
            if (copy) navigate(`/train/programs/${copy}`)
          }}
        >
          <Copy size={16} /> Duplicate
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} /> Delete
        </Button>
      </div>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
        Changes apply from the next workout you start. Sessions already logged keep the targets they
        were done with.
      </p>

      {addTo && (
        <ExercisePicker
          exercises={exercises}
          title="Add to day"
          exclude={new Set(p.days.find((d) => d.id === addTo)?.exercises.map((e) => e.exerciseId))}
          onClose={() => setAddTo(null)}
          onPick={(ex) => {
            addExercise(addTo, ex)
            setAddTo(null)
          }}
        />
      )}

      {editing && editDay && editSlot && (
        <SlotSheet
          name={exMap.get(editSlot.exerciseId)?.name ?? 'Exercise'}
          slot={editSlot}
          canUp={editIndex > 0}
          canDown={editIndex < editDay.exercises.length - 1}
          onChange={(c) => patchSlot(editDay.id, editSlot.id, c)}
          onMove={(dir) => patchDay(editDay.id, (d) => ({ ...d, exercises: shift(d.exercises, editIndex, dir) }))}
          onRemove={() => {
            patchDay(editDay.id, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== editSlot.id) }))
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <DeleteSheet
          program={p}
          onClose={() => setConfirmDelete(false)}
          onDelete={async () => {
            await deleteProgram(p.id)
            navigate('/train/programs', { replace: true })
          }}
        />
      )}
    </Screen>
  )
}

function SmallIcon({
  label,
  children,
  ...rest
}: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-txt-3 active:bg-surface-3 disabled:opacity-25"
      {...rest}
    >
      {children}
    </button>
  )
}

function SlotSheet({
  name,
  slot,
  canUp,
  canDown,
  onChange,
  onMove,
  onRemove,
  onClose,
}: {
  name: string
  slot: RoutineExercise
  canUp: boolean
  canDown: boolean
  onChange: (c: Partial<RoutineExercise>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onClose: () => void
}) {
  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="space-y-4">
        <Group label="Sets">
          <Stepper label="sets" value={slot.sets} min={1} max={10} onChange={(v) => onChange({ sets: v })} />
        </Group>
        <div className="grid grid-cols-2 gap-3">
          <Group label="Reps from">
            <Stepper
              label="minimum reps"
              value={slot.repMin}
              min={1}
              max={50}
              // The range must stay a range: pushing the bottom up drags the top with it.
              onChange={(v) => onChange({ repMin: v, repMax: Math.max(slot.repMax, v + 1) })}
            />
          </Group>
          <Group label="Reps to">
            <Stepper
              label="maximum reps"
              value={slot.repMax}
              min={2}
              max={60}
              onChange={(v) => onChange({ repMax: v, repMin: Math.min(slot.repMin, v - 1) })}
            />
          </Group>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Group label="Reps in reserve">
            <Stepper label="reps in reserve" value={slot.rir} min={0} max={5} onChange={(v) => onChange({ rir: v })} />
          </Group>
          <Group label="Rest">
            <Stepper
              label="rest"
              value={slot.restSec}
              min={15}
              max={600}
              step={15}
              format={restLabel}
              onChange={(v) => onChange({ restSec: v })}
            />
          </Group>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-txt-3">
          Load goes up once every set reaches the top of the range at this effort. A wider range gives
          that more room; a range narrower than 3 reps makes progress jumpy.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!canUp} onClick={() => onMove(-1)}>
            <ArrowUp size={16} /> Move up
          </Button>
          <Button disabled={!canDown} onClick={() => onMove(1)}>
            <ArrowDown size={16} /> Move down
          </Button>
        </div>
        <Button variant="danger" className="w-full" onClick={onRemove}>
          <Trash2 size={16} /> Remove from day
        </Button>
      </div>
    </Sheet>
  )
}

function DeleteSheet({
  program,
  onClose,
  onDelete,
}: {
  program: Program
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <Sheet open onClose={onClose} title={`Delete “${program.name}”?`}>
      <p className="text-[0.9375rem] leading-relaxed text-txt-2">
        The plan is removed. Workouts you already logged with it stay in your history.
      </p>
      <div className="mt-5 space-y-2">
        <Button variant="danger" className="w-full" onClick={onDelete}>
          <Trash2 size={16} /> Delete program
        </Button>
        <Button className="w-full" onClick={onClose}>
          Keep it
        </Button>
      </div>
    </Sheet>
  )
}
