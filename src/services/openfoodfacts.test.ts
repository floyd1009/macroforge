import { describe, expect, it } from 'vitest'
import { detectRetailer, normalise, rankResults, simplifyQuery } from './openfoodfacts'
import fixtures from './__fixtures__/off-products.json'

/**
 * The fixtures are real payloads captured from the live Open Food Facts API,
 * so these tests pin the behaviour we actually depend on rather than a
 * hand-written idea of the response shape.
 */
describe('normalise — real products', () => {
  it('reads a well-populated product end to end', () => {
    const r = normalise((fixtures as any).nutella)!
    expect(r).not.toBeNull()
    expect(r.food.name).toMatch(/nutella/i)
    expect(r.food.per100.kcal).toBeCloseTo(539, 0)
    expect(r.food.per100.protein).toBeCloseTo(6.3, 1)
    expect(r.food.per100.fat).toBeGreaterThan(29)
    expect(r.food.barcode).toBe('3017624010701')
    expect(r.quality).toBeGreaterThan(0.8)
  })

  it('keeps German product names when present', () => {
    const r = normalise((fixtures as any).haferflocken)!
    expect(r.food.per100.kcal).toBeCloseTo(372, 0)
    expect(r.food.per100.protein).toBeCloseTo(13.5, 1)
    // Oats are one of the foods we also ship as a seed; the two should agree.
    expect(Math.abs(r.food.per100.kcal - 372)).toBeLessThan(15)
  })

  it('parses a high-protein German dairy product', () => {
    const r = normalise((fixtures as any).milbona_skyr)!
    expect(r.food.per100.protein).toBeGreaterThan(9)
    expect(r.food.per100.kcal).toBeLessThan(80)
    expect(r.food.retailer).toBe('Lidl') // Milbona is Lidl's dairy label
  })

  it('always offers a 100 g/ml portion', () => {
    for (const key of Object.keys(fixtures as object)) {
      const r = normalise((fixtures as any)[key])
      if (!r) continue
      expect(r.food.servings.some((s) => s.amount === 100)).toBe(true)
    }
  })

  it('produces an energy value consistent with its macros', () => {
    for (const key of ['nutella', 'milbona_skyr', 'haferflocken'] as const) {
      const r = normalise((fixtures as any)[key])!
      const atwater =
        r.food.per100.protein * 4 + r.food.per100.carbs * 4 + r.food.per100.fat * 9
      // Within 20% — fibre and rounding account for the rest.
      expect(Math.abs(r.food.per100.kcal - atwater) / atwater).toBeLessThan(0.2)
    }
  })
})

describe('normalise — bad data is rejected, not logged', () => {
  const base = (nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    code: '1234567890123',
    product_name: 'Testprodukt',
    nutriments,
    ...extra,
  })

  it('rejects a product with no nutrition data at all', () => {
    expect(normalise(base({}))).toBeNull()
  })

  it('rejects macros that cannot fit in 100 g', () => {
    expect(
      normalise(base({ 'energy-kcal_100g': 400, proteins_100g: 50, carbohydrates_100g: 60, fat_100g: 30 })),
    ).toBeNull()
  })

  it('rejects an energy density no food can reach', () => {
    expect(
      normalise(base({ 'energy-kcal_100g': 4000, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 })),
    ).toBeNull()
  })

  it('rejects negative values', () => {
    expect(
      normalise(base({ 'energy-kcal_100g': 100, proteins_100g: -5, carbohydrates_100g: 10, fat_100g: 2 })),
    ).toBeNull()
  })

  it('rejects a product with no name', () => {
    expect(
      normalise({ code: '1', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 } }),
    ).toBeNull()
  })

  it('converts kJ when kcal is missing, and says so', () => {
    const r = normalise(base({ energy_100g: 1500, proteins_100g: 5, carbohydrates_100g: 60, fat_100g: 5 }))!
    expect(r.food.per100.kcal).toBeCloseTo(358.5, 0)
    expect(r.warnings.join(' ')).toMatch(/kJ/)
  })

  it('derives missing calories from macros rather than logging zero', () => {
    const r = normalise(base({ proteins_100g: 20, carbohydrates_100g: 10, fat_100g: 5 }))!
    // 20*4 + 10*4 + 5*9 = 165
    expect(r.food.per100.kcal).toBeCloseTo(165, 0)
    expect(r.warnings.join(' ')).toMatch(/berechnet/)
  })

  it('flags saturated fat exceeding total fat', () => {
    const r = normalise(
      base({ 'energy-kcal_100g': 200, proteins_100g: 5, carbohydrates_100g: 20, fat_100g: 5, 'saturated-fat_100g': 12 }),
    )!
    expect(r.warnings.join(' ')).toMatch(/Gesättigte/)
    expect(r.food.verified).toBe(false)
  })

  it('converts US-style sodium to EU salt', () => {
    const r = normalise(base({ 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5, sodium_100g: 0.4 }))!
    expect(r.food.per100.salt).toBeCloseTo(1.0, 2)
  })

  it('reads a serving size out of a free-text field', () => {
    const r = normalise(
      base({ 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 }, { serving_size: '30 g' }),
    )!
    expect(r.food.servings[0].amount).toBe(30)
    expect(r.food.servings[0].isDefault).toBe(true)
  })

  it('ignores an absurd serving size', () => {
    const r = normalise(
      base({ 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 }, { serving_quantity: 99999 }),
    )!
    expect(r.food.servings.every((s) => s.amount <= 5000)).toBe(true)
  })

  it('accepts brands as an array, the way search-a-licious returns them', () => {
    const r = normalise(
      base({ 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 }, { brands: ['Milbona', 'Lidl'] }),
    )!
    expect(r.food.brand).toBe('Milbona')
    expect(r.food.retailer).toBe('Lidl')
  })
})

describe('German retailer detection', () => {
  it.each([
    ['ja!', 'REWE'],
    ['Gut&Günstig', 'EDEKA'],
    ['Milbona', 'Lidl'],
    ['K-Classic', 'Kaufland'],
    ['dmBio', 'dm'],
    ['Gut Bio', 'ALDI'],
  ])('maps %s to %s', (brand, chain) => {
    expect(detectRetailer(brand, '')).toBe(chain)
  })

  it('returns undefined for an unknown brand', () => {
    expect(detectRetailer('Barilla', '')).toBeUndefined()
  })
})

describe('query handling', () => {
  it('keeps the two most distinctive tokens of a private-label query', () => {
    // The exact multi-word query returns nothing on OFF; this is the retry.
    expect(simplifyQuery('Gut & Günstig Magerquark')).toBe('Magerquark Günstig')
  })

  it('leaves a single-word query alone', () => {
    expect(simplifyQuery('Skyr')).toBe('Skyr')
  })
})

describe('result ranking', () => {
  const mk = (name: string, quality: number, warnings: string[] = [], brand?: string) => ({
    food: {
      id: name, source: 'off' as const, name, nameDe: name, brand, basis: 'g' as const,
      state: 'as_sold' as const, carbBasis: 'available' as const,
      per100: { kcal: 100, protein: 5, carbs: 5, fat: 5 }, servings: [],
      verified: warnings.length === 0, createdAt: 0, updatedAt: 0, useCount: 0,
    },
    warnings,
    quality,
  })

  it('puts a query-matching complete product above a popular irrelevant one', () => {
    const ranked = rankResults([mk('Grandioso Pizza', 0.9), mk('Skyr Natural', 0.85)], 'skyr')
    expect(ranked[0].food.name).toBe('Skyr Natural')
  })

  it('demotes products carrying data-quality warnings', () => {
    const ranked = rankResults(
      [mk('Skyr A', 0.9, ['Kalorien aus kJ umgerechnet', 'Angabe prüfen']), mk('Skyr B', 0.85)],
      'skyr',
    )
    expect(ranked[0].food.name).toBe('Skyr B')
  })
})

describe('CORS-safe host selection', () => {
  it('never targets a country subdomain', async () => {
    // de.openfoodfacts.org does not send Access-Control-Allow-Origin, so any
    // request a browser makes to it fails. This is easy to reintroduce while
    // chasing better German results, hence the test.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./openfoodfacts.ts', import.meta.url), 'utf8'),
    )
    expect(src).not.toMatch(/https:\/\/(de|fr|es|it|uk)\.openfoodfacts\.org/)
    expect(src).toMatch(/https:\/\/world\.openfoodfacts\.org/)
  })
})
