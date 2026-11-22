import { describe, expect, it } from 'vitest'
import { checkinFor, isCheckinDue, nextCheckinDate, nextWeekday, reviewWeek, toCheckIn } from './checkin'
import { addDays } from './date'
import type { ExpenditureEstimate } from './nutrition'
import type { CheckIn, Profile } from './types'

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
  macroStyle: 'balanced',
  checkinDay: 1,
  kcalFloor: 1200,
  highDays: [],
  highDayBoost: 0.15,
  weighsFood: 'cooked',
  units: 'metric',
  locale: 'en',
  createdAt: 0,
  updatedAt: 0,
}

const est = (tdee: number): ExpenditureEstimate => ({
  tdee,
  dataWeight: 0.8,
  confidence: 'high',
  daysOfData: 20,
  meanIntake: 2400,
  slopeKgPerWeek: -0.5,
  note: '',
})

const checkin = (date: string, tdee: number): CheckIn => ({
  id: date,
  date,
  tdee,
  targets: { kcal: tdee - 550, protein: 160, carbs: 250, fat: 80 },
  daysLogged: 7,
  weighIns: 7,
  rateKgPerWeek: -0.5,
  dataWeight: 0.8,
  createdAt: 0,
})

// 2026-11-02 is a Monday.
const MON = '2026-11-02'

describe('check-in schedule', () => {
  it('finds the next occurrence of a weekday, including the same day', () => {
    expect(nextWeekday(MON, 1)).toBe(MON)
    expect(nextWeekday(MON, 3)).toBe('2026-11-04')
    expect(nextWeekday(MON, 0)).toBe('2026-11-08')
  })

  it('falls a week after a check-in made on the check-in day', () => {
    expect(nextCheckinDate(MON, 1)).toBe('2026-11-09')
  })

  it('does not land the day after setup', () => {
    // Set up on Sunday, check-in day Monday: the first one waits a week.
    expect(nextCheckinDate('2026-11-01', 1)).toBe('2026-11-09')
  })

  it('is due on and after the date, not before', () => {
    expect(isCheckinDue('2026-11-08', MON, 1)).toBe(false)
    expect(isCheckinDue('2026-11-09', MON, 1)).toBe(true)
    expect(isCheckinDue('2026-11-20', MON, 1)).toBe(true)
  })
})

describe('targets in force', () => {
  const list = [checkin('2026-11-02', 2900), checkin('2026-11-09', 2800)]

  it('uses the latest check-in on or before the day', () => {
    expect(checkinFor(list, '2026-11-08')?.tdee).toBe(2900)
    expect(checkinFor(list, '2026-11-09')?.tdee).toBe(2800)
    expect(checkinFor(list, '2026-12-01')?.tdee).toBe(2800)
  })

  it('has none before the first check-in', () => {
    expect(checkinFor(list, '2026-11-01')).toBeUndefined()
  })
})

describe('weekly review', () => {
  const today = '2026-11-09'
  const days = (n: number, kcal: number) =>
    Array.from({ length: n }, (_, i) => ({ date: addDays(today, -1 - i), kcal }))
  const trend = (n: number, startKg: number, perDay: number) =>
    Array.from({ length: n }, (_, i) => ({
      date: addDays(today, -(n - 1) + i),
      trendKg: startKg + perDay * i,
    }))

  it('derives targets from expenditure, not from last week\'s adherence', () => {
    const base = {
      today,
      profile,
      previous: checkin(MON, 2900),
      expenditure: est(2800),
      currentKg: 80,
      trend: trend(8, 80.5, -0.07),
      currentTargets: { kcal: 2350, protein: 160, carbs: 250, fat: 80 },
    }
    // Same expenditure, same weight trend: 500 kcal over target every day or
    // 500 under must produce the identical new target.
    const over = reviewWeek({ ...base, intake: days(7, 2850) })
    const under = reviewWeek({ ...base, intake: days(7, 1850) })
    expect(over.targets).toEqual(under.targets)
    expect(over.targets.kcal).toBe(2250) // 2800 - 550
  })

  it('holds the estimate when too few days were logged', () => {
    const r = reviewWeek({
      today,
      profile,
      previous: checkin(MON, 2900),
      expenditure: est(2500),
      currentKg: 80,
      intake: days(2, 2000),
      trend: trend(8, 80.5, -0.07),
      currentTargets: { kcal: 2350, protein: 160, carbs: 250, fat: 80 },
    })
    expect(r.enoughData).toBe(false)
    expect(r.tdee).toBe(2900)
    expect(r.notes.join(' ')).toMatch(/Only 2 of 7 days/)
  })

  it('reports the trend change over the window', () => {
    const r = reviewWeek({
      today,
      profile,
      previous: checkin(MON, 2900),
      expenditure: est(2800),
      currentKg: 80,
      intake: days(7, 2300),
      trend: trend(8, 80.49, -0.07),
      currentTargets: { kcal: 2350, protein: 160, carbs: 250, fat: 80 },
    })
    expect(r.trendDeltaKg).toBeCloseTo(-0.49, 5)
    expect(r.observedRate).toBeCloseTo(-0.49, 5)
    expect(r.daysLogged).toBe(7)
  })

  it('keeps the old targets when the check-in is declined', () => {
    const r = reviewWeek({
      today,
      profile,
      previous: checkin(MON, 2900),
      expenditure: est(2700),
      currentKg: 80,
      intake: days(7, 2300),
      trend: trend(8, 80.5, -0.07),
      currentTargets: { kcal: 2350, protein: 160, carbs: 250, fat: 80 },
    })
    const declined = toCheckIn(today, r, profile, 0.8, false)
    const accepted = toCheckIn(today, r, profile, 0.8, true)
    expect(declined.targets.kcal).toBe(2350)
    expect(accepted.targets.kcal).toBe(2150)
    // Either way the week is closed.
    expect(declined.date).toBe(today)
  })
})
