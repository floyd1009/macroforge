import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The reference apps this design copies both fail WCAG AA on their primary
 * button and on red text over a dark card. These tests exist so we cannot
 * regress into the same failure while editing the palette.
 */

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --color-${name} not found in index.css`)
  return m[1]
}

function luminance(hex: string): number {
  const v = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const SURFACES = ['bg', 'surface', 'surface-2', 'surface-3'] as const

describe('palette contrast (WCAG 2.1 AA)', () => {
  it('white on the primary red button reaches 4.5:1', () => {
    expect(contrast('#ffffff', token('brand'))).toBeGreaterThanOrEqual(4.5)
  })

  it('white on the hover red still reaches 4.5:1', () => {
    expect(contrast('#ffffff', token('brand-bright'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['txt', 'txt-2', 'txt-3'])('%s is readable on every surface', (name) => {
    for (const s of SURFACES) {
      expect(contrast(token(name), token(s)), `${name} on ${s}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['protein', 'carb', 'fat', 'kcal', 'ok', 'warn', 'bad', 'brand-text'])(
    '%s is readable on every surface',
    (name) => {
      for (const s of SURFACES) {
        expect(contrast(token(name), token(s)), `${name} on ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('keeps brand red out of the macro palette so it never doubles as a status', () => {
    const brand = token('brand').toLowerCase()
    for (const m of ['protein', 'carb', 'fat', 'fiber']) {
      expect(token(m).toLowerCase()).not.toBe(brand)
    }
  })

  it('separates macro hues enough to be told apart', () => {
    // Not a colour-blindness test, but catches two macros drifting together.
    const hues = ['protein', 'carb', 'fat'].map(token)
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++)
        expect(Math.abs(luminance(hues[i]) - luminance(hues[j])), `${hues[i]} vs ${hues[j]}`).toBeGreaterThan(0.02)
  })
})
