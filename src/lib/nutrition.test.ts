import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FACTORS,
  adaptiveExpenditure,
  bmrKatchMcArdle,
  bmrMifflin,
  checkEnergy,
  computeTargets,
  kcalFromMacros,
  kjToKcal,
  convertMass,
  macroSplit,
  scale,
  scaleAcrossState,
  sodiumToSalt,
  sum,
  toAvailableCarbs,
  trendSeries,
  weightSlopeKgPerDay,
} from './nutrition'
import type { Nutrients, Profile } from './types'
import { addDays } from './date'

const per100 = (n: Partial<Nutrients>): Nutrients => ({
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  ...n,
})

describe('scaling', () => {
  it('scales a real label panel to a real portion', () => {
    // Barilla penne, per 100 g dry.
    const pasta = per100({ kcal: 359, protein: 12, carbs: 71.2, fat: 1.5, fiber: 3 })
    const portion = scale(pasta, 85)
    expect(portion.kcal).toBeCloseTo(305.15, 2)
    expect(portion.protein).toBeCloseTo(10.2, 2)
    expect(portion.carbs).toBeCloseTo(60.52, 2)
    expect(portion.fiber).toBeCloseTo(2.55, 2)
  })

  it('leaves optional fields absent rather than zero when the source lacks them', () => {
    const s = scale(per100({ kcal: 100, protein: 5, carbs: 5, fat: 5 }), 200)
    expect(s.fiber).toBeUndefined()
    expect(s.salt).toBeUndefined()
  })

  it('sums a day without losing optional nutrients present on only some items', () => {
    const total = sum([
      scale(per100({ kcal: 100, protein: 10, carbs: 5, fat: 3, fiber: 2 }), 100),
      scale(per100({ kcal: 200, protein: 4, carbs: 30, fat: 6 }), 100),
    ])
    expect(total.kcal).toBe(300)
    expect(total.protein).toBe(14)
    expect(total.fiber).toBe(2)
  })
})

describe('energy reconciliation', () => {
  it('accepts a consistent label', () => {
    // Chicken breast, raw: 23 g protein, 1.5 g fat -> ~105 kcal.
    const c = checkEnergy(per100({ kcal: 106, protein: 23, carbs: 0, fat: 1.5 }))
    expect(c.status).toBe('ok')
  })

  it('charges fibre at 2 kcal/g, on top of available carbs', () => {
    // EU convention: a label saying "30 g Kohlenhydrate, davon 10 g
    // Ballaststoffe" means 30 g available carbs PLUS 10 g fibre.
    // 30*4 + 10*2 = 140.
    expect(kcalFromMacros({ protein: 0, carbs: 30, fat: 0, fiber: 10 })).toBe(140)
  })

  it('flags a panel whose kcal cannot come from its macros', () => {
    const c = checkEnergy(per100({ kcal: 500, protein: 10, carbs: 10, fat: 5 }))
    expect(c.status).toBe('suspect')
    expect(c.deviation).toBeGreaterThan(0.5)
  })

  it('flags calories stated with no macros at all', () => {
    expect(checkEnergy(per100({ kcal: 250 })).status).toBe('suspect')
  })

  it('treats a few percent of label rounding as fine', () => {
    expect(checkEnergy(per100({ kcal: 108, protein: 23, carbs: 0, fat: 1.5 })).status).toBe('ok')
  })
})

describe('unit conversions', () => {
  it('converts kJ to kcal with the legal EU factor', () => {
    expect(kjToKcal(1500)).toBeCloseTo(358.51, 2)
  })

  it('converts US sodium to EU salt', () => {
    expect(sodiumToSalt(400)).toBeCloseTo(1.0, 6)
  })
})

describe('weight trend', () => {
  it('damps a single-day water spike', () => {
    const base = '2026-01-01'
    const raw = [80, 80, 80, 80, 83, 80, 80].map((kg, i) => ({ date: addDays(base, i), kg }))
    const t = trendSeries(raw, 0.1)
    const spikeDay = t[4]
    // The scale jumped 3 kg; the trend must move far less than that.
    expect(spikeDay.kg).toBe(83)
    expect(spikeDay.trendKg).toBeLessThan(80.4)
    expect(spikeDay.trendKg).toBeGreaterThan(80)
  })

  it('lets a reading after a long gap pull harder than a single day', () => {
    const short = trendSeries(
      [
        { date: '2026-01-01', kg: 80 },
        { date: '2026-01-02', kg: 82 },
      ],
      0.1,
    )
    const long = trendSeries(
      [
        { date: '2026-01-01', kg: 80 },
        { date: '2026-01-15', kg: 82 },
      ],
      0.1,
    )
    expect(long[1].trendKg).toBeGreaterThan(short[1].trendKg)
  })

  it('recovers a known linear rate of loss', () => {
    const base = '2026-01-01'
    // Exactly -0.1 kg/day for 30 days.
    const raw = Array.from({ length: 30 }, (_, i) => ({ date: addDays(base, i), kg: 90 - 0.1 * i }))
    const t = trendSeries(raw, 0.25)
    const fit = weightSlopeKgPerDay(t, 21)!
    expect(fit.slope).toBeCloseTo(-0.1, 2)
    expect(fit.r2).toBeGreaterThan(0.99)
  })
})

describe('BMR', () => {
  it('matches the published Mifflin-St Jeor result', () => {
    // 80 kg, 180 cm, 30 y male: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmrMifflin('male', 80, 180, 30)).toBe(1780)
    // Same body, female: -161 instead of +5
    expect(bmrMifflin('female', 80, 180, 30)).toBe(1614)
  })

  it('matches the published Katch-McArdle result', () => {
    // 80 kg at 15% fat -> 68 kg LBM: 370 + 21.6*68 = 1838.8
    expect(bmrKatchMcArdle(80, 15)).toBeCloseTo(1838.8, 1)
  })
})

const profile: Profile = {
  id: 'me',
  sex: 'male',
  birthDate: '1996-01-01',
  heightCm: 180,
  activity: 'moderate',
  goal: 'lose',
  rateKgPerWeek: -0.5,
  manualTargets: null,
  proteinPerKg: 2.0,
  fatPerKg: 0.8,
  units: 'metric',
  locale: 'de',
  createdAt: 0,
  updatedAt: 0,
}

describe('adaptive expenditure', () => {
  const base = '2026-01-01'

  it('falls back to the formula with no data, and says so', () => {
    const e = adaptiveExpenditure({ profile, intake: [], trend: [], currentKg: 80 })
    expect(e.dataWeight).toBe(0)
    expect(e.confidence).toBe('low')
    // Mifflin for a 30-y/o 80 kg 180 cm male x 1.55
    expect(e.tdee).toBeCloseTo(1780 * ACTIVITY_FACTORS.moderate, 0)
  })

  it('recovers a known TDEE from intake and weight change', () => {
    // Eat 2500 kcal/day against a true 3000 kcal/day expenditure.
    // Deficit 500 kcal/day -> 500/7700 = 0.06494 kg/day of loss.
    const days = 28
    const intake = Array.from({ length: days }, (_, i) => ({ date: addDays(base, i), kcal: 2500 }))
    const raw = Array.from({ length: days }, (_, i) => ({
      date: addDays(base, i),
      kg: 90 - (500 / 7700) * i,
    }))
    const trend = trendSeries(raw, 0.35)
    const e = adaptiveExpenditure({ profile, intake, trend, currentKg: 88, windowDays: 21 })

    expect(e.confidence).toBe('high')
    expect(e.slopeKgPerWeek).toBeCloseTo(-0.4545, 1)
    // Should land near the true 3000, well clear of the ~2800 formula guess.
    expect(e.tdee).toBeGreaterThan(2850)
    expect(e.tdee).toBeLessThan(3150)
  })

  it('stays cautious when weigh-ins are plentiful but logging is sparse', () => {
    const days = 28
    const intake = Array.from({ length: 4 }, (_, i) => ({ date: addDays(base, i * 6), kcal: 2500 }))
    const raw = Array.from({ length: days }, (_, i) => ({ date: addDays(base, i), kg: 90 - 0.06 * i }))
    const e = adaptiveExpenditure({ profile, intake, trend: trendSeries(raw), currentKg: 88 })
    expect(e.dataWeight).toBeLessThan(0.4)
    expect(e.confidence).toBe('low')
  })

  it('refuses to output an absurd TDEE from a water-weight swing', () => {
    const days = 21
    const intake = Array.from({ length: days }, (_, i) => ({ date: addDays(base, i), kcal: 2000 }))
    // A 4 kg overnight "gain" that is obviously not tissue.
    const raw = Array.from({ length: days }, (_, i) => ({
      date: addDays(base, i),
      kg: i < 18 ? 80 : 84,
    }))
    const e = adaptiveExpenditure({ profile, intake, trend: trendSeries(raw, 0.5), currentKg: 84 })
    const predicted = 1780 * ACTIVITY_FACTORS.moderate
    expect(e.tdee).toBeGreaterThanOrEqual(predicted * 0.6)
    expect(e.tdee).toBeLessThanOrEqual(predicted * 1.6)
  })
})

describe('targets', () => {
  it('sets protein and fat first, then fills with carbs', () => {
    const t = computeTargets({ profile, tdee: 3000, currentKg: 80 })
    expect(t.protein).toBe(160) // 80 kg * 2.0
    expect(t.fat).toBe(64) // 80 kg * 0.8
    // 3000 - (0.5*7700/7 = 550) = 2450
    expect(t.kcal).toBe(2450)
    // (2450 - 160*4 - 64*9) / 4 = (2450 - 640 - 576) / 4 = 308.5 -> 309
    expect(t.carbs).toBe(309)
    // The three macros must reconstruct the calorie target.
    expect(t.protein * 4 + t.carbs * 4 + t.fat * 9).toBeCloseTo(t.kcal, -1)
  })

  it('never prescribes a crash deficit', () => {
    const aggressive = { ...profile, rateKgPerWeek: -2 }
    const t = computeTargets({ profile: aggressive, tdee: 2400, currentKg: 70 })
    expect(t.kcal).toBeGreaterThanOrEqual(2400 * 0.65)
  })

  it('uses lean mass for protein when body fat is known', () => {
    const t = computeTargets({ profile, tdee: 3000, currentKg: 100, bodyFatPct: 30 })
    // 100 kg at 30% -> 70 kg LBM * 1.15 = 80.5 kg basis, not 100 kg.
    expect(t.protein).toBe(161)
  })

  it('honours a manual override verbatim', () => {
    const manual = { kcal: 2222, protein: 180, carbs: 200, fat: 60 }
    const t = computeTargets({ profile: { ...profile, manualTargets: manual }, tdee: 3000, currentKg: 80 })
    expect(t).toEqual(manual)
  })
})

describe('macro split', () => {
  it('sums to one and reflects kcal share, not gram share', () => {
    // Equal grams, unequal energy: fat should dominate.
    const s = macroSplit(per100({ kcal: 0, protein: 10, carbs: 10, fat: 10 }))
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(1, 6)
    expect(s.fat).toBeCloseTo(9 / 17, 4)
    expect(s.protein).toBeCloseTo(4 / 17, 4)
  })

  it('returns zeros for an empty day instead of dividing by zero', () => {
    expect(macroSplit(per100({}))).toEqual({ protein: 0, carbs: 0, fat: 0 })
  })
})

describe('carbohydrate convention', () => {
  it('leaves EU "available carbs" untouched', () => {
    const eu = per100({ kcal: 210, protein: 7.5, carbs: 35.6, fat: 3.2, fiber: 7.4 })
    expect(toAvailableCarbs(eu, 'available')).toEqual(eu)
  })

  it('subtracts fibre from US "total carbs"', () => {
    // USDA wholegrain bread: 43 g total carbs of which 7.4 g fibre.
    const us = per100({ kcal: 210, protein: 7.5, carbs: 43, fat: 3.2, fiber: 7.4 })
    expect(toAvailableCarbs(us, 'total').carbs).toBeCloseTo(35.6, 5)
  })

  it('refuses to guess when fibre is unknown', () => {
    const us = per100({ kcal: 210, protein: 7.5, carbs: 43, fat: 3.2 })
    // Leaving it alone is recoverable; inventing a fibre value is not.
    expect(toAvailableCarbs(us, 'total').carbs).toBe(43)
  })

  it('counts fibre at 2 kcal/g on top of available carbs', () => {
    // 7.5*4 + 35.6*4 + 7.4*2 + 3.2*9 = 30 + 142.4 + 14.8 + 28.8 = 216
    expect(kcalFromMacros({ protein: 7.5, carbs: 35.6, fat: 3.2, fiber: 7.4 })).toBeCloseTo(216, 1)
  })

  it('counts sugar alcohols at 2.4 kcal/g', () => {
    expect(kcalFromMacros({ protein: 0, carbs: 0, fat: 0, polyols: 10 })).toBeCloseTo(24, 5)
  })

  it('counts alcohol at 7 kcal/g', () => {
    // A 500 ml Pils: ~19 g ethanol + ~16 g carbs.
    expect(kcalFromMacros({ protein: 0, carbs: 16, fat: 0, alcohol: 19 })).toBeCloseTo(197, 0)
  })
})

describe('raw / cooked yield factors', () => {
  it('converts cooked chicken back to its raw mass', () => {
    // 150 g cooked at YF 0.72 came from ~208 g raw.
    expect(convertMass(150, 'cooked', 'raw', 0.72)).toBeCloseTo(208.3, 1)
  })

  it('converts raw pasta forward to its cooked mass', () => {
    expect(convertMass(85, 'raw', 'cooked', 2.3)).toBeCloseTo(195.5, 1)
  })

  it('is a no-op when the states already match', () => {
    expect(convertMass(150, 'raw', 'raw', 0.72)).toBe(150)
  })

  it('recovers the protein a naive lookup would lose', () => {
    // Raw chicken breast: 23 g protein / 100 g, YF 0.72.
    const raw = per100({ kcal: 106, protein: 23, carbs: 0, fat: 1.5 })
    const naive = scale(raw, 150) // treating 150 g cooked as 150 g raw
    const correct = scaleAcrossState(raw, 150, 'cooked', 'raw', 0.72)
    expect(naive.protein).toBeCloseTo(34.5, 1)
    expect(correct.protein).toBeCloseTo(47.9, 1)
    // The naive figure under-counts by ~28% — the error the research flagged.
    expect((correct.protein - naive.protein) / correct.protein).toBeGreaterThan(0.25)
  })

  it('leaves packaged goods alone — there is nothing to convert', () => {
    const skyr = per100({ kcal: 63, protein: 11, carbs: 4, fat: 0.2 })
    expect(scaleAcrossState(skyr, 150, 'cooked', 'as_sold').protein).toBeCloseTo(16.5, 2)
  })
})
