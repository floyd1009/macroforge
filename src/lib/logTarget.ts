import { isFuture, todayKey, type DateKey } from './date'
import type { MealSlot } from './types'

/**
 * Which day (and optionally which meal) the next logged food belongs to.
 *
 * Every way of adding food — search, barcode, photo, dictation, quick add —
 * is its own screen, and they all need to agree on the day being edited.
 * Without this, opening yesterday and tapping "add" silently logged to today.
 *
 * Kept in sessionStorage rather than the URL so it survives the camera and
 * share-sheet round trips iOS makes during a photo log, and resets to today
 * with each fresh launch.
 */
const KEY = 'mf.logTarget'

interface Target {
  date: DateKey
  meal?: MealSlot
}

export function setLogTarget(date: DateKey, meal?: MealSlot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ date, meal } satisfies Target))
  } catch {
    // Private mode can refuse storage; the fallback below is "today".
  }
}

function read(): Target | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Target
    return /^\d{4}-\d{2}-\d{2}$/.test(t.date) && !isFuture(t.date) ? t : null
  } catch {
    return null
  }
}

export function logDate(): DateKey {
  return read()?.date ?? todayKey()
}

/** The meal the user tapped "add" on, or a guess from the time of day. */
export function logMeal(): MealSlot {
  const chosen = read()?.meal
  if (chosen) return chosen
  const h = new Date().getHours() + new Date().getMinutes() / 60
  if (h < 10.5) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}
