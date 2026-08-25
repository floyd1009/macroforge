import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { buildDayPlan, type DayPlan } from './repo'
import type { DateKey } from './date'

/**
 * Recompute the day whenever anything it depends on changes.
 *
 * The dependency list is broad on purpose: targets are derived from weight
 * history and past intake, so a back-dated weigh-in legitimately changes
 * today's numbers.
 */
export function useDayPlan(date: DateKey): DayPlan | undefined {
  return useLiveQuery(async () => {
    // Touch the tables so Dexie subscribes to them.
    await Promise.all([
      db.entries.where('date').equals(date).count(),
      db.weights.count(),
      db.profile.get('me'),
      db.settings.get('settings'),
    ])
    return buildDayPlan(date)
  }, [date])
}
