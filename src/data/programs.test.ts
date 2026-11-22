import { describe, expect, it } from 'vitest'
import { buildSeedExercises, exerciseId, seedExercisePatch } from './exercises'
import { PROGRAM_TEMPLATES, programFromTemplate, templateWeeklySets } from './programs'
import { LANDMARKS } from '../lib/training'
import type { MuscleGroup } from '../lib/types'

const seeds = buildSeedExercises()
const byId = new Map(seeds.map((e) => [e.id, e]))

describe('seed exercises', () => {
  it('has unique ids', () => {
    expect(new Set(seeds.map((e) => e.id)).size).toBe(seeds.length)
  })

  it('keeps the ids that shipped in the first release', () => {
    // Sets are stored against these ids. Renaming a seed exercise orphans history.
    for (const id of [
      'ex:bench-press',
      'ex:back-squat',
      'ex:deadlift',
      'ex:pull-up',
      'ex:overhead-press',
      'ex:lat-pulldown',
      'ex:romanian-deadlift',
      'ex:calf-raise',
      'ex:leg-curl',
      'ex:ab-wheel-rollout',
      'ex:stationary-bike',
    ]) {
      expect(byId.has(id), id).toBe(true)
    }
  })

  it('covers every muscle group with at least two movements', () => {
    const count = new Map<MuscleGroup, number>()
    for (const e of seeds) count.set(e.primary, (count.get(e.primary) ?? 0) + 1)
    for (const m of Object.keys(LANDMARKS) as MuscleGroup[]) {
      expect(count.get(m) ?? 0, m).toBeGreaterThanOrEqual(2)
    }
  })

  it('marks bodyweight movements and leaves loaded ones alone', () => {
    expect(byId.get('ex:pull-up')!.bodyweight).toBe(true)
    expect(byId.get('ex:bench-press')!.bodyweight).toBe(false)
  })

  it('patches reference data on an existing row without touching usage', () => {
    const seed = byId.get('ex:bench-press')!
    const old = { ...seed, cues: undefined, useCount: 12, lastUsedAt: 5 }
    const patch = seedExercisePatch(old, seed)
    expect(patch).toEqual({ cues: seed.cues })
    expect(seedExercisePatch(seed, seed)).toBeNull()
  })
})

describe('program templates', () => {
  it('only reference exercises that exist in the seed list', () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const d of t.days) {
        for (const [name] of d.slots) {
          expect(byId.has(exerciseId(name)), `${t.name} / ${d.name} / ${name}`).toBe(true)
        }
      }
    }
  })

  it('have sane prescriptions', () => {
    for (const t of PROGRAM_TEMPLATES) {
      expect(t.days.length).toBeGreaterThanOrEqual(2)
      for (const d of t.days) {
        // The same exercise twice in one day would merge into one block.
        expect(new Set(d.slots.map((s) => s[0])).size, `${t.name} / ${d.name}`).toBe(d.slots.length)
        for (const [name, sets, repMin, repMax, rir, rest] of d.slots) {
          expect(sets, name).toBeGreaterThanOrEqual(1)
          expect(sets, name).toBeLessThanOrEqual(6)
          expect(repMin, name).toBeLessThan(repMax)
          expect(rir, name).toBeGreaterThanOrEqual(0)
          expect(rir, name).toBeLessThanOrEqual(4)
          expect(rest, name).toBeGreaterThanOrEqual(45)
        }
      }
    }
  })

  it('keep every major muscle inside its weekly volume landmarks', () => {
    const major: MuscleGroup[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings']
    for (const t of PROGRAM_TEMPLATES) {
      const vol = new Map<MuscleGroup, number>()
      for (const d of t.days) {
        for (const [name, sets] of d.slots) {
          const e = byId.get(exerciseId(name))!
          vol.set(e.primary, (vol.get(e.primary) ?? 0) + sets)
          for (const s of e.secondary) vol.set(s, (vol.get(s) ?? 0) + sets * 0.5)
        }
      }
      for (const m of major) {
        const v = vol.get(m) ?? 0
        // The two-day template is deliberately at the floor, so allow it under MEV.
        const floor = t.days.length <= 2 ? 4 : LANDMARKS[m].mev - 2
        expect(v, `${t.name} ${m}`).toBeGreaterThanOrEqual(floor)
        expect(v, `${t.name} ${m}`).toBeLessThanOrEqual(LANDMARKS[m].mrv)
      }
    }
  })

  it('copy into an inactive, independent program', () => {
    let i = 0
    const p = programFromTemplate(PROGRAM_TEMPLATES[0], () => `id${i++}`, 1000)
    expect(p.active).toBe(0)
    expect(p.nextDayIndex).toBe(0)
    expect(p.templateId).toBe(PROGRAM_TEMPLATES[0].id)
    expect(p.days).toHaveLength(PROGRAM_TEMPLATES[0].days.length)
    const ids = [p.id, ...p.days.map((d) => d.id), ...p.days.flatMap((d) => d.exercises.map((e) => e.id))]
    expect(new Set(ids).size).toBe(ids.length)
    expect(templateWeeklySets(PROGRAM_TEMPLATES[0])).toBeGreaterThan(10)
  })
})
