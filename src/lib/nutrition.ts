import { ENERGY_FACTORS, type CarbBasis, type Nutrients, type MacroTargets, type Profile } from './types'
import type { DateKey } from './date'
import { daysBetween } from './date'

/* ------------------------------------------------------------------ *
 * Nutrient arithmetic
 * ------------------------------------------------------------------ */

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

const OPTIONAL_KEYS = ['fiber', 'sugar', 'satFat', 'salt', 'alcohol'] as const

/** Scale a per-100 panel to an absolute amount in g/ml. */
export function scale(per100: Nutrients, amount: number): Nutrients {
  const f = amount / 100
  const out: Nutrients = {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
  }
  for (const k of OPTIONAL_KEYS) {
    const v = per100[k]
    if (v != null) out[k] = v * f
  }
  return out
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  }
  for (const k of OPTIONAL_KEYS) {
    if (a[k] != null || b[k] != null) out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}

export function sum(items: Nutrients[]): Nutrients {
  return items.reduce(add, { ...ZERO })
}

export function multiply(n: Nutrients, f: number): Nutrients {
  return scale(n, f * 100)
}

/* ------------------------------------------------------------------ *
 * Energy reconciliation
 *
 * A label's stated kcal and the Atwater sum of its macros frequently
 * disagree. Small gaps are rounding on the package; large gaps mean the
 * panel is wrong or incomplete, and silently trusting either number is how
 * a tracker ends up 300 kcal off by dinner.
 * ------------------------------------------------------------------ */

/**
 * Energy from composition, using the EU LMIV Annex XIV factors.
 *
 * `carbs` is expected to be *available* carbohydrate (the EU convention), so
 * fibre is added separately at 2 kcal/g rather than being subtracted out.
 * Passing US-style total carbs here double-counts fibre — normalise first with
 * `toAvailableCarbs()`.
 */
export function kcalFromMacros(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'> & Partial<Nutrients>): number {
  return (
    n.protein * ENERGY_FACTORS.protein +
    n.carbs * ENERGY_FACTORS.carbs +
    (n.fiber ?? 0) * ENERGY_FACTORS.fiber +
    n.fat * ENERGY_FACTORS.fat +
    (n.alcohol ?? 0) * ENERGY_FACTORS.alcohol +
    (n.polyols ?? 0) * ENERGY_FACTORS.polyol
  )
}

/* ------------------------------------------------------------------ *
 * Carbohydrate convention
 *
 * EU/BLS state *available* carbohydrate with fibre listed separately.
 * USDA states *total* carbohydrate "by difference", fibre included. Storing
 * both in one column is a silent per-food error equal to the fibre content,
 * so every source is normalised to the EU convention on the way in.
 * ------------------------------------------------------------------ */

export function toAvailableCarbs(n: Nutrients, from: CarbBasis): Nutrients {
  if (from === 'available') return n
  // Total -> available. Without a fibre figure we cannot correct, and guessing
  // would be worse than leaving it: return unchanged and let the caller warn.
  if (n.fiber == null) return n
  return { ...n, carbs: Math.max(0, n.carbs - n.fiber) }
}

/* ------------------------------------------------------------------ *
 * Raw <-> cooked
 * ------------------------------------------------------------------ */

/**
 * Convert a mass between raw and cooked state using a yield factor
 * (cooked mass ÷ raw mass).
 *
 * This is the correction almost every tracker misses. Chicken breast has
 * YF ≈ 0.72, so 150 g of cooked breast came from ~208 g raw and carries ~39 g
 * of protein, not the ~35 g a naive lookup reports. Dry pasta and rice run the
 * other way (YF ≈ 2.3–2.6), where ignoring it overstates a portion 2.5×.
 */
export function convertMass(
  amount: number,
  from: 'raw' | 'cooked',
  to: 'raw' | 'cooked',
  yieldFactor: number,
): number {
  if (from === to) return amount
  if (yieldFactor <= 0) return amount
  return to === 'cooked' ? amount * yieldFactor : amount / yieldFactor
}

/**
 * Nutrients for a mass given in a different state than the food is stored in.
 * `per100` always describes the food's own `state`.
 */
export function scaleAcrossState(
  per100: Nutrients,
  amount: number,
  amountState: 'raw' | 'cooked',
  foodState: 'raw' | 'cooked' | 'as_sold',
  yieldFactor?: number,
): Nutrients {
  if (foodState === 'as_sold' || !yieldFactor || amountState === foodState) {
    return scale(per100, amount)
  }
  return scale(per100, convertMass(amount, amountState, foodState, yieldFactor))
}

export interface EnergyCheck {
  stated: number
  derived: number
  /** Signed relative difference, (stated - derived) / derived. */
  deviation: number
  status: 'ok' | 'minor' | 'suspect'
  message?: string
}

export function checkEnergy(n: Nutrients): EnergyCheck {
  const derived = kcalFromMacros(n)
  const stated = n.kcal
  if (derived <= 0) {
    return {
      stated,
      derived,
      deviation: 0,
      status: stated > 0 ? 'suspect' : 'ok',
      message: stated > 0 ? 'calories stated with no macros' : undefined,
    }
  }
  const deviation = (stated - derived) / derived
  const abs = Math.abs(deviation)
  // Rounding on a 100 g panel is worth a few percent; 10%+ is a data problem.
  if (abs <= 0.05) return { stated, derived, deviation, status: 'ok' }
  if (abs <= 0.12)
    return { stated, derived, deviation, status: 'minor', message: 'small deviation from the stated panel' }
  return {
    stated,
    derived,
    deviation,
    status: 'suspect',
    message: `stated kcal is ${Math.round(abs * 100)}% away from the macros`,
  }
}

/**
 * Kilojoules are the primary unit on EU labels; kcal is the secondary one and
 * is sometimes the only one a data source captured.
 */
export const KJ_PER_KCAL = 4.184
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL
export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL

/** EU labels state salt; US data states sodium. salt = sodium * 2.5. */
export const sodiumToSalt = (mgSodium: number) => (mgSodium / 1000) * 2.5
export const saltToSodium = (gSalt: number) => (gSalt / 2.5) * 1000

/* ------------------------------------------------------------------ *
 * Body weight trend
 *
 * Daily scale weight is dominated by water, glycogen and gut contents; the
 * signal we care about moves at ~0.1 kg/week. An exponentially weighted
 * moving average is the standard fix (Hacker's Diet / trend weight).
 * ------------------------------------------------------------------ */

export interface WeighIn {
  date: DateKey
  kg: number
}

/**
 * Compute the smoothed trend for a chronological series.
 *
 * Gaps matter: after a week away, one reading should pull the trend harder
 * than a single day would, so alpha is compounded across the elapsed days
 * (`1 - (1-alpha)^gap`) instead of being applied once per data point.
 */
export function trendSeries(weighIns: WeighIn[], alpha = 0.1): Array<WeighIn & { trendKg: number }> {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
  const out: Array<WeighIn & { trendKg: number }> = []
  let trend: number | null = null
  let prevDate: DateKey | null = null

  for (const w of sorted) {
    if (trend === null) {
      trend = w.kg
    } else {
      const gap = Math.max(1, daysBetween(prevDate!, w.date))
      const aEff = 1 - Math.pow(1 - alpha, gap)
      trend = trend + aEff * (w.kg - trend)
    }
    prevDate = w.date
    out.push({ ...w, trendKg: trend })
  }
  return out
}

/**
 * Least-squares slope of trend weight in kg/day over the trailing window.
 * Regression beats endpoint-minus-endpoint because it uses every point and
 * is not hostage to a single bad reading at either end.
 */
export function weightSlopeKgPerDay(
  trend: Array<{ date: DateKey; trendKg: number }>,
  windowDays = 21,
): { slope: number; n: number; r2: number } | null {
  if (trend.length < 2) return null
  const last = trend[trend.length - 1].date
  const pts = trend
    .filter((t) => daysBetween(t.date, last) <= windowDays)
    .map((t) => ({ x: -daysBetween(t.date, last), y: t.trendKg }))
  if (pts.length < 2) return null

  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  if (sxx === 0) return { slope: 0, n, r2: 0 }
  const slope = sxy / sxx
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { slope, n, r2 }
}

/* ------------------------------------------------------------------ *
 * Expenditure
 * ------------------------------------------------------------------ */

/** Mifflin–St Jeor: the best-validated predictive BMR equation. */
export function bmrMifflin(sex: 'male' | 'female', kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

/** Katch–McArdle — more accurate than Mifflin when body-fat % is known. */
export function bmrKatchMcArdle(kg: number, bodyFatPct: number): number {
  const lbm = kg * (1 - bodyFatPct / 100)
  return 370 + 21.6 * lbm
}

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
} as const

export function ageFrom(birthDate?: string): number {
  if (!birthDate) return 30
  const b = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return Math.max(10, Math.min(100, age))
}

/** Formula-only TDEE. Used on day 1, before there is any real data. */
export function predictedTdee(profile: Profile, kg: number, bodyFatPct?: number): number {
  const bmr =
    bodyFatPct != null
      ? bmrKatchMcArdle(kg, bodyFatPct)
      : bmrMifflin(profile.sex, kg, profile.heightCm, ageFrom(profile.birthDate))
  return bmr * ACTIVITY_FACTORS[profile.activity]
}

/** Energy density of body-mass change. 1 kg ≈ 7700 kcal is the standard figure. */
export const KCAL_PER_KG = 7700

export interface ExpenditureEstimate {
  /** kcal/day. */
  tdee: number
  /** How much of the estimate comes from measured data vs. the formula, 0–1. */
  dataWeight: number
  confidence: 'low' | 'medium' | 'high'
  daysOfData: number
  meanIntake: number
  slopeKgPerWeek: number
  note: string
}

/**
 * Adaptive expenditure from energy balance:
 *
 *     TDEE = mean intake − (rate of mass change × 7700 kcal/kg)
 *
 * This is what makes an adaptive tracker better than a calculator: it measures
 * *your* expenditure instead of predicting an average person's. It needs both
 * complete intake logging and regular weigh-ins, so the estimate is blended
 * toward the formula prediction until enough data exists, and every caller is
 * told how much of the number is measured.
 */
export function adaptiveExpenditure(args: {
  profile: Profile
  /** Trailing daily intake, most recent last. Days with no log must be omitted. */
  intake: Array<{ date: DateKey; kcal: number }>
  trend: Array<{ date: DateKey; trendKg: number }>
  currentKg: number
  bodyFatPct?: number
  windowDays?: number
}): ExpenditureEstimate {
  const { profile, intake, trend, currentKg, bodyFatPct, windowDays = 21 } = args
  const predicted = predictedTdee(profile, currentKg, bodyFatPct)

  const fallback = (note: string, days = 0): ExpenditureEstimate => ({
    tdee: predicted,
    dataWeight: 0,
    confidence: 'low',
    daysOfData: days,
    meanIntake: 0,
    slopeKgPerWeek: 0,
    note,
  })

  if (trend.length < 2) return fallback('Too few weigh-ins — estimated from formula')

  const lastDate = trend[trend.length - 1].date
  const recentIntake = intake.filter((i) => daysBetween(i.date, lastDate) <= windowDays && i.kcal > 0)
  if (recentIntake.length < 5)
    return fallback('Too few logged days — estimated from formula', recentIntake.length)

  const slopeFit = weightSlopeKgPerDay(trend, windowDays)
  if (!slopeFit) return fallback('Weight trend not yet measurable', recentIntake.length)

  const meanIntake = recentIntake.reduce((s, i) => s + i.kcal, 0) / recentIntake.length
  const measured = meanIntake - slopeFit.slope * KCAL_PER_KG

  // Ramp confidence in over three weeks of logging *and* weighing. Both matter:
  // a perfect weight series with three logged days tells us nothing.
  const intakeCoverage = Math.min(1, recentIntake.length / windowDays)
  const weightCoverage = Math.min(1, slopeFit.n / (windowDays / 2))
  const dataWeight = Math.min(0.9, intakeCoverage * weightCoverage)

  // Guard against absurd outputs from a short window with a water-weight swing.
  const blended = predicted * (1 - dataWeight) + measured * dataWeight
  const clamped = Math.max(predicted * 0.6, Math.min(predicted * 1.6, blended))

  const confidence: 'low' | 'medium' | 'high' =
    dataWeight >= 0.7 ? 'high' : dataWeight >= 0.4 ? 'medium' : 'low'

  return {
    tdee: clamped,
    dataWeight,
    confidence,
    daysOfData: recentIntake.length,
    meanIntake,
    slopeKgPerWeek: slopeFit.slope * 7,
    note:
      confidence === 'high'
        ? 'Measured from your own energy balance'
        : `${Math.round(dataWeight * 100)}% measured, the rest from a formula`,
  }
}

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

/**
 * Lowest fat intake any style will prescribe, g per kg body mass.
 *
 * Origin: sports-nutrition practice guidance (Helms et al. 2014 give 15–30 %
 * of energy for physique athletes), not a measured physiological threshold —
 * the strict requirement is only a few grams of essential fatty acids. It
 * breaks down at very high body-fat levels, where per-kg scaling overshoots.
 */
export const FAT_FLOOR_PER_KG = 0.6

/** Carbohydrate ceiling for the ketogenic style, g/day (conventional 20–50 g). */
export const KETO_CARBS_G = 30

/**
 * Calories for the goal: expenditure plus the daily energy the target rate of
 * weight change implies, bounded below.
 *
 * Two floors apply. Relative: never below 65 % of expenditure, because deeper
 * deficits cost lean mass and adherence faster than they add fat loss.
 * Absolute: `kcalFloor`, a convention (1,200 kcal is the common figure) that
 * exists because very low intakes make micronutrient adequacy hard — it is a
 * safety margin, not a law, and the user can turn it off.
 */
export function goalCalories(tdee: number, rateKgPerWeek: number, kcalFloor = 0): number {
  const dailyDelta = (rateKgPerWeek * KCAL_PER_KG) / 7
  return Math.max(kcalFloor, tdee * 0.65, tdee + dailyDelta)
}

/**
 * Protein first, then the remaining calories divided by the chosen style.
 *
 * Protein comes first because it is the only macro with a requirement that
 * scales with the goal; how the rest splits between carbohydrate and fat
 * makes no measurable difference to weight change at equal calories and
 * protein, so it is exposed as a preference rather than optimised.
 */
export function computeTargets(args: {
  profile: Profile
  tdee: number
  currentKg: number
  bodyFatPct?: number
}): MacroTargets {
  const { profile, tdee, currentKg, bodyFatPct } = args
  if (profile.manualTargets) return profile.manualTargets

  const kcal = goalCalories(tdee, profile.rateKgPerWeek, profile.kcalFloor ?? 0)

  // Lean mass is the better basis for protein when body fat is known.
  const proteinBasisKg = bodyFatPct != null ? currentKg * (1 - bodyFatPct / 100) * 1.15 : currentKg
  let protein = Math.round(proteinBasisKg * profile.proteinPerKg)
  // On a very low budget protein alone can exceed it; cap it so the floor for
  // fat still fits and the macros cannot sum past the calorie target.
  const fatFloor = Math.round(currentKg * FAT_FLOOR_PER_KG)
  const maxProtein = Math.floor((kcal - fatFloor * ENERGY_FACTORS.fat) / ENERGY_FACTORS.protein)
  protein = Math.max(0, Math.min(protein, maxProtein))

  const rest = Math.max(0, kcal - protein * ENERGY_FACTORS.protein)
  let fat: number
  switch (profile.macroStyle ?? 'balanced') {
    case 'low_fat':
      // The floor, or a fifth of total energy if that is higher.
      fat = Math.max(fatFloor, (kcal * 0.2) / ENERGY_FACTORS.fat)
      break
    case 'low_carb':
      // Carbohydrate held to a fifth of energy and never above 150 g.
      fat = (rest - Math.min(150, (kcal * 0.2) / ENERGY_FACTORS.carbs) * ENERGY_FACTORS.carbs) / ENERGY_FACTORS.fat
      break
    case 'keto':
      fat = (rest - KETO_CARBS_G * ENERGY_FACTORS.carbs) / ENERGY_FACTORS.fat
      break
    default:
      // Balanced: the non-protein calories split evenly by energy.
      fat = (rest * 0.5) / ENERGY_FACTORS.fat
  }
  fat = Math.round(Math.max(fatFloor, Math.min(fat, rest / ENERGY_FACTORS.fat)))
  const carbs = Math.max(0, Math.round((rest - fat * ENERGY_FACTORS.fat) / ENERGY_FACTORS.carbs))

  // 14 g fibre per 1000 kcal — the DGE / IOM recommendation.
  const fiber = Math.round((kcal / 1000) * 14)

  return { kcal: Math.round(kcal), protein, carbs, fat, fiber }
}

/**
 * Calorie shifting: move energy toward chosen weekdays without changing the
 * weekly total.
 *
 * With h high days each at mean × (1 + b), the other 7 − h days must sit at
 * mean × (1 − b·h / (7 − h)) for the week to sum to 7 × mean. Protein stays
 * fixed — it is a daily requirement — and the shift is taken out of, or added
 * to, carbohydrate and fat in proportion to their energy.
 */
export function shiftForWeekday(
  base: MacroTargets,
  weekday: number,
  highDays: number[] = [],
  boost = 0,
): MacroTargets {
  const h = new Set(highDays.filter((d) => d >= 0 && d <= 6)).size
  if (h === 0 || h === 7 || boost <= 0) return base
  const factor = highDays.includes(weekday) ? 1 + boost : 1 - (boost * h) / (7 - h)
  const kcal = base.kcal * factor
  const proteinKcal = base.protein * ENERGY_FACTORS.protein
  const baseRest = base.kcal - proteinKcal
  if (baseRest <= 0) return base
  const k = Math.max(0, kcal - proteinKcal) / baseRest
  return {
    kcal: Math.round(kcal),
    protein: base.protein,
    carbs: Math.round(base.carbs * k),
    fat: Math.round(base.fat * k),
    fiber: Math.round((kcal / 1000) * 14),
  }
}

/**
 * Goal rates offered in the UI, as a fraction of body mass per week.
 *
 * Expressed relative to body mass because the same absolute rate is a very
 * different deficit for a 60 kg and a 120 kg person. The loss range is the
 * 0.25–1 %/week band used across the sports-nutrition literature (e.g. Garthe
 * et al. 2011 compared 0.7 % and 1.4 % and found the slower rate kept more
 * lean mass). The gain range is narrower because muscle gain is rate-limited
 * and a faster surplus mostly adds fat.
 */
export const RATE_PRESETS = {
  lose: [
    { pct: 0.0025, label: 'Slow' },
    { pct: 0.005, label: 'Standard' },
    { pct: 0.0075, label: 'Fast' },
    { pct: 0.01, label: 'Aggressive' },
  ],
  gain: [
    { pct: 0.001, label: 'Lean' },
    { pct: 0.0025, label: 'Standard' },
    { pct: 0.005, label: 'Fast' },
  ],
} as const

/** Days until the goal weight at the planned rate, or null when not applicable. */
export function daysToGoal(currentKg: number, goalKg: number | undefined, rateKgPerWeek: number): number | null {
  if (goalKg == null || rateKgPerWeek === 0) return null
  const delta = goalKg - currentKg
  // Already past the goal, or the rate points away from it.
  if (delta === 0 || Math.sign(delta) !== Math.sign(rateKgPerWeek)) return null
  return Math.ceil((delta / rateKgPerWeek) * 7)
}

/**
 * Expenditure as it would have been estimated on each day of a range, so the
 * chart shows how the estimate moved rather than only where it ended up.
 */
export function expenditureSeries(args: {
  profile: Profile
  intake: Array<{ date: DateKey; kcal: number }>
  trend: Array<{ date: DateKey; trendKg: number }>
  bodyFatPct?: number
}): Array<{ date: DateKey; tdee: number; dataWeight: number }> {
  const { profile, intake, trend, bodyFatPct } = args
  const out: Array<{ date: DateKey; tdee: number; dataWeight: number }> = []
  for (let i = 0; i < trend.length; i++) {
    const upTo = trend[i].date
    const est = adaptiveExpenditure({
      profile,
      intake: intake.filter((d) => d.date <= upTo),
      trend: trend.slice(0, i + 1),
      currentKg: trend[i].trendKg,
      bodyFatPct,
    })
    out.push({ date: upTo, tdee: est.tdee, dataWeight: est.dataWeight })
  }
  return out
}

export function remaining(targets: MacroTargets, consumed: Nutrients): MacroTargets {
  return {
    kcal: targets.kcal - consumed.kcal,
    protein: targets.protein - consumed.protein,
    carbs: targets.carbs - consumed.carbs,
    fat: targets.fat - consumed.fat,
    fiber: targets.fiber != null ? targets.fiber - (consumed.fiber ?? 0) : undefined,
  }
}

/** Share of total kcal contributed by each macro, for the split bar. */
export function macroSplit(n: Nutrients): { protein: number; carbs: number; fat: number } {
  const p = n.protein * ENERGY_FACTORS.protein
  const c = n.carbs * ENERGY_FACTORS.carbs
  const f = n.fat * ENERGY_FACTORS.fat
  const total = p + c + f
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 }
  return { protein: p / total, carbs: c / total, fat: f / total }
}

/* ------------------------------------------------------------------ *
 * Recipes
 * ------------------------------------------------------------------ */

export interface RecipeTotals {
  total: Nutrients
  /** Mass the per-100 g figures are based on: cooked weight if given, else the raw sum. */
  grams: number
  perPortion: Nutrients
  per100: Nutrients
}

/**
 * Nutrients for a recipe.
 *
 * Cooking changes mass but not energy: water leaves or enters, the macros
 * stay in the pot. So the total is the sum of the ingredients, and the
 * per-100 g figure divides that by the weight of the finished dish when the
 * user weighed it, or by the raw sum when they did not.
 */
export function recipeTotals(recipe: {
  ingredients: Array<{ resolvedAmount: number; nutrients: Nutrients }>
  portions: number
  totalGrams?: number
}): RecipeTotals {
  const total = recipe.ingredients.length ? sum(recipe.ingredients.map((i) => i.nutrients)) : { ...ZERO }
  const rawGrams = recipe.ingredients.reduce((s, i) => s + i.resolvedAmount, 0)
  const grams = recipe.totalGrams && recipe.totalGrams > 0 ? recipe.totalGrams : rawGrams
  const portions = Math.max(1, recipe.portions || 1)
  return {
    total,
    grams,
    perPortion: scale(total, 100 / portions),
    per100: grams > 0 ? scale(total, 10000 / grams) : { ...ZERO },
  }
}
