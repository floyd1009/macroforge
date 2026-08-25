/**
 * Days are *local calendar days*, not 24-hour windows. A meal at 01:00 belongs
 * to the night it was eaten from the user's point of view, so every date key in
 * the database is a local 'YYYY-MM-DD' string and never a UTC timestamp.
 */

export type DateKey = string // 'YYYY-MM-DD'

export function toKey(d: Date): DateKey {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): DateKey {
  return toKey(new Date())
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Whole days from `a` to `b`, positive when `b` is later. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Inclusive list of date keys from `start` to `end`. */
export function rangeKeys(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = []
  const n = daysBetween(start, end)
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}

export function isToday(key: DateKey): boolean {
  return key === todayKey()
}

export function isFuture(key: DateKey): boolean {
  return daysBetween(todayKey(), key) > 0
}

const DAY_LABELS: Record<'en' | 'de', string[]> = {
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

/** "Today" / "Yesterday" / weekday or date, whichever a human would say. */
export function humanDate(key: DateKey, locale: 'en' | 'de' = 'en'): string {
  const delta = daysBetween(todayKey(), key)
  if (delta === 0) return locale === 'de' ? 'Heute' : 'Today'
  if (delta === -1) return locale === 'de' ? 'Gestern' : 'Yesterday'
  if (delta === 1) return locale === 'de' ? 'Morgen' : 'Tomorrow'
  const d = fromKey(key)
  if (Math.abs(delta) < 7) return DAY_LABELS[locale][d.getDay()]
  return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function shortWeekday(key: DateKey, locale: 'en' | 'de' = 'en'): string {
  return fromKey(key).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'short',
  })
}

/** Monday-first week start for the given key. */
export function startOfWeek(key: DateKey, firstDay: 0 | 1 = 1): DateKey {
  const d = fromKey(key)
  const dow = d.getDay()
  const back = (dow - firstDay + 7) % 7
  return addDays(key, -back)
}
