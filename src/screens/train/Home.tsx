import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Dumbbell, ListChecks, Play, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Screen, SectionTitle } from '../../components/ui'
import { addDays, humanDate, startOfWeek, todayKey } from '../../lib/date'
import { db, getSettings } from '../../lib/db'
import { duration, num } from '../../lib/format'
import { hardSets, isLogged, isWorking, tonnage, weeklyVolume } from '../../lib/training'
import type { Program, RoutineDay, Workout } from '../../lib/types'
import { TrainSettingsSheet, VolumeRow } from './shared'
import { clock, useNow } from './util'
import { getActiveProgram, getActiveWorkout, startWorkout } from './store'

export default function Home() {
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const data = useLiveQuery(async () => {
    const [workouts, exercises, program, active, settings] = await Promise.all([
      db.workouts.orderBy('startedAt').reverse().limit(80).toArray(),
      db.exercises.toArray(),
      getActiveProgram(),
      getActiveWorkout(),
      getSettings(),
    ])
    return { workouts: workouts.filter((w) => !w.deleted), exercises, program, active, settings }
  }, [])

  if (!data) {
    return (
      <Screen title="Train">
        <div className="mt-4 space-y-3">
          <div className="skeleton h-40 rounded-card" />
          <div className="skeleton h-28 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { workouts, exercises, program, active, settings } = data
  const exMap = new Map(exercises.map((e) => [e.id, { primary: e.primary, secondary: e.secondary }]))
  const finished = workouts.filter((w) => w.endedAt)

  // Volume uses a rolling 7 days: a Monday should not look like an untrained
  // week. The session count uses the calendar week, because that is what a
  // "4 days a week" plan is counted against.
  const rollingStart = addDays(todayKey(), -6)
  const volume = weeklyVolume(
    workouts.filter((w) => w.date >= rollingStart),
    exMap,
  )
  const weekStart = startOfWeek(todayKey(), settings.firstDayOfWeek)
  const thisWeek = finished.filter((w) => w.date >= weekStart)
  const weekSets = thisWeek.reduce((s, w) => s + hardSets(w.sets), 0)

  const begin = async (from?: { program: Program; day: RoutineDay }) => {
    await startWorkout(from)
    navigate('/train/workout')
  }

  return (
    <Screen
      title="Train"
      right={
        <IconButton label="Training settings" onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal size={19} />
        </IconButton>
      }
    >
      {active ? (
        <ActiveCard workout={active} onResume={() => navigate('/train/workout')} />
      ) : program ? (
        <ProgramCard program={program} onStart={(day) => void begin({ program, day })} />
      ) : (
        <Card className="mt-2">
          <EmptyState
            icon={<ListChecks size={28} />}
            title="No program yet"
            body="Pick a ready-made plan or build your own. The app then proposes each set from what you did last time."
            action={
              <Button variant="primary" onClick={() => navigate('/train/programs')}>
                Browse programs
              </Button>
            }
          />
        </Card>
      )}

      {!active && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => void begin()}>
            <Dumbbell size={16} /> Empty workout
          </Button>
          <Button onClick={() => navigate('/train/exercises')}>Exercises</Button>
        </div>
      )}

      <SectionTitle>This week</SectionTitle>
      <Card className="grid grid-cols-3 divide-x divide-line py-3.5 text-center">
        <Stat
          value={program ? `${thisWeek.length}/${program.days.length}` : String(thisWeek.length)}
          label={thisWeek.length === 1 && !program ? 'Workout' : 'Workouts'}
        />
        <Stat value={num(weekSets, weekSets % 1 ? 1 : 0)} label="Hard sets" />
        <Stat
          value={`${num(Math.round(thisWeek.reduce((s, w) => s + tonnage(w.sets), 0)))}`}
          label="kg moved"
        />
      </Card>

      <SectionTitle>Volume, last 7 days</SectionTitle>
      {[...volume.entries()].filter(([m, n]) => m !== 'cardio' && n > 0).length === 0 ? (
        <Card>
          <EmptyState title="Nothing trained in the last 7 days" />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-3">
            {[...volume.entries()]
              .filter(([m, n]) => m !== 'cardio' && n > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([muscle, sets]) => (
                <VolumeRow key={muscle} muscle={muscle} sets={sets} />
              ))}
          </div>
          <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
            Hard sets per muscle. Warm-ups don't count, sets well short of failure count half, and a
            muscle that only assists counts half. The two marks are the usual minimum and the upper
            end of the productive range from the training literature. They describe averages, not you.
          </p>
        </Card>
      )}

      <SectionTitle>Recent sessions</SectionTitle>
      {finished.length === 0 ? (
        <Card>
          <EmptyState title="No finished sessions yet" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {finished.slice(0, 12).map((w) => (
            <li key={w.id}>
              <SessionRow workout={w} onOpen={() => navigate(`/train/session/${w.id}`)} />
            </li>
          ))}
        </ul>
      )}

      {settingsOpen && <TrainSettingsSheet settings={settings} onClose={() => setSettingsOpen(false)} />}
    </Screen>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2">
      <div className="numeric text-[1.25rem] font-extrabold leading-none tracking-[-0.02em]">{value}</div>
      <div className="label-micro mt-1.5 text-[0.5625rem] text-txt-3">{label}</div>
    </div>
  )
}

function ActiveCard({ workout, onResume }: { workout: Workout; onResume: () => void }) {
  const now = useNow(1000)
  const done = workout.sets.filter((s) => s.completedAt != null).length
  return (
    <Card className="mt-2 border-brand/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone="brand">In progress</Badge>
          <p className="mt-2 truncate text-[1.25rem] font-extrabold leading-tight tracking-[-0.02em]">
            {workout.name ?? 'Workout'}
          </p>
          <p className="numeric mt-1 text-[0.8125rem] text-txt-3">
            {clock(now - workout.startedAt)} · {done} of {workout.sets.length} sets done
          </p>
        </div>
      </div>
      <Button variant="primary" className="mt-4 w-full" onClick={onResume}>
        <Play size={16} /> Resume
      </Button>
    </Card>
  )
}

function ProgramCard({ program, onStart }: { program: Program; onStart: (day: RoutineDay) => void }) {
  const navigate = useNavigate()
  const nextIndex = program.days.length ? program.nextDayIndex % program.days.length : 0
  const next = program.days[nextIndex]

  if (!next) {
    return (
      <Card className="mt-2">
        <EmptyState
          title={program.name}
          body="This program has no days yet."
          action={<Button onClick={() => navigate(`/train/programs/${program.id}`)}>Edit program</Button>}
        />
      </Card>
    )
  }

  const setCount = (d: RoutineDay) => d.exercises.reduce((s, e) => s + e.sets, 0)

  return (
    <>
      <Card className="mt-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="label-micro truncate text-txt-3">{program.name}</p>
          <button
            className="shrink-0 text-[0.6875rem] font-bold text-brand-text"
            onClick={() => navigate('/train/programs')}
          >
            Change
          </button>
        </div>
        <p className="mt-2 text-[0.75rem] font-semibold text-txt-3">Next up</p>
        <p className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.025em]">{next.name}</p>
        <p className="mt-1 text-[0.8125rem] text-txt-3">
          {next.exercises.length} exercises · {setCount(next)} sets
        </p>
        <Button
          variant="primary"
          className="mt-4 w-full"
          disabled={next.exercises.length === 0}
          onClick={() => onStart(next)}
        >
          <Play size={16} /> Start {next.name}
        </Button>
      </Card>

      <ul className="mt-2 overflow-hidden rounded-card border border-line bg-surface">
        {program.days.map((d, i) => (
          <li key={d.id} className="border-b border-line last:border-b-0">
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-surface-2 disabled:opacity-40"
              disabled={d.exercises.length === 0}
              onClick={() => onStart(d)}
            >
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold">{d.name}</p>
                <p className="mt-0.5 text-[0.6875rem] text-txt-3">
                  {d.exercises.length} exercises · {setCount(d)} sets
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {i === nextIndex && <Badge tone="brand">Next</Badge>}
                <ChevronRight size={16} className="text-txt-4" />
              </div>
            </button>
          </li>
        ))}
        <li>
          <button
            className="w-full px-4 py-3 text-left text-[0.8125rem] font-bold text-txt-2 active:bg-surface-2"
            onClick={() => navigate(`/train/programs/${program.id}`)}
          >
            Edit program
          </button>
        </li>
      </ul>
    </>
  )
}

function SessionRow({ workout: w, onOpen }: { workout: Workout; onOpen: () => void }) {
  const sets = w.sets.filter(isWorking)
  const exercises = new Set(w.sets.filter(isLogged).map((s) => s.exerciseId))
  return (
    <button onClick={onOpen} className="block w-full text-left">
      <Card className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold">{w.name ?? 'Workout'}</p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-txt-3">
            {humanDate(w.date)} · {exercises.size} exercises · {sets.length} sets
            {w.endedAt ? ` · ${duration(w.endedAt - w.startedAt)}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="numeric text-[0.9375rem] font-bold">{num(Math.round(tonnage(w.sets)))} kg</div>
          <div className="text-[0.6875rem] text-txt-3">total load</div>
        </div>
      </Card>
    </button>
  )
}
