import { buildSeedExercises, seedExercisePatch } from '../../data/exercises'
import { programFromTemplate, type ProgramTemplate } from '../../data/programs'
import { todayKey } from '../../lib/date'
import { db, newId } from '../../lib/db'
import { defaultIncrement, suggestSets, type ProgressionReason } from '../../lib/progression'
import { isLogged, lastPerformance } from '../../lib/training'
import type { Exercise, Program, RoutineDay, Workout, WorkoutSet } from '../../lib/types'

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** The one unfinished session, if any. Not limited to today: a workout can cross midnight. */
export async function getActiveWorkout(): Promise<Workout | undefined> {
  const recent = await db.workouts.orderBy('startedAt').reverse().limit(30).toArray()
  return recent.find((w) => !w.deleted && !w.endedAt)
}

export async function getActiveProgram(): Promise<Program | undefined> {
  const rows = await db.programs.where('active').equals(1).toArray()
  return rows.find((p) => !p.deleted)
}

/** Exercise ids in display order: the stored order first, then anything only present as sets. */
export function orderedExerciseIds(w: Workout): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...(w.exerciseOrder ?? []), ...w.sets.map((s) => s.exerciseId)]) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

export const incrementFor = (ex?: Exercise): number => ex?.incrementKg ?? defaultIncrement(ex?.equipment)

/* ------------------------------------------------------------------ *
 * Planning sets
 * ------------------------------------------------------------------ */

export interface SlotTarget {
  sets: number
  repMin: number
  repMax: number
  rir: number
}

export interface Plan {
  sets: WorkoutSet[]
  reason?: ProgressionReason
}

/**
 * Pre-create the rows for one exercise.
 *
 * With a program target, the progression rule proposes each set from the last
 * finished session. Without one (an exercise added on the fly) there is no
 * rep range to progress inside, so last time's numbers are offered as-is.
 * Proposals are stored on the set and shown as placeholders: nothing is
 * logged until the user ticks it.
 */
export function planSets(
  ex: Exercise | undefined,
  exerciseId: string,
  target: SlotTarget | null,
  history: Workout[],
  before: number,
): Plan {
  const last = lastPerformance(history, exerciseId, before)
  // Drop and failure sets are a consequence of the set before them, not a
  // baseline to progress from.
  const base = (last ?? [])
    .filter((s) => s.type !== 'drop' && s.type !== 'failure')
    .map((s) => ({ weightKg: s.weightKg, reps: s.reps, rir: s.rir }))

  if (target) {
    const suggestion = suggestSets(base, target, target.sets, {
      incrementKg: incrementFor(ex),
      bodyweight: ex?.bodyweight,
    })
    return {
      reason: suggestion?.[0]?.reason,
      sets: Array.from({ length: target.sets }, (_, i) => ({
        id: newId(),
        exerciseId,
        index: i + 1,
        weightKg: 0,
        reps: 0,
        type: 'normal' as const,
        targetRepMin: target.repMin,
        targetRepMax: target.repMax,
        targetRir: target.rir,
        suggestedKg: suggestion?.[i]?.weightKg,
        suggestedReps: suggestion?.[i]?.reps,
      })),
    }
  }

  const count = Math.max(1, base.length)
  return {
    sets: Array.from({ length: count }, (_, i) => ({
      id: newId(),
      exerciseId,
      index: i + 1,
      weightKg: 0,
      reps: 0,
      type: 'normal' as const,
      suggestedKg: base[i]?.weightKg,
      suggestedReps: base[i]?.reps,
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Workout lifecycle
 * ------------------------------------------------------------------ */

export async function startWorkout(from?: { program: Program; day: RoutineDay }): Promise<string> {
  // Two open sessions would make "the active workout" ambiguous everywhere.
  const open = await getActiveWorkout()
  if (open) return open.id

  const now = Date.now()
  const w: Workout = { id: newId(), date: todayKey(), startedAt: now, sets: [], exerciseOrder: [] }

  if (from) {
    const [history, exercises] = await Promise.all([db.workouts.toArray(), db.exercises.toArray()])
    const exMap = new Map(exercises.map((e) => [e.id, e]))
    w.name = from.day.name
    w.programId = from.program.id
    w.dayId = from.day.id
    w.restSec = {}
    w.exerciseNotes = {}
    for (const slot of from.day.exercises) {
      const plan = planSets(exMap.get(slot.exerciseId), slot.exerciseId, slot, history, now)
      const existing = w.sets.filter((s) => s.exerciseId === slot.exerciseId).length
      w.sets.push(...plan.sets.map((s, i) => ({ ...s, index: existing + i + 1 })))
      if (!w.exerciseOrder!.includes(slot.exerciseId)) w.exerciseOrder!.push(slot.exerciseId)
      w.restSec[slot.exerciseId] = slot.restSec
      if (slot.note) w.exerciseNotes[slot.exerciseId] = slot.note
    }
  }

  await db.workouts.add(w)
  return w.id
}

/** Read-modify-write inside a transaction, so two quick taps cannot overwrite each other. */
export async function patchWorkout(id: string, fn: (w: Workout) => Partial<Workout> | void): Promise<void> {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(id)
    if (!w) return
    const changes = fn(w)
    if (changes) await db.workouts.update(id, changes)
  })
}

/**
 * Close a session. Returns `false` when nothing was logged, in which case the
 * session is removed: an empty workout is a mis-tap, not history.
 */
export async function finishWorkout(id: string): Promise<boolean> {
  const w = await db.workouts.get(id)
  if (!w) return false
  const now = Date.now()
  const kept = w.sets
    .filter(isLogged)
    // Numbers typed but never ticked are still real sets.
    .map((s) => (s.completedAt ? s : { ...s, completedAt: now }))
  if (kept.length === 0) {
    await db.workouts.delete(id)
    return false
  }
  const done = new Set(kept.map((s) => s.exerciseId))
  await db.workouts.update(id, {
    sets: kept,
    endedAt: now,
    exerciseOrder: orderedExerciseIds(w).filter((x) => done.has(x)),
  })

  for (const exId of done) {
    const ex = await db.exercises.get(exId)
    if (ex) await db.exercises.update(exId, { useCount: (ex.useCount ?? 0) + 1, lastUsedAt: now })
  }

  // The program moves on to the day after the one just done, whichever day
  // that was, so doing sessions out of order does not strand the rotation.
  if (w.programId && w.dayId) {
    const p = await db.programs.get(w.programId)
    const i = p?.days.findIndex((d) => d.id === w.dayId) ?? -1
    if (p && i >= 0) {
      await db.programs.update(p.id, { nextDayIndex: (i + 1) % p.days.length, updatedAt: now })
    }
  }
  return true
}

export async function discardWorkout(id: string): Promise<void> {
  await db.workouts.delete(id)
}

/* ------------------------------------------------------------------ *
 * Programs
 * ------------------------------------------------------------------ */

export async function activateProgram(id: string): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    const all = await db.programs.toArray()
    for (const p of all) {
      const want = p.id === id ? 1 : 0
      if (p.active !== want) await db.programs.update(p.id, { active: want, updatedAt: Date.now() })
    }
  })
}

export async function adoptTemplate(t: ProgramTemplate): Promise<string> {
  const p = programFromTemplate(t, newId, Date.now())
  await db.programs.add(p)
  await activateProgram(p.id)
  return p.id
}

export async function createBlankProgram(): Promise<string> {
  const now = Date.now()
  const p: Program = {
    id: newId(),
    name: 'My program',
    days: [{ id: newId(), name: 'Day 1', exercises: [] }],
    active: 0,
    nextDayIndex: 0,
    createdAt: now,
    updatedAt: now,
  }
  await db.programs.add(p)
  // A first program is obviously the one the user means to run.
  if (!(await getActiveProgram())) await activateProgram(p.id)
  return p.id
}

export async function duplicateProgram(id: string): Promise<string | null> {
  const src = await db.programs.get(id)
  if (!src) return null
  const now = Date.now()
  const copy: Program = {
    ...src,
    id: newId(),
    name: `${src.name} (copy)`,
    active: 0,
    nextDayIndex: 0,
    createdAt: now,
    updatedAt: now,
    days: src.days.map((d) => ({
      ...d,
      id: newId(),
      exercises: d.exercises.map((e) => ({ ...e, id: newId() })),
    })),
  }
  await db.programs.add(copy)
  return copy.id
}

export async function saveProgram(id: string, changes: Partial<Program>): Promise<void> {
  await db.programs.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteProgram(id: string): Promise<void> {
  // Soft delete: finished workouts still point at the program by id.
  await db.programs.update(id, { deleted: true, active: 0, updatedAt: Date.now() })
}

/* ------------------------------------------------------------------ *
 * Exercises
 * ------------------------------------------------------------------ */

export async function createCustomExercise(e: {
  name: string
  primary: Exercise['primary']
  equipment: string
}): Promise<Exercise> {
  const row: Exercise = {
    id: `cx:${newId()}`,
    name: e.name.trim(),
    primary: e.primary,
    secondary: [],
    equipment: e.equipment,
    bodyweight: e.equipment === 'Bodyweight',
    isCustom: true,
    useCount: 0,
  }
  await db.exercises.add(row)
  return row
}

/**
 * Bring seed exercises on this device up to the bundled reference data.
 *
 * First-run seeding inserts only missing ids, so cues and load steps added
 * in a later release would never reach an existing install. This adds new
 * movements and patches reference fields on old ones. It never touches
 * custom exercises, usage counters or anything the user typed.
 */
export async function syncSeedExercises(): Promise<void> {
  const seeds = buildSeedExercises()
  const have = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  const missing = seeds.filter((s) => !have.has(s.id))
  if (missing.length) await db.exercises.bulkPut(missing)
  for (const s of seeds) {
    const cur = have.get(s.id)
    if (!cur || cur.isCustom) continue
    const patch = seedExercisePatch(cur, s)
    if (patch) await db.exercises.update(s.id, patch)
  }
}
