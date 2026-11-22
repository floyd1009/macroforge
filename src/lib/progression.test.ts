import { describe, expect, it } from 'vitest'
import { defaultIncrement, roundToIncrement, suggestSets } from './progression'
import { exerciseHistory, exerciseRecords, hardSets, isLogged, lastPerformance, newRecords, plateLoad } from './training'
import type { Workout, WorkoutSet } from './types'

const T = { repMin: 8, repMax: 12, rir: 2 }
const BAR = { incrementKg: 2.5 }

describe('double progression', () => {
  it('suggests nothing without history', () => {
    expect(suggestSets([], T, 3, BAR)).toBeNull()
    expect(suggestSets([{ weightKg: 80, reps: 0 }], T, 3, BAR)).toBeNull()
  })

  it('adds load and resets to the bottom of the range once every set hits the top', () => {
    const last = [1, 2, 3].map(() => ({ weightKg: 80, reps: 12, rir: 2 }))
    const s = suggestSets(last, T, 3, BAR)!
    expect(s).toHaveLength(3)
    expect(s.every((x) => x.weightKg === 82.5 && x.reps === 8 && x.reason === 'increase')).toBe(true)
  })

  it('holds the load and adds a rep while inside the range', () => {
    const s = suggestSets(
      [
        { weightKg: 80, reps: 11 },
        { weightKg: 80, reps: 10 },
        { weightKg: 80, reps: 9 },
      ],
      T,
      3,
      BAR,
    )!
    expect(s.map((x) => x.reps)).toEqual([12, 11, 10])
    expect(s.every((x) => x.weightKg === 80 && x.reason === 'add_reps')).toBe(true)
  })

  it('does not add load when only some sets reached the top', () => {
    const s = suggestSets(
      [
        { weightKg: 80, reps: 12 },
        { weightKg: 80, reps: 12 },
        { weightKg: 80, reps: 10 },
      ],
      T,
      3,
      BAR,
    )!
    expect(s[0]).toMatchObject({ weightKg: 80, reps: 12, reason: 'repeat' })
    expect(s[2]).toMatchObject({ weightKg: 80, reps: 11, reason: 'add_reps' })
  })

  it('credits reps left in reserve beyond the target', () => {
    // 11 reps with 4 in reserve is worth more than 12 at the prescribed 2.
    const last = [1, 2, 3].map(() => ({ weightKg: 80, reps: 11, rir: 4 }))
    expect(suggestSets(last, T, 3, BAR)![0].reason).toBe('increase')
  })

  it('forgives one rep of extra effort but not a grind to failure', () => {
    const oneHarder = [1, 2, 3].map(() => ({ weightKg: 80, reps: 12, rir: 1 }))
    expect(suggestSets(oneHarder, T, 3, BAR)![0].reason).toBe('increase')
    const toFailure = [1, 2, 3].map(() => ({ weightKg: 80, reps: 12, rir: 0 }))
    expect(suggestSets(toFailure, T, 3, BAR)![0].reason).not.toBe('increase')
  })

  it('reduces load about 5% when the first set fell below the range', () => {
    const s = suggestSets(
      [
        { weightKg: 100, reps: 6 },
        { weightKg: 100, reps: 5 },
      ],
      T,
      2,
      BAR,
    )!
    expect(s[0]).toMatchObject({ weightKg: 95, reps: 8, reason: 'reduce' })
  })

  it('always steps down at least one increment when reducing a light load', () => {
    // 5% of 20 kg is 1 kg, which rounds back to 20 with 2.5 kg steps.
    const s = suggestSets([{ weightKg: 20, reps: 5 }], T, 1, BAR)!
    expect(s[0].weightKg).toBe(17.5)
  })

  it('does not reduce when the low rep count was deliberate', () => {
    // 6 reps but 5 in reserve: stopped early, not too heavy.
    const s = suggestSets([{ weightKg: 100, reps: 6, rir: 5 }], T, 1, BAR)!
    expect(s[0].reason).not.toBe('reduce')
  })

  it('widens the rep range instead of making an oversized jump on light loads', () => {
    // 8 kg lateral raise, 2 kg steps: +25% is worth far more than 12 -> 8 reps.
    const last = [1, 2, 3].map(() => ({ weightKg: 8, reps: 12 }))
    const s = suggestSets(last, T, 3, { incrementKg: 2 })!
    expect(s[0]).toMatchObject({ weightKg: 8, reps: 13, reason: 'expand' })
  })

  it('progresses bodyweight movements by reps only', () => {
    const s = suggestSets(
      [
        { weightKg: 0, reps: 10 },
        { weightKg: 0, reps: 8 },
      ],
      T,
      3,
      { incrementKg: 2.5, bodyweight: true },
    )!
    expect(s.map((x) => [x.weightKg, x.reps])).toEqual([
      [0, 11],
      [0, 9],
      [0, 9],
    ])
  })

  it('treats a weighted bodyweight movement like any loaded lift', () => {
    const last = [1, 2].map(() => ({ weightKg: 10, reps: 12 }))
    const s = suggestSets(last, { repMin: 6, repMax: 12, rir: 2 }, 2, { incrementKg: 2.5, bodyweight: true })!
    expect(s[0]).toMatchObject({ weightKg: 12.5, reason: 'increase' })
  })

  it('fills extra sets from the last one performed', () => {
    const s = suggestSets([{ weightKg: 60, reps: 9 }], T, 3, BAR)!
    expect(s).toHaveLength(3)
    expect(s[2]).toMatchObject({ weightKg: 60, reps: 10 })
  })

  it('keeps per-set loads when the last session pyramided', () => {
    const s = suggestSets(
      [
        { weightKg: 100, reps: 9 },
        { weightKg: 90, reps: 10 },
      ],
      T,
      2,
      BAR,
    )!
    expect(s.map((x) => x.weightKg)).toEqual([100, 90])
  })
})

describe('increments', () => {
  it('rounds to the step without float noise', () => {
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5)
    expect(roundToIncrement(0.1 + 0.2, 0.1)).toBe(0.3)
  })
  it('uses 2 kg for dumbbells and 2.5 kg otherwise', () => {
    expect(defaultIncrement('Dumbbell')).toBe(2)
    expect(defaultIncrement('Barbell')).toBe(2.5)
    expect(defaultIncrement(undefined)).toBe(2.5)
  })
})

describe('plate calculator', () => {
  const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
  it('loads 100 kg on a 20 kg bar as 25 + 15 per side', () => {
    expect(plateLoad(100, 20, PLATES)).toEqual({ perSide: [25, 15], achieved: 100, remainder: 0 })
  })
  it('handles 1.25 kg plates exactly', () => {
    expect(plateLoad(62.5, 20, PLATES)).toEqual({ perSide: [20, 1.25], achieved: 62.5, remainder: 0 })
  })
  it('repeats the largest plate for heavy loads', () => {
    expect(plateLoad(220, 20, PLATES).perSide).toEqual([25, 25, 25, 25])
  })
  it('reports what cannot be loaded instead of rounding silently', () => {
    const r = plateLoad(61, 20, PLATES)
    expect(r.achieved).toBe(60)
    expect(r.remainder).toBe(1)
  })
  it('returns an empty bar at or below bar weight', () => {
    expect(plateLoad(20, 20, PLATES).perSide).toEqual([])
    expect(plateLoad(15, 20, PLATES).remainder).toBe(-5)
  })
  it('only uses plates that exist', () => {
    expect(plateLoad(70, 20, [20, 10]).perSide).toEqual([20])
    expect(plateLoad(70, 20, [20, 10]).remainder).toBe(10)
  })
})

/* --- history helpers --- */

let n = 0
const set = (o: Partial<WorkoutSet>): WorkoutSet => ({
  id: `s${n++}`,
  exerciseId: 'bench',
  index: 1,
  weightKg: 100,
  reps: 5,
  completedAt: 1,
  ...o,
})
const workout = (id: string, startedAt: number, sets: WorkoutSet[], finished = true): Workout => ({
  id,
  date: `2026-01-${String(startedAt).padStart(2, '0')}`,
  startedAt,
  endedAt: finished ? startedAt + 1 : undefined,
  sets,
})

describe('set status', () => {
  it('does not count a planned row as a set', () => {
    const planned = set({ reps: 0, weightKg: 0, completedAt: undefined })
    expect(isLogged(planned)).toBe(false)
    expect(hardSets([planned])).toBe(0)
  })
  it('counts ticked sets and legacy sets that only have reps', () => {
    expect(isLogged(set({ reps: 0, completedAt: 5 }))).toBe(true)
    expect(isLogged(set({ reps: 8, completedAt: undefined }))).toBe(true)
  })
  it('counts a failure set as a full hard set and a warm-up as none', () => {
    expect(hardSets([set({ type: 'failure', rir: 5 })])).toBe(1)
    expect(hardSets([set({ type: 'warmup', rir: 0 })])).toBe(0)
    expect(hardSets([set({ type: 'drop' })])).toBe(1)
  })
})

describe('exercise history', () => {
  const w1 = workout('a', 1, [set({ weightKg: 100, reps: 5 }), set({ weightKg: 60, reps: 10, type: 'warmup' })])
  const w2 = workout('b', 2, [set({ weightKg: 105, reps: 5 }), set({ exerciseId: 'squat', weightKg: 140, reps: 3 })])
  const w3 = workout('c', 3, [set({ weightKg: 110, reps: 3 })], false)

  it('lists sessions oldest first and drops warm-ups', () => {
    const h = exerciseHistory([w2, w1], 'bench')
    expect(h.map((x) => x.workoutId)).toEqual(['a', 'b'])
    expect(h[0].sets).toHaveLength(1)
    expect(h[0].volume).toBe(500)
  })

  it('finds the last finished session, excluding the one in progress', () => {
    expect(lastPerformance([w1, w2, w3], 'bench', w3.startedAt)![0].weightKg).toBe(105)
    // An unfinished session is never "last time", even without a cut-off.
    expect(lastPerformance([w1, w2, w3], 'bench')![0].weightKg).toBe(105)
    expect(lastPerformance([w1], 'squat')).toBeNull()
  })

  it('extracts records', () => {
    const r = exerciseRecords(exerciseHistory([w1, w2], 'bench'))
    expect(r.heaviest).toMatchObject({ weight: 105, reps: 5 })
    expect(r.e1rm!.value).toBeGreaterThan(115)
    expect(r.volume!.value).toBe(525)
  })

  it('reports records against earlier sessions only, and none on a first session', () => {
    expect(newRecords(w1, [w1, w2])).toEqual([])
    const recs = newRecords(w2, [w1, w2])
    expect(recs.map((r) => r.kind).sort()).toEqual(['e1rm', 'weight'])
    // Squat appears for the first time in w2: nothing to beat, so no record.
    expect(recs.every((r) => r.exerciseId === 'bench')).toBe(true)
  })
})
