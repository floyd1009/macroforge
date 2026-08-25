/** Display formatting. German number conventions by default (comma decimal). */

export type Locale = 'de' | 'en'

const intl = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-GB')

export function num(value: number, digits = 0, locale: Locale = 'de'): string {
  if (!Number.isFinite(value)) return '–'
  return value.toLocaleString(intl(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Calories are never shown with decimals — the precision would be a lie. */
export function kcal(value: number, locale: Locale = 'de'): string {
  return num(Math.round(value), 0, locale)
}

/** Grams: one decimal below 10 g, whole numbers above, where rounding is noise. */
export function grams(value: number, locale: Locale = 'de'): string {
  const abs = Math.abs(value)
  if (abs > 0 && abs < 10) return num(value, 1, locale)
  return num(Math.round(value), 0, locale)
}

export function kg(value: number, locale: Locale = 'de'): string {
  return num(value, 1, locale)
}

export function signed(value: number, locale: Locale = 'de', digits = 0): string {
  const s = num(Math.abs(value), digits, locale)
  return value < 0 ? `−${s}` : `+${s}`
}

export function pct(fraction: number, locale: Locale = 'de'): string {
  return `${num(fraction * 100, 0, locale)} %`
}

/** Compact amount + unit for a log row, e.g. "85 g" or "1 Portion". */
export function amountLabel(
  amount: number,
  unit: 'g' | 'ml' | 'serving',
  servingLabel: string | undefined,
  locale: Locale = 'de',
): string {
  if (unit === 'serving') {
    const base = servingLabel ?? (locale === 'de' ? 'Portion' : 'serving')
    return amount === 1 ? base : `${num(amount, amount % 1 ? 1 : 0, locale)} × ${base}`
  }
  return `${num(Math.round(amount), 0, locale)} ${unit}`
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Bytes as a human string, for the storage readout in Settings. */
export function bytes(n: number, locale: Locale = 'de'): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${num(v, v < 10 && i > 0 ? 1 : 0, locale)} ${units[i]}`
}

export function duration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
