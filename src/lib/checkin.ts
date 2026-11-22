import { addDays, daysBetween, fromKey, type DateKey } from './date'
import { computeTargets, type ExpenditureEstimate } from './nutrition'
import type { CheckIn, MacroTargets, Profile } from './types'

/**
 * Weekly check-in.
 *
 * Targets are frozen between check-ins and only move when the user accepts a
 * new set. Two properties matter:
 *
 *  - It is adherence-neutral. The new target is built from measured
 *    expenditure (logged intake and the weight trend), never from how close
 *    last week's intake was to last week's target. Missing a target is not
 *    "paid back" the following week, because the debt framing is what makes
 *    people stop logging.
 *  - Each week stands alone. A slow week does not steepen the next deficit;
 *    the rate comes from the goal, and the estimate absorbs the rest.
 */

/** Fewest logged days in the review window for the estimate to be updated. */
export const MIN_LOGGED_DAYS = 4
/** Fewest weigh-ins in the review window for the estimate to be updated. */
export const MIN_WEIGH_INS = 2

/**
 * First date on or after `from` that falls on `weekday` (0 = Sunday).
 */
export function nextWeekday(from: DateKey, weekday: number): DateKey {
  const dow = fromKey(from).getDay()
  return addDays(from, (weekday - dow + 7) % 7)
}

/**
 * The date the next check-in falls due.
 *
 * It is the first check-in weekday at least four days after the anchor (the
 * last check-in, or the day the profile was set up). The four-day gap stops a
 * check-in landing the day after onboarding, when there is nothing to review.
 */
export function nextCheckinDate(anchor: DateKey, checkinDay: number): DateKey {
  return nextWeekday(addDays(anchor, 4), checkinDay)
}

export function isCheckinDue(today: DateKey, anchor: DateKey, checkinDay: number): boolean {
  return daysBetween(nextCheckinDate(anchor, checkinDay), today) >= 0
}

/** The check-in whose targets were in force on `date`. */
export function checkinFor(checkins: CheckIn[], date: DateKey): CheckIn | undefined {
  let best: CheckIn | undefined
  for (const c of checkins) {
    if (c.date <= date && (!best || c.date > best.date)) best = c
  }
  return best
}

export interface CheckinReview {
  /** Review window, inclusive. */
  from: DateKey
  to: DateKey
  days: number
  daysLogged: number
  weighIns: number
  avgIntake?: number
  trendKg?: number
  trendDeltaKg?: number
  /** Observed weekly rate over the window, kg/week. */
  observedRate?: number
  /** False when the window is too thin to move the estimate. */
  enoughData: boolean
  tdee: number
  prevTdee?: number
  targets: MacroTargets
  prevTargets?: MacroTargets
  notes: string[]
}

/**
 * Build the review shown at check-in, and the targets it proposes.
 *
 * With too little data the expenditure estimate is carried forward unchanged:
 * a number derived from three logged days is noise, and moving a target on
 * noise is worse than holding it.
 */
export function reviewWeek(args: {
  today: DateKey
  profile: Profile
  previous?: CheckIn
  expenditure: ExpenditureEstimate
  currentKg: number
  bodyFatPct?: number
  intake: Array<{ date: DateKey; kcal: number }>
  trend: Array<{ date: DateKey; trendKg: number }>
  /** Targets in force until now, when there is no previous check-in row. */
  currentTargets: MacroTargets
}): CheckinReview {
  const { today, profile, previous, expenditure, currentKg, bodyFatPct, intake, trend, currentTargets } = args

  // Review the days since the last check-in, bounded so a long absence does
  // not average a month of stale data into "this week".
  const sinceLast = previous ? daysBetween(previous.date, today) : 7
  const days = Math.max(7, Math.min(14, sinceLast))
  const from = addDays(today, -days)
  const to = addDays(today, -1)

  const win = intake.filter((d) => d.date >= from && d.date <= to && d.kcal > 0)
  const weighs = trend.filter((t) => t.date >= from && t.date <= today)
  const avgIntake = win.length ? win.reduce((s, d) => s + d.kcal, 0) / win.length : undefined

  const last = trend[trend.length - 1]
  // Trend value at the start of the window: the latest reading on or before it.
  const startRow = [...trend].reverse().find((t) => t.date <= from) ?? weighs[0]
  const trendDeltaKg = last && startRow && last !== startRow ? last.trendKg - startRow.trendKg : undefined
  const span = last && startRow ? daysBetween(startRow.date, last.date) : 0
  const observedRate = trendDeltaKg != null && span > 0 ? (trendDeltaKg / span) * 7 : undefined

  const enoughData = win.length >= MIN_LOGGED_DAYS && weighs.length >= MIN_WEIGH_INS
  const prevTdee = previous?.tdee
  const tdee = enoughData || prevTdee == null ? expenditure.tdee : prevTdee

  const targets = computeTargets({ profile, tdee, currentKg, bodyFatPct })
  const prevTargets = previous?.targets ?? currentTargets

  const notes: string[] = []
  if (win.length < MIN_LOGGED_DAYS) {
    notes.push(
      `Only ${win.length} of ${days} days were logged. Expenditure is intake minus the change in stored energy, so without intake it cannot be measured.`,
    )
  }
  if (weighs.length < MIN_WEIGH_INS) {
    notes.push(
      `${weighs.length === 0 ? 'No weigh-ins' : 'One weigh-in'} this period. A trend needs at least two points; aim for three or more a week.`,
    )
  }
  if (!enoughData && prevTdee != null) {
    notes.push('The expenditure estimate is held at last week\'s value rather than updated from thin data.')
  }
  if (enoughData && observedRate != null && profile.rateKgPerWeek !== 0) {
    const goal = profile.rateKgPerWeek
    const ratio = observedRate / goal
    if (ratio > 1.5) {
      notes.push('Weight is moving faster than planned. The new targets bring the rate back toward the goal.')
    } else if (ratio < 0.5) {
      notes.push(
        'Weight is moving slower than planned. That raises nothing against you: the estimate of what you burn has been revised, and the targets follow it.',
      )
    }
  }
  if (profile.kcalFloor > 0 && targets.kcal <= profile.kcalFloor) {
    notes.push(`Calories are at the ${profile.kcalFloor} kcal floor, so the planned rate cannot be fully met.`)
  }

  return {
    from,
    to,
    days,
    daysLogged: win.length,
    weighIns: weighs.length,
    avgIntake,
    trendKg: last?.trendKg,
    trendDeltaKg,
    observedRate,
    enoughData,
    tdee,
    prevTdee,
    targets,
    prevTargets,
    notes,
  }
}

/** Freeze a review into the row that governs the coming week. */
export function toCheckIn(today: DateKey, review: CheckinReview, profile: Profile, dataWeight: number, accept: boolean): CheckIn {
  return {
    id: today,
    date: today,
    tdee: review.tdee,
    prevTdee: review.prevTdee,
    // Declining keeps last week's targets but still closes the week, so the
    // prompt does not reappear every time the app opens.
    targets: accept ? review.targets : (review.prevTargets ?? review.targets),
    prevTargets: review.prevTargets,
    trendKg: review.trendKg,
    trendDeltaKg: review.trendDeltaKg,
    avgIntake: review.avgIntake,
    daysLogged: review.daysLogged,
    weighIns: review.weighIns,
    rateKgPerWeek: profile.rateKgPerWeek,
    dataWeight,
    createdAt: Date.now(),
  }
}
