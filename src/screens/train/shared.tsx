import clsx from 'clsx'
import { ChevronLeft, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, IconButton, Input, Segmented, Sheet } from '../../components/ui'
import { EQUIPMENT, MUSCLES, MUSCLE_LABELS } from '../../data/exercises'
import { db, getSettings } from '../../lib/db'
import { num, parseNumber } from '../../lib/format'
import { LANDMARKS, plateLoad, volumeStatus } from '../../lib/training'
import type { Exercise, MuscleGroup, Settings } from '../../lib/types'
import { createCustomExercise } from './store'
import { filterExercises, fmtLoad, restLabel } from './util'

/**
 * A labelled control that is NOT a `<label>`.
 *
 * `Field` renders a label element, and a label forwards a tap on any of its
 * non-interactive content to the first button inside it. Around a stepper
 * that means tapping the number presses "minus". Controls built from buttons
 * use this instead; it looks the same.
 */
export function Group({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className} role="group" aria-label={label}>
      <span className="mb-1.5 block text-[0.8125rem] font-semibold tracking-tight text-txt-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-snug text-txt-3">{hint}</span>}
    </div>
  )
}

export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate()
  return (
    <IconButton label="Back" onClick={() => (to ? navigate(to) : navigate(-1))} className="-ml-2">
      <ChevronLeft size={22} />
    </IconButton>
  )
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/**
 * Numeric field that owns its text while focused.
 *
 * Binding the input straight to the stored number loses the decimal point:
 * typing "62." parses to 62, the field re-renders as "62", and the "." is
 * gone before the "5" can follow. So the raw text is kept locally during
 * editing and the parsed value is reported upward on every change.
 */
export function NumField({
  value,
  onCommit,
  placeholder,
  decimal = false,
  allowZero = false,
  label,
  className,
}: {
  value: number | undefined
  onCommit: (n: number | undefined) => void
  placeholder?: string
  decimal?: boolean
  /** RIR 0 is a real value; a weight of 0 is "not entered". */
  allowZero?: boolean
  label: string
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const stored = value != null && (allowZero || value !== 0) ? fmtLoad(value) : ''
  const shown = text ?? stored
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      onFocus={(e) => {
        setText(stored)
        e.currentTarget.select()
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseNumber(e.target.value)
        onCommit(n == null || n < 0 ? undefined : n)
      }}
      onBlur={() => setText(null)}
      className={clsx(
        'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-3 px-1 text-center text-[0.9375rem] font-bold text-txt',
        'placeholder:font-semibold placeholder:text-txt-4 outline-none transition-colors',
        'focus:border-brand focus:ring-1 focus:ring-brand/40',
        className,
      )}
    />
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format = (v) => String(v),
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  label: string
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)))
  return (
    <div className="flex h-11 items-center rounded-lg border border-line bg-surface-2" role="group" aria-label={label}>
      <button
        aria-label={`Less ${label}`}
        disabled={value <= min}
        onClick={() => set(value - step)}
        className="grid h-full w-11 place-items-center text-txt-2 active:bg-surface-3 disabled:opacity-30"
      >
        <Minus size={16} />
      </button>
      <span className="numeric min-w-0 flex-1 text-center text-[0.9375rem] font-bold">{format(value)}</span>
      <button
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => set(value + step)}
        className="grid h-full w-11 place-items-center text-txt-2 active:bg-surface-3 disabled:opacity-30"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Weekly volume row (hard sets against the landmarks)
 * ------------------------------------------------------------------ */

export function VolumeRow({ muscle, sets, scaleToWeek = true }: { muscle: MuscleGroup; sets: number; scaleToWeek?: boolean }) {
  const l = LANDMARKS[muscle]
  const status = volumeStatus(sets, muscle)
  const pct = Math.min(1, sets / l.mrv)
  const tone =
    !scaleToWeek || status === 'productive' || status === 'high'
      ? 'var(--color-protein)'
      : status === 'over'
        ? 'var(--color-warn)'
        : 'var(--color-txt-3)'

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[0.8125rem]">
        <span className="text-txt-2">{MUSCLE_LABELS[muscle]}</span>
        <span className="tabular-nums text-txt">
          {num(sets, sets % 1 ? 1 : 0)}
          <span className="text-txt-3"> sets</span>
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct * 100}%`, background: tone }}
        />
        {scaleToWeek && (
          <>
            <div className="absolute inset-y-0 w-px bg-tick/50" style={{ left: `${(l.mev / l.mrv) * 100}%` }} />
            <div className="absolute inset-y-0 w-px bg-tick/50" style={{ left: `${(l.mav / l.mrv) * 100}%` }} />
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Exercise picker
 * ------------------------------------------------------------------ */

export function MuscleChips({
  value,
  onChange,
  muscles = MUSCLES,
}: {
  value: MuscleGroup | null
  onChange: (m: MuscleGroup | null) => void
  muscles?: MuscleGroup[]
}) {
  const chip = (active: boolean) =>
    clsx(
      'shrink-0 rounded-full border px-3 py-1.5 text-[0.75rem] font-bold tracking-tight transition-colors',
      active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface-2 text-txt-2 active:bg-surface-3',
    )
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button className={chip(value === null)} onClick={() => onChange(null)}>
        All
      </button>
      {muscles.map((m) => (
        <button key={m} className={chip(value === m)} onClick={() => onChange(value === m ? null : m)}>
          {MUSCLE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}

export function ExerciseRow({ exercise, onClick, right }: { exercise: Exercise; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-tile border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-2"
    >
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-semibold">{exercise.name}</p>
        <p className="mt-0.5 truncate text-[0.6875rem] text-txt-3">
          {MUSCLE_LABELS[exercise.primary]}
          {exercise.equipment && ` · ${exercise.equipment}`}
          {exercise.isCustom && ' · custom'}
        </p>
      </div>
      {right}
    </button>
  )
}

export function ExercisePicker({
  exercises,
  title = 'Choose exercise',
  exclude,
  preferMuscle = null,
  onPick,
  onClose,
}: {
  exercises: Exercise[]
  title?: string
  /** Ids already in the session or day; listing them again would create duplicates. */
  exclude?: Set<string>
  /** Preselected filter, e.g. the muscle of the exercise being swapped out. */
  preferMuscle?: MuscleGroup | null
  onPick: (e: Exercise) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(preferMuscle)
  const [creating, setCreating] = useState(false)
  const list = useMemo(
    () => filterExercises(exercises, q, muscle).filter((e) => !exclude?.has(e.id)),
    [exercises, q, muscle, exclude],
  )

  return (
    <Sheet open onClose={onClose} title={title} full>
      <Input
        type="search"
        placeholder="Search exercises"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2.5"
      />
      <MuscleChips value={muscle} onChange={setMuscle} />
      <ul className="mt-3 space-y-1.5">
        {list.map((e) => (
          <li key={e.id}>
            <ExerciseRow exercise={e} onClick={() => onPick(e)} />
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="py-8 text-center text-sm text-txt-3">No exercise matches.</p>}
      <Button className="mt-4 w-full" onClick={() => setCreating(true)}>
        <Plus size={16} /> Create custom exercise
      </Button>
      {creating && (
        <CustomExerciseSheet
          initialName={q}
          initialMuscle={muscle ?? undefined}
          onClose={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false)
            onPick(e)
          }}
        />
      )}
    </Sheet>
  )
}

export function CustomExerciseSheet({
  initialName = '',
  initialMuscle,
  onClose,
  onCreated,
}: {
  initialName?: string
  initialMuscle?: MuscleGroup
  onClose: () => void
  onCreated: (e: Exercise) => void
}) {
  const [name, setName] = useState(initialName)
  const [primary, setPrimary] = useState<MuscleGroup>(initialMuscle ?? 'chest')
  const [equipment, setEquipment] = useState<string>('Machine')
  const select =
    'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-semibold text-txt outline-none focus:border-brand'

  return (
    <Sheet open onClose={onClose} title="Custom exercise">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable Y-Raise" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Main muscle">
            <select className={select} value={primary} onChange={(e) => setPrimary(e.target.value as MuscleGroup)}>
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Equipment">
            <select className={select} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {EQUIPMENT.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={name.trim().length < 2}
          onClick={async () => onCreated(await createCustomExercise({ name, primary, equipment }))}
        >
          Create
        </Button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ *
 * Plates
 * ------------------------------------------------------------------ */

/** Plate breakdown for a barbell load. Rendered inline wherever a weight is being decided. */
export function PlateBreakdown({ weightKg, settings }: { weightKg: number; settings: Pick<Settings, 'barKg' | 'platesKg'> }) {
  const load = plateLoad(weightKg, settings.barKg, settings.platesKg)
  if (weightKg <= 0) {
    return <p className="text-[0.8125rem] text-txt-3">Enter a weight to see the plates.</p>
  }
  return (
    <div>
      <div className="flex items-center gap-1 overflow-x-auto py-2" aria-label="Plates on one side of the bar">
        <div className="h-2.5 w-7 shrink-0 rounded-l-sm bg-track" />
        {load.perSide.length === 0 && <span className="px-2 text-[0.8125rem] text-txt-3">empty bar</span>}
        {load.perSide.map((p, i) => (
          <div
            key={i}
            className="grid shrink-0 place-items-center rounded-[0.25rem] border border-line-strong bg-surface-3 px-1 text-[0.6875rem] font-extrabold"
            // Height tracks plate mass so the picture reads like the bar does.
            style={{ height: `${Math.round(26 + Math.min(1, p / 25) * 38)}px`, minWidth: '1.9rem' }}
          >
            {fmtLoad(p)}
          </div>
        ))}
        <div className="h-2.5 w-5 shrink-0 rounded-r-sm bg-track" />
      </div>
      <p className="mt-1 text-[0.8125rem] text-txt-2">
        {load.perSide.length > 0 ? (
          <>
            Per side: <span className="font-bold text-txt">{load.perSide.map(fmtLoad).join(' + ')}</span>
          </>
        ) : (
          'No plates'
        )}
        <span className="text-txt-3"> · bar {fmtLoad(settings.barKg)} kg</span>
      </p>
      {load.remainder !== 0 && (
        <p className="mt-1 text-[0.75rem] text-warn">
          {load.remainder > 0
            ? `${fmtLoad(weightKg)} kg cannot be loaded exactly with these plates. Closest below is ${fmtLoad(load.achieved)} kg.`
            : `Below the bar weight of ${fmtLoad(settings.barKg)} kg.`}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Training settings
 * ------------------------------------------------------------------ */

export function TrainSettingsSheet({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const [plates, setPlates] = useState(settings.platesKg.join(', '))

  const save = async (changes: Partial<Settings>) => {
    // Read the latest row first: this sheet's copy may be stale after edits elsewhere.
    const current = await getSettings()
    await db.settings.put({ ...current, ...changes, updatedAt: Date.now() })
  }

  // ", " separates plates; a bare comma is left alone so "1,25" still reads as 1.25.
  const parsedPlates = plates
    .replace(/,\s+/g, ' ')
    .split(/[;\s]+/)
    .map((x) => parseNumber(x))
    .filter((n): n is number => n != null && n > 0)

  return (
    <Sheet open onClose={onClose} title="Training settings">
      <div className="space-y-5">
        <Group label="Default rest between sets" hint="Used when an exercise has no rest time of its own.">
          <Stepper
            label="rest"
            value={settings.restSec}
            min={15}
            max={600}
            step={15}
            format={restLabel}
            onChange={(v) => void save({ restSec: v })}
          />
        </Group>
        <Group label="Sound and vibration when rest ends">
          <Segmented
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={settings.restSound ? 'on' : 'off'}
            onChange={(v) => void save({ restSound: v === 'on' })}
          />
        </Group>
        <Group label="Barbell weight" hint="20 kg for a standard Olympic bar, 15 kg for the lighter one.">
          <Stepper
            label="bar weight"
            value={settings.barKg}
            min={0}
            max={30}
            step={2.5}
            format={(v) => `${fmtLoad(v)} kg`}
            onChange={(v) => void save({ barKg: v })}
          />
        </Group>
        <Field label="Plates available, kg" hint="Separate with spaces. One of each size is enough: the calculator repeats plates as needed.">
          <Input
            inputMode="decimal"
            value={plates}
            onChange={(e) => setPlates(e.target.value)}
            onBlur={() => {
              if (parsedPlates.length) void save({ platesKg: [...new Set(parsedPlates)].sort((a, b) => b - a) })
            }}
          />
        </Field>
        <Button variant="primary" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  )
}
