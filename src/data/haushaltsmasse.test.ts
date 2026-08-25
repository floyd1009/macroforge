import { describe, expect, it } from 'vitest'
import { findMeasure, parseQuantity, resolveMeasure } from './haushaltsmasse'

/**
 * The research called German NLU the genuine untested gap. These are the
 * failure modes it listed, pinned as tests.
 */

describe('German quantity parsing', () => {
  it('reads a decimal comma as a decimal, not a thousands separator', () => {
    // The classic bug: parseFloat('1,5') === 1, and '1,5'.replace(',','') === 15.
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity('0,5')).toBe(0.5)
    expect(parseQuantity('78,4')).toBe(78.4)
  })

  it('still reads plain integers and decimal points', () => {
    expect(parseQuantity('2')).toBe(2)
    expect(parseQuantity('1.5')).toBe(1.5)
  })

  it.each([
    ['ein', 1],
    ['eine', 1],
    ['zwei', 2],
    ['zwölf', 12],
    ['halb', 0.5],
    ['halbes', 0.5],
    ['viertel', 0.25],
    ['dreiviertel', 0.75],
    ['anderthalb', 1.5],
    ['eineinhalb', 1.5],
  ])('reads the spoken quantity %s', (word, expected) => {
    expect(parseQuantity(word)).toBeCloseTo(expected, 5)
  })

  it('reads written fractions', () => {
    expect(parseQuantity('1/2')).toBe(0.5)
    expect(parseQuantity('3/4')).toBe(0.75)
  })

  it('sums multi-word quantities like "ein halbes"', () => {
    expect(parseQuantity('ein halbes')).toBeCloseTo(1.5, 5)
  })

  it('returns null rather than guessing on nonsense', () => {
    expect(parseQuantity('irgendwas')).toBeNull()
    expect(parseQuantity('')).toBeNull()
  })
})

describe('measure aliases', () => {
  it.each([
    ['Scheibe', 'scheibe'],
    ['Scheiben', 'scheibe'],
    ['EL', 'el'],
    ['Esslöffel', 'el'],
    ['TL', 'tl'],
    ['Teelöffel', 'tl'],
    ['Handvoll', 'handvoll'],
    ['Stück', 'stück'],
    ['Gläser', 'glas'],
  ])('resolves %s', (input, key) => {
    expect(findMeasure(input)?.key).toBe(key)
  })

  it('is case- and trailing-dot-insensitive, as dictation produces', () => {
    expect(findMeasure('el.')?.key).toBe('el')
    expect(findMeasure('  ESSLÖFFEL ')?.key).toBe('el')
  })
})

describe('resolving household measures to grams', () => {
  it('uses a food-specific mass over the generic one', () => {
    const bread = resolveMeasure('Scheibe', 2, 'Vollkornbrot')!
    const toast = resolveMeasure('Scheibe', 2, 'Toastbrot')!
    expect(bread.grams).toBe(90) // 2 x 45 g
    expect(toast.grams).toBe(56) // 2 x 28 g
    expect(bread.specific).toBe(true)
  })

  it('prefers the longest matching food keyword', () => {
    // "vollkornbrot" must beat the shorter "brot"; "magerquark" beat "quark".
    expect(resolveMeasure('Scheibe', 1, 'Vollkornbrot')!.grams).toBe(45)
    expect(resolveMeasure('Becher', 1, 'Magerquark')!.grams).toBe(250)
    expect(resolveMeasure('Becher', 1, 'Joghurt')!.grams).toBe(150)
  })

  it('falls back to a generic mass for an unknown food, and widens the spread', () => {
    const known = resolveMeasure('EL', 1, 'Olivenöl')!
    const unknown = resolveMeasure('EL', 1, 'Irgendwas')!
    expect(known.grams).toBe(12)
    expect(unknown.grams).toBe(15)
    expect(unknown.specific).toBe(false)
    expect(unknown.spread).toBeGreaterThan(known.spread)
  })

  it('handles the everyday cases correctly', () => {
    expect(resolveMeasure('EL', 1, 'Butter')!.grams).toBe(15)
    expect(resolveMeasure('TL', 2, 'Zucker')!.grams).toBe(8)
    expect(resolveMeasure('Stück', 3, 'Ei')!.grams).toBe(174)
    expect(resolveMeasure('Handvoll', 1, 'Mandeln')!.grams).toBe(25)
    expect(resolveMeasure('Glas', 1, 'Bier')!.grams).toBe(330)
    expect(resolveMeasure('Prise', 1, 'Salz')!.grams).toBeCloseTo(0.4, 2)
  })

  it('handles fractional quantities', () => {
    expect(resolveMeasure('Stück', 0.5, 'Pizza')!.grams).toBe(175)
    expect(resolveMeasure('Brötchen' /* not a measure */, 1)).toBeNull()
  })

  it('marks liquid measures as ml', () => {
    expect(resolveMeasure('Glas', 1, 'Wasser')!.unit).toBe('ml')
    expect(resolveMeasure('Scheibe', 1, 'Brot')!.unit).toBe('g')
  })

  it('always reports a spread, because a household measure is never exact', () => {
    for (const [m, f] of [['Scheibe', 'Brot'], ['EL', 'Öl'], ['Handvoll', 'Nüsse']] as const) {
      const r = resolveMeasure(m, 1, f)!
      expect(r.spread).toBeGreaterThan(0)
      expect(r.spread).toBeLessThan(1)
    }
  })
})

describe('regional synonyms', () => {
  it('knows Brötchen / Semmel / Schrippe are the same thing', () => {
    for (const word of ['Brötchen', 'Semmel', 'Schrippe']) {
      expect(resolveMeasure('Stück', 1, word)!.grams).toBe(55)
    }
  })
})
