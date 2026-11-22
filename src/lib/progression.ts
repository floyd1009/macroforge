/**
 * What to load next time.
 *
 * The rule is double progression: hold the load and add reps until every set
 * reaches the top of the rep range, then add load and start again from the
 * bottom of the range.
 *
 * Where it comes from: it is a programming convention, not a physiological
 * law. What is measured is only that training close to failure across a wide
 * rep range grows muscle, and that the load you can move for a given rep
 * count rises as you adapt. Double progression is a bookkeeping method for
 * following that adaptation with the plates a gym actually has.
 *
 * Where it breaks:
 *  - Past the first couple of years, adaptation is slower than "one rep per
 *    session". The rule then proposes a target you will miss; a missed target
 *    is information, not a failure, and the rule simply repeats it.
 *  - Lifts limited by technique or pain rather than force. It only sees reps.
 *  - Coarse load steps on light movements. Going from 10 to 12 kg dumbbells is
 *    +20 %, more than the whole rep range is worth, so there the rule widens
 *    the range by a rep instead of adding load (see `canAffordIncrement`).
 *  - It assumes the logged RIR is honest. People misjudge reps in reserve the
 *    further they are from failure, so RIR only shifts the decision by a rep
 *    or two and never decides it alone.
 */

export interface LastSet {
  weightKg: number
  reps: number
  /** Reps in reserve as logged; absent means "as prescribed". */
  rir?: number
}

export interface RepTarget {
  repMin: number
  repMax: number
  rir: number
}

export type ProgressionReason =
  | 'increase' // top of range everywhere: more load
  | 'add_reps' // inside the range: same load, one more rep
  | 'expand' // top of range, but the next load step is too big: one more rep
  | 'reduce' // fell out of the bottom of the range: less load
  | 'repeat' // nothing to change

export interface Suggestion {
  weightKg: number
  reps: number
  reason: ProgressionReason
}

export interface ProgressionOptions {
  /** Smallest load step for this movement, kg. */
  incrementKg: number
  /** Load is the lifter's body: only reps can progress. */
  bodyweight?: boolean
}

export function roundToIncrement(kg: number, incrementKg: number): number {
  if (incrementKg <= 0) return kg
  // Count whole steps first, then scale, to avoid 62.50000000001.
  return Math.round(Math.round(kg / incrementKg) * incrementKg * 1000) / 1000
}

/**
 * Load step by equipment, in kg, as entered in the weight field.
 *
 * Barbells, machines and cables: 2.5 kg (two 1.25 kg plates, or one small
 * stack step). Dumbbells are logged per hand and racks usually go up in 2 kg
 * steps. These are defaults for a commercial gym; an exercise can override
 * them with its own `incrementKg`.
 */
export function defaultIncrement(equipment?: string): number {
  switch (equipment) {
    case 'Dumbbell':
    case 'Kettlebell':
      return 2
    default:
      return 2.5
  }
}

/**
 * Reps this set was "worth" at the prescribed effort.
 *
 * 12 reps with 4 in reserve is more than 12 reps with 2 in reserve, so spare
 * reps beyond the target are credited (capped, because far from failure the
 * estimate is unreliable). Going one rep harder than prescribed is forgiven,
 * because RIR is not perceived that precisely; going further than that means
 * the reps were bought with effort the plan did not ask for, and they are
 * discounted.
 */
function effectiveReps(s: LastSet, targetRir: number): number {
  const diff = (s.rir ?? targetRir) - targetRir
  return s.reps + (diff < 0 ? Math.min(0, diff + 1) : Math.min(diff, 3))
}

/**
 * Is one load step small enough to land inside the rep range?
 *
 * Uses Epley (1RM = w * (1 + reps/30)): if you can do `repMax` reps at `w`,
 * the heaviest load you can do `repMin` reps with is about
 * w * (1 + repMax/30) / (1 + repMin/30). Epley is an average over lifters and
 * is poor above ~12 reps, so this is a guard against obviously oversized
 * jumps, not a prediction.
 */
function canAffordIncrement(weightKg: number, incrementKg: number, t: RepTarget): boolean {
  if (weightKg <= 0) return false
  const ceiling = (weightKg * (1 + t.repMax / 30)) / (1 + t.repMin / 30)
  // Half a step of tolerance: missing the bottom of the range by a rep once
  // is cheaper than never progressing.
  return weightKg + incrementKg <= ceiling + incrementKg / 2
}

/**
 * Targets for each of `setCount` sets, from the previous session's working
 * sets. Returns `null` with no history: a first session has nothing to
 * progress from, and inventing a starting load would be a guess presented
 * as advice.
 */
export function suggestSets(
  last: LastSet[],
  target: RepTarget,
  setCount: number,
  opts: ProgressionOptions,
): Suggestion[] | null {
  const sets = last.filter((s) => s.reps > 0)
  if (sets.length === 0 || setCount <= 0) return null

  const { incrementKg, bodyweight } = opts
  const at = (i: number) => sets[Math.min(i, sets.length - 1)]
  const build = (fn: (s: LastSet) => Suggestion) =>
    Array.from({ length: setCount }, (_, i) => fn(at(i)))

  // No external load to move: reps are the only dial.
  if (bodyweight && sets.every((s) => s.weightKg <= 0)) {
    return build((s) => ({ weightKg: 0, reps: s.reps + 1, reason: 'add_reps' }))
  }

  const first = sets[0]
  const allAtTop = sets.every((s) => effectiveReps(s, target.rir) >= target.repMax)

  if (allAtTop) {
    if (canAffordIncrement(first.weightKg, incrementKg, target)) {
      return build((s) => ({
        weightKg: roundToIncrement(s.weightKg + incrementKg, incrementKg),
        reps: target.repMin,
        reason: 'increase',
      }))
    }
    return build((s) => ({
      weightKg: s.weightKg,
      reps: Math.max(s.reps, target.repMax) + 1,
      reason: 'expand',
    }))
  }

  // Under the range on the first, freshest set, at honest effort: too heavy.
  if (first.reps < target.repMin && (first.rir ?? target.rir) <= target.rir) {
    return build((s) => {
      const lighter = roundToIncrement(s.weightKg * 0.95, incrementKg)
      // 5 % of a light load can round back to the same number; always step down.
      const weightKg = Math.max(0, lighter < s.weightKg ? lighter : s.weightKg - incrementKg)
      return { weightKg, reps: target.repMin, reason: 'reduce' }
    })
  }

  return build((s) => {
    const reps = Math.max(target.repMin, Math.min(target.repMax, s.reps + 1))
    return { weightKg: s.weightKg, reps, reason: reps === s.reps ? 'repeat' : 'add_reps' }
  })
}

export const REASON_LABEL: Record<ProgressionReason, string> = {
  increase: 'Top of the range last time, so more load',
  add_reps: 'Same load, one more rep',
  expand: 'Next load step is too big, so one more rep',
  reduce: 'Below the range last time, so slightly lighter',
  repeat: 'Repeat last session',
}
