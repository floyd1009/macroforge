import { describe, expect, it } from 'vitest'
import { medianOfSamples } from './photo'
import { plateTotal } from './resolve'
import type { PhotoResult } from './prompts'
import type { ResolvedItem } from './resolve'

const item = (name: string, quantity: number, measure = 'g', confidence = 0.8) => ({
  name, quantity, measure, state: 'cooked' as const, confidence,
})

const sample = (items: PhotoResult['items'], overallConfidence = 0.7): PhotoResult => ({
  items, overallConfidence,
})

describe('self-consistency across samples', () => {
  it('takes the median portion, not the mean, so one wild sample cannot drag it', () => {
    const merged = medianOfSamples([
      sample([item('Reis', 150)]),
      sample([item('Reis', 160)]),
      sample([item('Reis', 900)]), // the outlier
    ])
    expect(merged.items[0].quantity).toBe(160)
  })

  it('drops a food only one sample hallucinated', () => {
    const merged = medianOfSamples([
      sample([item('Reis', 150), item('Trüffel', 20)]),
      sample([item('Reis', 155)]),
      sample([item('Reis', 145)]),
    ])
    expect(merged.items.map((i) => i.name)).toEqual(['Reis'])
  })

  it('keeps a food a majority of samples saw', () => {
    const merged = medianOfSamples([
      sample([item('Reis', 150), item('Brokkoli', 100)]),
      sample([item('Reis', 155), item('Brokkoli', 110)]),
      sample([item('Reis', 145)]),
    ])
    expect(merged.items.map((i) => i.name).sort()).toEqual(['Brokkoli', 'Reis'])
  })

  it('raises confidence when samples agree and lowers it when they scatter', () => {
    const tight = medianOfSamples([
      sample([item('Reis', 150)]), sample([item('Reis', 152)]), sample([item('Reis', 148)]),
    ])
    const loose = medianOfSamples([
      sample([item('Reis', 60)]), sample([item('Reis', 150)]), sample([item('Reis', 400)]),
    ])
    expect(tight.items[0].confidence).toBeGreaterThan(loose.items[0].confidence)
  })

  it('survives a single sample and an empty result', () => {
    expect(medianOfSamples([sample([item('Reis', 150)])]).items).toHaveLength(1)
    expect(medianOfSamples([sample([])]).items).toEqual([])
  })

  it('picks the measure most samples agreed on', () => {
    const merged = medianOfSamples([
      sample([item('Brot', 2, 'Scheibe')]),
      sample([item('Brot', 3, 'Scheibe')]),
      sample([item('Brot', 90, 'g')]),
    ])
    expect(merged.items[0].measure).toBe('scheibe')
    expect(merged.items[0].quantity).toBe(3)
  })
})

describe('plate totals and error bands', () => {
  const resolved = (kcal: number, uncertainty: number): ResolvedItem =>
    ({
      id: String(kcal), raw: item('x', 1), matchQuality: 'exact', grams: 100, unit: 'g',
      nutrients: { kcal, protein: 10, carbs: 10, fat: 5 },
      uncertainty, confidence: 'medium', explanation: '', assumed: false, needsAttention: false,
    }) as ResolvedItem

  it('sums nutrients across the plate', () => {
    const t = plateTotal([resolved(300, 0.2), resolved(200, 0.2)])
    expect(t.nutrients.kcal).toBe(500)
    expect(t.nutrients.protein).toBe(20)
  })

  it('combines independent errors in quadrature, not linearly', () => {
    // Two 300 kcal items at ±20% each: linear would give ±120, quadrature ±85.
    const t = plateTotal([resolved(300, 0.2), resolved(300, 0.2)])
    const band = t.nutrients.kcal - t.kcalLow
    expect(band).toBeCloseTo(Math.sqrt(60 ** 2 + 60 ** 2), 1)
    expect(band).toBeLessThan(120)
  })

  it('makes the relative error of a plate smaller than its worst item', () => {
    const t = plateTotal([resolved(300, 0.3), resolved(300, 0.3)])
    const relative = (t.nutrients.kcal - t.kcalLow) / t.nutrients.kcal
    expect(relative).toBeLessThan(0.3)
  })

  it('never reports a negative lower bound', () => {
    const t = plateTotal([resolved(50, 0.9)])
    expect(t.kcalLow).toBeGreaterThanOrEqual(0)
  })

  it('returns a zero plate for no items', () => {
    const t = plateTotal([])
    expect(t.nutrients.kcal).toBe(0)
    expect(t.kcalHigh).toBe(0)
  })
})
