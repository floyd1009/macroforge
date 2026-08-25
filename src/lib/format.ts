/** Display formatting. German number conventions by default (comma decimal). */

export type Locale = 'en' | 'de'

/**
 * The UI is English, but the app is used in Germany, so numbers are formatted
 * en-GB (period decimal, comma thousands) while *parsing* stays tolerant of
 * the German comma decimal a German keyboard produces. See `parseNumber`.
 */
const intl = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-GB')

export function num(value: number, digits = 0, locale: Locale = 'en'): string {
  if (!Number.isFinite(value)) return '–'
  return value.toLocaleString(intl(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Calories are never shown with decimals — the precision would be a lie. */
export function kcal(value: number, locale: Locale = 'en'): string {
  return num(Math.round(value), 0, locale)
}

/** Grams: one decimal below 10 g, whole numbers above, where rounding is noise. */
export function grams(value: number, locale: Locale = 'en'): string {
  const abs = Math.abs(value)
  if (abs > 0 && abs < 10) return num(value, 1, locale)
  return num(Math.round(value), 0, locale)
}

export function kg(value: number, locale: Locale = 'en'): string {
  return num(value, 1, locale)
}

export function signed(value: number, locale: Locale = 'en', digits = 0): string {
  const s = num(Math.abs(value), digits, locale)
  return value < 0 ? `−${s}` : `+${s}`
}

export function pct(fraction: number, locale: Locale = 'en'): string {
  return `${num(fraction * 100, 0, locale)} %`
}

/** Compact amount + unit for a log row, e.g. "85 g" or "1 Portion". */
export function amountLabel(
  amount: number,
  unit: 'g' | 'ml' | 'serving',
  servingLabel: string | undefined,
  locale: Locale = 'en',
): string {
  if (unit === 'serving') {
    const base = servingLabel ?? (locale === 'de' ? 'Portion' : 'serving')
    return amount === 1 ? base : `${num(amount, amount % 1 ? 1 : 0, locale)} × ${base}`
  }
  return `${num(Math.round(amount), 0, locale)} ${unit}`
}

/**
 * Parse a number typed on any keyboard.
 *
 * A German keyboard and German dictation both produce "78,4"; an English one
 * produces "78.4". `parseFloat` silently truncates the first to 78, so every
 * numeric input in the app goes through here instead.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  // If both separators appear, the last one is the decimal point.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalised: string
  if (lastComma > -1 && lastDot > -1) {
    normalised = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    // A lone comma is a decimal comma unless it groups thousands (1,234).
    normalised = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else {
    normalised = s
  }
  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Bytes as a human string, for the storage readout in Settings. */
export function bytes(n: number, locale: Locale = 'en'): string {
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

/**
 * The name to show for a food.
 *
 * Seed foods carry an English `name` and a German `nameDe`. Open Food Facts
 * products carry whatever the packet says, which for a German product is
 * German — and that is correct, because that is what is printed on the thing
 * in the user's hand. So prefer `name` and fall back to the German one.
 */
export function displayName(food: { name: string; nameDe?: string }): string {
  return food.name || food.nameDe || ''
}

/** The other-language name, shown as a subtitle when it adds information. */
export function altName(food: { name: string; nameDe?: string }): string | undefined {
  if (!food.nameDe || food.nameDe === food.name) return undefined
  return food.nameDe
}
