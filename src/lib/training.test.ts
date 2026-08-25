import { describe, expect, it } from 'vitest'
import { brzycki, e1rm, epley, hardSets, personalRecord, tonnage, volumeStatus, weeklyVolume } from './training'
import type { MuscleGroup, Workout, WorkoutSet } from './types'

const set = (o: Partial<WorkoutSet>): WorkoutSet => ({
  id: Math.random().toString(36), exerciseId: 'bench', index: 1,
  weightKg: 100, reps: 5, ...o,
})

describe('e1RM formulas', () => {
  it('matches the published Epley value', () => {
    // 100 kg x 5: 100 * (1 + 5/30) = 116.67
    expect(epley(100, 5)).toBeCloseTo(116.67, 1)
  })

  it('matches the published Brzycki value', () => {
    // 100 kg x 5: 100 * 36 / 32 = 112.5
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 1)
  })

  it('returns the weight itself for a true single', () => {
    expect(e1rm(140, 1).value).toBe(140)
    expect(epley(140, 1)).toBe(140)
    expect(brzycki(140, 1)).toBe(140)
  })

  it('does not blow up as Brzycki approaches its asymptote at 37 reps', () => {
    expect(Number.isFinite(brzycki(50, 36))).toBe(true)
    expect(Number.isFinite(brzycki(50, 40))).toBe(true)
    expect(e1rm(50, 40).value).toBeLessThan(500)
  })

  it('blends smoothly between the two formulas instead of jumping', () => {
    const a = e1rm(100, 9).value
    const b = e1rm(100, 10).value
    const c = e1rm(100, 11).value
    expect(b - a).toBeLessThan(6)
    expect(c - b).toBeLessThan(6)
    expect(b).toBeGreaterThan(a)
  })

  it('accounts for reps left in reserve via RPE', () => {
    // 100x5 @ RPE 8 means ~2 more were available, so a higher true max.
    expect(e1rm(100, 5, 8).value).toBeGreaterThan(e1rm(100, 5, 10).value)
  })

  it('flags high-rep estimates as unreliable', () => {
    expect(e1rm(60, 5).reliable).toBe(true)
    expect(e1rm(40, 20).reliable).toBe(false)
  })

  it('handles nonsense input without producing NaN', () => {
    expect(e1rm(0, 5).value).toBe(0)
    expect(e1rm(100, 0).value).toBe(0)
  })
})

describe('volume counting', () => {
  it('sums tonnage and ignores warm-ups', () => {
    expect(tonnage([set({ weightKg: 100, reps: 5 }), set({ weightKg: 60, reps: 10, warmup: true })])).toBe(500)
  })

  it('counts a set near failure fully and an easy set partially', () => {
    expect(hardSets([set({ rir: 1 })])).toBe(1)
    expect(hardSets([set({ rir: 4 })])).toBe(0.5)
    expect(hardSets([set({ rir: 8 })])).toBe(0)
    expect(hardSets([set({ warmup: true, rir: 0 })])).toBe(0)
  })

  it('derives RIR from RPE when RIR is absent', () => {
    expect(hardSets([set({ rpe: 9 })])).toBe(1)
    expect(hardSets([set({ rpe: 6 })])).toBe(0.5)
  })

  it('counts secondary muscles at half weight', () => {
    const workouts: Workout[] = [
      { id: 'w1', date: '2026-08-24', startedAt: 0, sets: [set({ rir: 1 }), set({ rir: 1 })] },
    ]
    const muscles = new Map([['bench', { primary: 'chest' as MuscleGroup, secondary: ['triceps' as MuscleGroup] }]])
    const v = weeklyVolume(workouts, muscles)
    expect(v.get('chest')).toBe(2)
    expect(v.get('triceps')).toBe(1)
  })

  it('classifies weekly volume against the landmarks', () => {
    expect(volumeStatus(4, 'chest')).toBe('below')
    expect(volumeStatus(12, 'chest')).toBe('productive')
    expect(volumeStatus(20, 'chest')).toBe('high')
    expect(volumeStatus(30, 'chest')).toBe('over')
  })
})

describe('personal records', () => {
  it('finds the best reliable e1RM and ignores failed and warm-up sets', () => {
    const workouts: Workout[] = [
      {
        id: 'w1', date: '2026-08-01', startedAt: 0,
        sets: [
          set({ weightKg: 100, reps: 5 }),
          set({ weightKg: 200, reps: 1, failed: true }),
          set({ weightKg: 180, reps: 1, warmup: true }),
          set({ weightKg: 110, reps: 3 }),
        ],
      },
    ]
    const pr = personalRecord(workouts, 'bench')!
    expect(pr.weight).toBe(110)
    expect(pr.reps).toBe(3)
  })

  it('returns null when there is nothing to report', () => {
    expect(personalRecord([], 'bench')).toBeNull()
  })
})
