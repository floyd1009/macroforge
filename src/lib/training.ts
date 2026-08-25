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

/** Total load moved: the simplest honest measure of session work. */
export function tonnage(sets: WorkoutSet[]): number {
  return sets.filter((s) => !s.warmup).reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

/**
 * "Hard sets" — the unit hypertrophy research actually counts.
 *
 * Warm-ups do not count. A set taken well short of failure counts partially,
 * because 4 reps in reserve is not the same stimulus as 1.
 */
export function hardSets(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => {
    if (s.warmup) return sum
    const rir = s.rir ?? (s.rpe != null ? 10 - s.rpe : 2)
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
      if (set.warmup) continue
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
      if (s.exerciseId !== exerciseId || s.warmup || s.failed) continue
      const { value, reliable } = e1rm(s.weightKg, s.reps, s.rpe)
      if (!reliable) continue
      if (!best || value > best.e1rm) best = { e1rm: value, weight: s.weightKg, reps: s.reps }
    }
  }
  return best
}
