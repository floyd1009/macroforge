import type { MuscleGroup, Workout, WorkoutSet } from './types'

/* ------------------------------------------------------------------ *
 * Estimated 1RM
 * ------------------------------------------------------------------ */

/**
 * Epley: 1RM = w × (1 + reps/30). Slightly generous at low reps.
 */
export const epley = (weight: number, reps: number): number =>
  reps <= 1 ? weight : weight * (1 + reps / 30)

/**
 * Brzycki: 1RM = w × 36 / (37 − reps). More accurate under ~10 reps,
 * and it blows up as reps approach 37, so it must be bounded.
 */
export const brzycki = (weight: number, reps: number): number =>
  reps <= 1 ? weight : reps >= 36 ? weight * 3 : (weight * 36) / (37 - reps)

/**
 * Best available estimate of a one-rep max.
 *
 * Brzycki is the better fit in the 2–10 rep range where almost all working
 * sets live; Epley is more stable above that. Blending across the boundary
 * avoids a visible jump in a chart when a set moves from 9 to 11 reps.
 *
 * Above ~12 reps every formula degrades badly — fatigue, not strength, is the
 * limiter — so the result is flagged rather than silently trusted.
 */
export function e1rm(weight: number, reps: number, rpe?: number): { value: number; reliable: boolean } {
  if (weight <= 0 || reps <= 0) return { value: 0, reliable: false }

  // An RPE below 10 means reps were left in reserve; fold them in first.
  const effectiveReps = rpe != null && rpe < 10 ? reps + (10 - rpe) : reps

  let value: number
  if (effectiveReps <= 8) value = brzycki(weight, effectiveReps)
  else if (effectiveReps >= 12) value = epley(weight, effectiveReps)
  else {
    const t = (effectiveReps - 8) / 4
    value = brzycki(weight, effectiveReps) * (1 - t) + epley(weight, effectiveReps) * t
  }
  return { value, reliable: effectiveReps <= 12 }
}

/* ------------------------------------------------------------------ *
 * What counts as a set
 * ------------------------------------------------------------------ */

/** `type` is the source of truth; `warmup` is read for rows that predate it. */
export const isWarmup = (s: WorkoutSet): boolean =>
  s.type === 'warmup' || (s.type == null && !!s.warmup)

/**
 * A set exists once it was ticked off, or once reps were typed in. The second
 * clause keeps sessions logged before the tick existed, and it means numbers
 * a user typed but forgot to tick are not thrown away when they finish.
 * A pre-created target row (0 reps, no tick) is a plan, not a set.
 */
export const isLogged = (s: WorkoutSet): boolean => s.completedAt != null || s.reps > 0

/** Logged and not a warm-up: the sets volume, records and progression use. */
export const isWorking = (s: WorkoutSet): boolean => isLogged(s) && !isWarmup(s)

/** e1RM for a stored set, reading effort from whichever field was logged. */
export function setE1rm(s: WorkoutSet): { value: number; reliable: boolean } {
  const rpe = s.rpe ?? (s.rir != null ? 10 - s.rir : undefined)
  return e1rm(s.weightKg, s.reps, rpe)
}

/** Total load moved: the simplest honest measure of session work. */
export function tonnage(sets: WorkoutSet[]): number {
  return sets.filter(isWorking).reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

/**
 * "Hard sets" — the unit hypertrophy research actually counts.
 *
 * Warm-ups do not count. A set taken well short of failure counts partially,
 * because 4 reps in reserve is not the same stimulus as 1.
 */
export function hardSets(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => {
    if (!isWorking(s)) return sum
    // A set marked as taken to failure has, by definition, nothing in reserve.
    const rir = s.type === 'failure' ? 0 : (s.rir ?? (s.rpe != null ? 10 - s.rpe : 2))
    if (rir <= 3) return sum + 1
    if (rir <= 5) return sum + 0.5
    return sum
  }, 0)
}

/* ------------------------------------------------------------------ *
 * Weekly volume landmarks
 *
 * Ranges commonly used in evidence-based programming: the minimum that
 * produces growth, a productive middle, and the point past which recovery
 * usually becomes the limiter. They are population guidance, not personal
 * prescriptions, and the UI should say so.
 * ------------------------------------------------------------------ */

export interface VolumeLandmarks {
  mev: number
  mav: number
  mrv: number
}

export const LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest: { mev: 8, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  shoulders: { mev: 8, mav: 16, mrv: 24 },
  biceps: { mev: 6, mav: 14, mrv: 20 },
  triceps: { mev: 6, mav: 14, mrv: 20 },
  quads: { mev: 8, mav: 16, mrv: 22 },
  hamstrings: { mev: 6, mav: 12, mrv: 18 },
  glutes: { mev: 4, mav: 12, mrv: 16 },
  calves: { mev: 6, mav: 14, mrv: 20 },
  abs: { mev: 4, mav: 12, mrv: 20 },
  forearms: { mev: 4, mav: 10, mrv: 16 },
  traps: { mev: 4, mav: 10, mrv: 16 },
  neck: { mev: 2, mav: 6, mrv: 12 },
  cardio: { mev: 0, mav: 0, mrv: 0 },
}

export type VolumeStatus = 'below' | 'productive' | 'high' | 'over'

export function volumeStatus(sets: number, m: MuscleGroup): VolumeStatus {
  const l = LANDMARKS[m]
  if (sets < l.mev) return 'below'
  if (sets <= l.mav) return 'productive'
  if (sets <= l.mrv) return 'high'
  return 'over'
}

/**
 * Weekly hard sets per muscle group.
 *
 * A secondary muscle counts half: a bench press trains triceps, but not as
 * much as a triceps extension does.
 */
export function weeklyVolume(
  workouts: Workout[],
  exerciseMuscles: Map<string, { primary: MuscleGroup; secondary: MuscleGroup[] }>,
): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>()
  for (const w of workouts) {
    if (w.deleted) continue
    for (const set of w.sets) {
      if (!isWorking(set)) continue
      const m = exerciseMuscles.get(set.exerciseId)
      if (!m) continue
      const weight = hardSets([set])
      out.set(m.primary, (out.get(m.primary) ?? 0) + weight)
      for (const s of m.secondary) out.set(s, (out.get(s) ?? 0) + weight * 0.5)
    }
  }
  return out
}

/** Best e1RM ever recorded for an exercise, for the PR badge. */
export function personalRecord(workouts: Workout[], exerciseId: string): { e1rm: number; weight: number; reps: number } | null {
  let best: { e1rm: number; weight: number; reps: number } | null = null
  for (const w of workouts) {
    if (w.deleted) continue
    for (const s of w.sets) {
      if (s.exerciseId !== exerciseId || !isWorking(s) || s.failed) continue
      const { value, reliable } = setE1rm(s)
      if (!reliable) continue
      if (!best || value > best.e1rm) best = { e1rm: value, weight: s.weightKg, reps: s.reps }
    }
  }
  return best
}

/* ------------------------------------------------------------------ *
 * Per-exercise history
 * ------------------------------------------------------------------ */

export interface ExerciseSession {
  workoutId: string
  date: string
  startedAt: number
  /** Working sets for this exercise, in the order they were done. */
  sets: WorkoutSet[]
  /** Best reliable e1RM of the session; 0 when no set qualifies. */
  bestE1rm: number
  topWeight: number
  volume: number
}

/** Every session that contains working sets of an exercise, oldest first. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    if (w.deleted) continue
    const sets = w.sets.filter((s) => s.exerciseId === exerciseId && isWorking(s))
    if (sets.length === 0) continue
    let best = 0
    for (const s of sets) {
      if (s.failed) continue
      const e = setE1rm(s)
      if (e.reliable && e.value > best) best = e.value
    }
    out.push({
      workoutId: w.id,
      date: w.date,
      startedAt: w.startedAt,
      sets,
      bestE1rm: best,
      topWeight: Math.max(...sets.map((s) => s.weightKg)),
      volume: tonnage(sets),
    })
  }
  return out.sort((a, b) => a.startedAt - b.startedAt)
}

/**
 * Working sets from the most recent *finished* session of an exercise.
 *
 * `before` excludes the session being logged right now, otherwise the first
 * set you tick becomes its own "last time".
 */
export function lastPerformance(
  workouts: Workout[],
  exerciseId: string,
  before = Number.POSITIVE_INFINITY,
): WorkoutSet[] | null {
  let best: Workout | null = null
  for (const w of workouts) {
    if (w.deleted || !w.endedAt || w.startedAt >= before) continue
    if (!w.sets.some((s) => s.exerciseId === exerciseId && isWorking(s))) continue
    if (!best || w.startedAt > best.startedAt) best = w
  }
  return best ? best.sets.filter((s) => s.exerciseId === exerciseId && isWorking(s)) : null
}

export interface ExerciseRecords {
  e1rm?: { value: number; weight: number; reps: number; date: string }
  heaviest?: { weight: number; reps: number; date: string }
  mostReps?: { reps: number; weight: number; date: string }
  volume?: { value: number; date: string }
}

export function exerciseRecords(history: ExerciseSession[]): ExerciseRecords {
  const r: ExerciseRecords = {}
  for (const h of history) {
    if (h.volume > 0 && (!r.volume || h.volume > r.volume.value)) r.volume = { value: h.volume, date: h.date }
    for (const s of h.sets) {
      if (s.failed || s.reps <= 0) continue
      const e = setE1rm(s)
      if (e.reliable && e.value > 0 && (!r.e1rm || e.value > r.e1rm.value))
        r.e1rm = { value: e.value, weight: s.weightKg, reps: s.reps, date: h.date }
      // Heaviest: ties broken by reps, so 100 x 6 beats 100 x 5.
      if (
        s.weightKg > 0 &&
        (!r.heaviest ||
          s.weightKg > r.heaviest.weight ||
          (s.weightKg === r.heaviest.weight && s.reps > r.heaviest.reps))
      )
        r.heaviest = { weight: s.weightKg, reps: s.reps, date: h.date }
      if (
        !r.mostReps ||
        s.reps > r.mostReps.reps ||
        (s.reps === r.mostReps.reps && s.weightKg > r.mostReps.weight)
      )
        r.mostReps = { reps: s.reps, weight: s.weightKg, date: h.date }
    }
  }
  return r
}

export interface NewRecord {
  exerciseId: string
  kind: 'e1rm' | 'weight' | 'reps'
  value: number
  /** The set that set it, for display. */
  weight: number
  reps: number
  previous?: number
}

/**
 * Records a session set against everything logged before it.
 *
 * A first-ever session of an exercise sets no records: with nothing to beat,
 * calling every number a record would make the badge meaningless.
 */
export function newRecords(workout: Workout, all: Workout[]): NewRecord[] {
  const prior = all.filter((w) => !w.deleted && w.id !== workout.id && w.startedAt < workout.startedAt)
  const out: NewRecord[] = []
  const ids = [...new Set(workout.sets.filter(isWorking).map((s) => s.exerciseId))]
  for (const id of ids) {
    const before = exerciseRecords(exerciseHistory(prior, id))
    if (!before.e1rm && !before.heaviest && !before.mostReps) continue
    const now = exerciseRecords(exerciseHistory([workout], id))
    if (now.e1rm && before.e1rm && now.e1rm.value > before.e1rm.value + 0.05) {
      out.push({
        exerciseId: id,
        kind: 'e1rm',
        value: now.e1rm.value,
        weight: now.e1rm.weight,
        reps: now.e1rm.reps,
        previous: before.e1rm.value,
      })
    }
    if (now.heaviest && before.heaviest && now.heaviest.weight > before.heaviest.weight) {
      out.push({
        exerciseId: id,
        kind: 'weight',
        value: now.heaviest.weight,
        weight: now.heaviest.weight,
        reps: now.heaviest.reps,
        previous: before.heaviest.weight,
      })
    } else if (
      // Rep records only matter where load is not the variable: bodyweight work.
      now.mostReps &&
      before.mostReps &&
      !before.heaviest &&
      now.mostReps.reps > before.mostReps.reps
    ) {
      out.push({
        exerciseId: id,
        kind: 'reps',
        value: now.mostReps.reps,
        weight: now.mostReps.weight,
        reps: now.mostReps.reps,
        previous: before.mostReps.reps,
      })
    }
  }
  return out
}

/** Hard sets per muscle for one session: full credit primary, half secondary. */
export function sessionVolume(
  workout: Workout,
  exerciseMuscles: Map<string, { primary: MuscleGroup; secondary: MuscleGroup[] }>,
): Array<[MuscleGroup, number]> {
  return [...weeklyVolume([workout], exerciseMuscles).entries()]
    .filter(([m, n]) => m !== 'cardio' && n > 0)
    .sort((a, b) => b[1] - a[1])
}

/* ------------------------------------------------------------------ *
 * Plate loading
 * ------------------------------------------------------------------ */

export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  perSide: number[]
  /** Total actually loadable with the plates available, bar included. */
  achieved: number
  /** Target minus achieved; non-zero when the target cannot be built exactly. */
  remainder: number
}

/**
 * Plates per side for a barbell target.
 *
 * Greedy, largest plate first. Greedy is exact for the standard plate series
 * (25/20/15/10/5/2.5/1.25); an unusual home set such as 15/10/10 can defeat
 * it, in which case the remainder says so instead of a wrong breakdown being
 * shown as if it were right.
 */
export function plateLoad(targetKg: number, barKg: number, platesKg: number[]): PlateLoad {
  const plates = [...platesKg].filter((p) => p > 0).sort((a, b) => b - a)
  if (targetKg <= barKg) return { perSide: [], achieved: barKg, remainder: targetKg - barKg }
  // Work in grams so 1.25 kg plates do not accumulate float error.
  let left = Math.round(((targetKg - barKg) / 2) * 1000)
  const perSide: number[] = []
  for (const p of plates) {
    const g = Math.round(p * 1000)
    while (left >= g) {
      perSide.push(p)
      left -= g
    }
  }
  const achieved = barKg + 2 * perSide.reduce((a, b) => a + b, 0)
  return { perSide, achieved, remainder: Math.round((targetKg - achieved) * 1000) / 1000 }
}
