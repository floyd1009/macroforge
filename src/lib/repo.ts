import { db, getProfile, getSettings, newId } from './db'
import { addDays, fromKey, toKey, todayKey, type DateKey } from './date'
import { checkinFor, isCheckinDue, nextCheckinDate, reviewWeek, toCheckIn, type CheckinReview } from './checkin'
import {
  adaptiveExpenditure,
  computeTargets,
  expenditureSeries,
  kcalFromMacros,
  recipeTotals,
  scale,
  shiftForWeekday,
  sum,
  trendSeries,
  ZERO,
  type ExpenditureEstimate,
} from './nutrition'
import type {
  CheckIn,
  Confidence,
  FoodSource,
  FoodState,
  Provenance,
  EntryMethod,
  Food,
  LogEntry,
  MacroTargets,
  MealSlot,
  Nutrients,
  Profile,
  Recipe,
  Settings,
  WeightEntry,
} from './types'

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export async function entriesForDay(date: DateKey): Promise<LogEntry[]> {
  const rows = await db.entries.where('date').equals(date).toArray()
  return rows.filter((e) => !e.deleted).sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
}

export function totals(entries: LogEntry[]): Nutrients {
  return entries.length ? sum(entries.map((e) => e.nutrients)) : { ...ZERO }
}

export function groupByMeal(entries: LogEntry[]): Record<MealSlot, LogEntry[]> {
  const out: Record<MealSlot, LogEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] }
  for (const e of entries) out[e.meal].push(e)
  return out
}

export interface DayIntake {
  date: DateKey
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Daily totals over a trailing window, skipping days with nothing logged. */
export async function intakeHistory(days = 60): Promise<DayIntake[]> {
  const start = addDays(todayKey(), -days)
  const rows = await db.entries.where('date').aboveOrEqual(start).toArray()
  const byDate = new Map<DateKey, DayIntake>()
  for (const e of rows) {
    if (e.deleted) continue
    const d = byDate.get(e.date) ?? { date: e.date, kcal: 0, protein: 0, carbs: 0, fat: 0 }
    d.kcal += e.nutrients.kcal
    d.protein += e.nutrients.protein
    d.carbs += e.nutrients.carbs
    d.fat += e.nutrients.fat
    byDate.set(e.date, d)
  }
  return [...byDate.values()].filter((d) => d.kcal > 0).sort((a, b) => a.date.localeCompare(b.date))
}

export async function weightHistory(days = 180): Promise<WeightEntry[]> {
  const start = addDays(todayKey(), -days)
  const rows = await db.weights.where('date').aboveOrEqual(start).toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function latestWeight(): Promise<WeightEntry | undefined> {
  const rows = await db.weights.orderBy('date').reverse().limit(1).toArray()
  return rows[0]
}

/* ------------------------------------------------------------------ *
 * The daily plan: expenditure -> targets -> what's left
 * ------------------------------------------------------------------ */

export interface DayPlan {
  date: DateKey
  profile: Profile
  settings: Settings
  /** Targets for this calendar day, after any calorie shifting. */
  targets: MacroTargets
  /** The week's mean targets, before shifting. */
  weekTargets: MacroTargets
  /** Where the targets came from. */
  targetSource: 'manual' | 'checkin' | 'live'
  expenditure: ExpenditureEstimate
  consumed: Nutrients
  entries: LogEntry[]
  currentKg?: number
  trendKg?: number
  /** Check-in whose targets are in force, if any. */
  checkin?: CheckIn
  checkinDue: boolean
  nextCheckin: DateKey
}

interface PlanInputs {
  profile: Profile
  settings: Settings
  trend: Array<{ date: DateKey; kg: number; trendKg: number }>
  intake: DayIntake[]
  bodyFatPct?: number
  currentKg?: number
  expenditure: ExpenditureEstimate
  liveTargets: MacroTargets
  checkins: CheckIn[]
}

async function planInputs(): Promise<PlanInputs> {
  const [profile, settings, weights, intake, checkins] = await Promise.all([
    getProfile(),
    getSettings(),
    weightHistory(400),
    intakeHistory(120),
    db.checkins.toArray(),
  ])

  const trend = trendSeries(
    weights.map((w) => ({ date: w.date, kg: w.kg })),
    settings.weightTrendAlpha,
  )
  const last = trend[trend.length - 1]
  const bodyFatPct = weights[weights.length - 1]?.bodyFatPct

  // Use trend weight, not the last raw reading — targets should not jump 200
  // kcal because of a salty meal the night before.
  const currentKg = last?.trendKg ?? last?.kg

  const expenditure = adaptiveExpenditure({
    profile,
    intake,
    trend,
    currentKg: currentKg ?? 75,
    bodyFatPct,
  })

  const liveTargets = computeTargets({
    profile,
    tdee: expenditure.tdee,
    currentKg: currentKg ?? 75,
    bodyFatPct,
  })

  return { profile, settings, trend, intake, bodyFatPct, currentKg, expenditure, liveTargets, checkins }
}

/** Everything the Trends screen charts, computed once from the same inputs as the plan. */
export async function buildTrends() {
  const i = await planInputs()
  const weights = await weightHistory(400)
  return {
    profile: i.profile,
    weights,
    trend: i.trend,
    intake: i.intake,
    expenditure: i.expenditure,
    liveTargets: i.liveTargets,
    checkins: [...i.checkins].sort((a, b) => b.date.localeCompare(a.date)),
    expenditureHistory: expenditureSeries({
      profile: i.profile,
      intake: i.intake,
      trend: i.trend,
      bodyFatPct: i.bodyFatPct,
    }),
  }
}

/** The day the check-in clock starts from when no check-in exists yet. */
function checkinAnchor(profile: Profile, checkins: CheckIn[]): DateKey {
  const latest = checkins.reduce<CheckIn | undefined>((m, c) => (!m || c.date > m.date ? c : m), undefined)
  if (latest) return latest.date
  return profile.createdAt ? toKey(new Date(profile.createdAt)) : todayKey()
}

export async function buildDayPlan(date: DateKey = todayKey()): Promise<DayPlan> {
  const [inputs, entries] = await Promise.all([planInputs(), entriesForDay(date)])
  const { profile, settings, trend, expenditure, liveTargets, checkins } = inputs
  const last = trend[trend.length - 1]

  // Frozen weekly targets win over the live estimate; a manual override wins
  // over both. Days before the first check-in fall back to the earliest one so
  // history is not re-scored against today's estimate.
  const checkin =
    checkinFor(checkins, date) ?? [...checkins].sort((a, b) => a.date.localeCompare(b.date))[0]
  const targetSource: DayPlan['targetSource'] = profile.manualTargets ? 'manual' : checkin ? 'checkin' : 'live'
  const weekTargets = profile.manualTargets ?? checkin?.targets ?? liveTargets
  const targets = shiftForWeekday(weekTargets, fromKey(date).getDay(), profile.highDays, profile.highDayBoost)

  const anchor = checkinAnchor(profile, checkins)
  return {
    date,
    profile,
    settings,
    targets,
    weekTargets,
    targetSource,
    expenditure,
    consumed: totals(entries),
    entries,
    currentKg: last?.kg,
    trendKg: last?.trendKg,
    checkin,
    checkinDue: !profile.manualTargets && isCheckinDue(todayKey(), anchor, profile.checkinDay),
    nextCheckin: nextCheckinDate(anchor, profile.checkinDay),
  }
}

/* ------------------------------------------------------------------ *
 * Weekly check-in
 * ------------------------------------------------------------------ */

export async function buildCheckinReview(): Promise<CheckinReview & { dataWeight: number }> {
  const i = await planInputs()
  const previous = checkinFor(i.checkins, todayKey())
  const review = reviewWeek({
    today: todayKey(),
    profile: i.profile,
    previous,
    expenditure: i.expenditure,
    currentKg: i.currentKg ?? 75,
    bodyFatPct: i.bodyFatPct,
    intake: i.intake,
    trend: i.trend,
    currentTargets: i.liveTargets,
  })
  return { ...review, dataWeight: i.expenditure.dataWeight }
}

export async function completeCheckin(review: CheckinReview & { dataWeight: number }, accept: boolean): Promise<void> {
  const profile = await getProfile()
  await db.checkins.put(toCheckIn(todayKey(), review, profile, review.dataWeight, accept))
}

/**
 * Re-derive the current week's targets after a goal or macro setting changes.
 *
 * The expenditure estimate stays frozen for the week, but a changed goal has
 * to take effect immediately — otherwise switching from a cut to maintenance
 * would leave the deficit in place until the next check-in.
 */
export async function retargetCurrentWeek(): Promise<void> {
  const i = await planInputs()
  const current = checkinFor(i.checkins, todayKey())
  if (!current) return
  const targets = computeTargets({
    profile: i.profile,
    tdee: current.tdee,
    currentKg: i.currentKg ?? 75,
    bodyFatPct: i.bodyFatPct,
  })
  await db.checkins.update(current.id, { targets, rateKgPerWeek: i.profile.rateKgPerWeek })
}

/** Save profile changes and keep the frozen weekly targets consistent with them. */
export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const profile = await getProfile()
  const now = Date.now()
  await db.profile.put({ ...profile, ...patch, createdAt: profile.createdAt || now, updatedAt: now })
  await retargetCurrentWeek()
}

/** Consecutive days with at least one logged entry, ending today or yesterday. */
export async function loggingStreak(): Promise<number> {
  const start = addDays(todayKey(), -400)
  const rows = await db.entries.where('date').aboveOrEqual(start).toArray()
  const days = new Set(rows.filter((e) => !e.deleted).map((e) => e.date))
  // An unlogged today does not break the streak until the day is over.
  let cursor = days.has(todayKey()) ? todayKey() : addDays(todayKey(), -1)
  let n = 0
  while (days.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface DraftEntry {
  date: DateKey
  meal: MealSlot
  food?: Food
  /** Used when there is no Food row (AI estimate, quick-add). */
  name?: string
  brand?: string
  amount: number
  unit: 'g' | 'ml' | 'serving'
  servingLabel?: string
  /** Pre-computed absolute nutrients; when absent they are derived from `food`. */
  nutrients?: Nutrients
  basis?: 'g' | 'ml'
  method: EntryMethod
  provenance?: Provenance
  confidence?: Confidence
  ai?: LogEntry['ai']
  photoId?: string
  captureId?: string
  note?: string
}

/** Resolve an amount in the chosen unit to grams/ml against a food's servings. */
export function resolveAmount(food: Food | undefined, amount: number, unit: 'g' | 'ml' | 'serving', servingLabel?: string): number {
  if (unit !== 'serving') return amount
  const s = food?.servings.find((x) => x.label === servingLabel) ?? food?.servings.find((x) => x.isDefault) ?? food?.servings[0]
  // A serving with no known mass is worthless for macro maths; fall back to
  // 100 so the entry is at least visible and obviously editable.
  return amount * (s?.amount ?? 100)
}

/**
 * Map how the entry was created onto how trustworthy its numbers are. These
 * two are not the same thing: scanning a barcode is a convenient *method*, but
 * an EU label is permitted a ±20 % tolerance, so it is not ground truth.
 */
export function provenanceFor(method: EntryMethod): Provenance {
  switch (method) {
    case 'barcode':
      return 'barcode'
    case 'photo':
      return 'photo'
    case 'voice':
      return 'voice'
    case 'search':
    case 'recipe':
    case 'repeat':
      return 'weighed'
    default:
      return 'manual'
  }
}

export async function addEntry(draft: DraftEntry): Promise<LogEntry> {
  const resolved = resolveAmount(draft.food, draft.amount, draft.unit, draft.servingLabel)
  const nutrients = draft.nutrients ?? (draft.food ? scale(draft.food.per100, resolved) : { ...ZERO })

  const existing = await entriesForDay(draft.date)
  const maxSort = existing.reduce((m, e) => Math.max(m, e.sort), 0)

  const entry: LogEntry = {
    id: newId(),
    date: draft.date,
    meal: draft.meal,
    foodId: draft.food?.id,
    name: draft.name ?? draft.food?.name ?? draft.food?.nameDe ?? 'Unnamed',
    brand: draft.brand ?? draft.food?.brand,
    amount: draft.amount,
    unit: draft.unit,
    servingLabel: draft.servingLabel,
    resolvedAmount: resolved,
    basis: draft.basis ?? draft.food?.basis ?? 'g',
    nutrients,
    method: draft.method,
    provenance: draft.provenance ?? provenanceFor(draft.method),
    confidence: draft.confidence ?? (draft.food?.verified ? 'high' : 'medium'),
    ai: draft.ai,
    photoId: draft.photoId,
    captureId: draft.captureId,
    note: draft.note,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sort: maxSort + 1,
  }

  await db.entries.add(entry)
  if (draft.food) await touchFood(draft.food.id)
  return entry
}

export async function updateEntryAmount(
  id: string,
  amount: number,
  unit: 'g' | 'ml' | 'serving',
  servingLabel?: string,
): Promise<void> {
  const entry = await db.entries.get(id)
  if (!entry) return
  const food = entry.foodId ? await db.foods.get(entry.foodId) : undefined
  const resolved = resolveAmount(food, amount, unit, servingLabel)

  // Rescale the entry's own snapshot rather than re-reading the food row. The
  // snapshot already carries whatever raw/cooked conversion was applied when
  // it was logged, and a later edit to the food must not rewrite a past day.
  const nutrients =
    entry.resolvedAmount > 0
      ? scale(scale(entry.nutrients, 100 / entry.resolvedAmount), resolved * 100)
      : food
        ? scale(food.per100, resolved)
        : entry.nutrients

  await db.entries.update(id, {
    amount,
    unit,
    servingLabel,
    resolvedAmount: resolved,
    nutrients,
    updatedAt: Date.now(),
    // A user-corrected AI estimate is worth more trust than the raw guess.
    ...(entry.ai ? { ai: { ...entry.ai, correctedByUser: true }, confidence: 'high' as Confidence } : {}),
  })

  if (entry.ai && !entry.ai.correctedByUser) {
    await db.corrections.add({
      id: newId(),
      entryId: id,
      capturedAt: Date.now(),
      method: entry.method === 'voice' ? 'voice' : 'photo',
      model: entry.ai.model,
      before: { name: entry.name, grams: entry.resolvedAmount, nutrients: entry.nutrients },
      after: { name: entry.name, grams: resolved, nutrients },
    })
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await db.entries.update(id, { deleted: true, updatedAt: Date.now() })
}

export async function moveEntry(id: string, meal: MealSlot, date?: DateKey): Promise<void> {
  await db.entries.update(id, { meal, ...(date ? { date } : {}), updatedAt: Date.now() })
}

/** Copy every entry from one day/meal into another — "same as yesterday". */
export async function copyMeal(from: DateKey, meal: MealSlot, to: DateKey): Promise<number> {
  const src = (await entriesForDay(from)).filter((e) => e.meal === meal)
  const existing = await entriesForDay(to)
  let sort = existing.reduce((m, e) => Math.max(m, e.sort), 0)
  const now = Date.now()
  const copies = src.map((e) => ({
    ...e,
    id: newId(),
    date: to,
    createdAt: now,
    updatedAt: now,
    method: 'repeat' as EntryMethod,
    sort: ++sort,
  }))
  await db.entries.bulkAdd(copies)
  return copies.length
}

/** Copy a whole day's log into another day. */
export async function copyDay(from: DateKey, to: DateKey): Promise<number> {
  const src = await entriesForDay(from)
  const existing = await entriesForDay(to)
  let sort = existing.reduce((m, e) => Math.max(m, e.sort), 0)
  const now = Date.now()
  const copies = src.map((e) => ({
    ...e,
    id: newId(),
    date: to,
    createdAt: now,
    updatedAt: now,
    method: 'repeat' as EntryMethod,
    sort: ++sort,
  }))
  await db.entries.bulkAdd(copies)
  return copies.length
}

/** Most recent earlier day on which `meal` has entries, within two weeks. */
export async function lastDayWithMeal(before: DateKey, meal?: MealSlot): Promise<DateKey | undefined> {
  const rows = await db.entries.where('date').between(addDays(before, -14), before, true, false).toArray()
  const days = rows.filter((e) => !e.deleted && (!meal || e.meal === meal)).map((e) => e.date)
  return days.sort().pop()
}

/**
 * Log calories and macros with no food behind them.
 *
 * If only macros are given the energy is derived from them; if only energy is
 * given the macros stay at zero, which under-reports protein for the day but
 * is still better than not logging the meal at all.
 */
export async function quickAdd(args: {
  date: DateKey
  meal: MealSlot
  name?: string
  kcal?: number
  protein?: number
  carbs?: number
  fat?: number
}): Promise<LogEntry> {
  const protein = args.protein ?? 0
  const carbs = args.carbs ?? 0
  const fat = args.fat ?? 0
  const kcal = args.kcal ?? kcalFromMacros({ protein, carbs, fat })
  return addEntry({
    date: args.date,
    meal: args.meal,
    name: args.name?.trim() || 'Quick add',
    amount: 1,
    unit: 'serving',
    nutrients: { kcal, protein, carbs, fat },
    method: 'quick',
    provenance: 'manual',
    confidence: 'medium',
  })
}

export async function saveCustomFood(args: {
  id?: string
  name: string
  brand?: string
  basis: 'g' | 'ml'
  per100: Nutrients
  servingLabel?: string
  servingAmount?: number
}): Promise<Food> {
  const now = Date.now()
  const existing = args.id ? await db.foods.get(args.id) : undefined
  const servings = [
    ...(args.servingAmount && args.servingAmount > 0
      ? [
          {
            label: `${args.servingLabel?.trim() || '1 serving'} (${Math.round(args.servingAmount)} ${args.basis})`,
            amount: args.servingAmount,
            isDefault: true,
          },
        ]
      : []),
    { label: `100 ${args.basis}`, amount: 100, isDefault: !args.servingAmount },
    { label: `1 ${args.basis}`, amount: 1 },
  ]
  const food: Food = {
    id: existing?.id ?? `custom:${newId()}`,
    source: 'custom',
    name: args.name.trim(),
    brand: args.brand?.trim() || undefined,
    state: 'as_sold',
    basis: args.basis,
    carbBasis: 'available',
    per100: args.per100,
    servings,
    verified: true,
    provenance: 'entered by you',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: existing?.useCount ?? 0,
    lastUsedAt: existing?.lastUsedAt ?? now,
    favorite: existing?.favorite,
  }
  await db.foods.put(food)
  invalidateFoodIndex()
  return food
}

export async function toggleFavorite(foodId: string): Promise<void> {
  const f = await db.foods.get(foodId)
  if (f) await db.foods.update(foodId, { favorite: !f.favorite })
}

/* ------------------------------------------------------------------ *
 * Recipes
 * ------------------------------------------------------------------ */

/** Store a recipe and the loggable food derived from it. */
export async function saveRecipe(recipe: Recipe): Promise<Food> {
  const now = Date.now()
  const t = recipeTotals(recipe)
  await db.recipes.put({ ...recipe, updatedAt: now })
  const id = `recipe:${recipe.id}`
  const existing = await db.foods.get(id)
  const portionGrams = t.grams / Math.max(1, recipe.portions || 1)
  const food: Food = {
    id,
    source: 'custom',
    sourceId: id,
    name: recipe.name.trim() || 'Recipe',
    brand: 'Recipe',
    state: 'as_sold',
    basis: 'g',
    carbBasis: 'available',
    per100: t.per100,
    servings: [
      { label: `1 portion (${Math.round(portionGrams)} g)`, amount: portionGrams, isDefault: true },
      { label: '100 g', amount: 100 },
      { label: '1 g', amount: 1 },
    ],
    verified: true,
    provenance: `your recipe, ${recipe.ingredients.length} ingredients`,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: existing?.useCount ?? 0,
    lastUsedAt: existing?.lastUsedAt ?? now,
    favorite: existing?.favorite,
  }
  await db.foods.put(food)
  invalidateFoodIndex()
  return food
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.update(id, { deleted: true, updatedAt: Date.now() })
  await db.foods.update(`recipe:${id}`, { deleted: true, updatedAt: Date.now() })
  invalidateFoodIndex()
}

async function touchFood(id: string): Promise<void> {
  const f = await db.foods.get(id)
  if (!f) return
  await db.foods.update(id, { useCount: (f.useCount ?? 0) + 1, lastUsedAt: Date.now() })
}

/** Insert or refresh a food, keeping usage counters and user edits intact. */
export async function upsertFood(food: Food): Promise<Food> {
  const existing =
    (await db.foods.get(food.id)) ??
    (food.barcode ? (await db.foods.where('barcode').equals(food.barcode).first()) : undefined)

  if (existing) {
    const merged: Food = {
      ...food,
      id: existing.id,
      useCount: existing.useCount,
      lastUsedAt: existing.lastUsedAt,
      favorite: existing.favorite,
      // Never let a remote refresh clobber a food the user edited by hand.
      ...(existing.source === 'custom' ? existing : {}),
      updatedAt: Date.now(),
    }
    await db.foods.put(merged)
    invalidateFoodIndex()
    return merged
  }
  await db.foods.put(food)
  invalidateFoodIndex()
  return food
}

export async function saveWeight(date: DateKey, kg: number, bodyFatPct?: number): Promise<void> {
  const settings = await getSettings()
  const existing = await db.weights.get(date)
  await db.weights.put({
    date,
    kg,
    bodyFatPct: bodyFatPct ?? existing?.bodyFatPct,
    note: existing?.note,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  })

  // Recompute the whole trend: inserting a back-dated weigh-in changes every
  // trend value after it, so patching only the new row would be wrong.
  const all = await db.weights.orderBy('date').toArray()
  const withTrend = trendSeries(
    all.map((w) => ({ date: w.date, kg: w.kg })),
    settings.weightTrendAlpha,
  )
  await db.transaction('rw', db.weights, async () => {
    for (const t of withTrend) await db.weights.update(t.date, { trendKg: t.trendKg })
  })
}

/* ------------------------------------------------------------------ *
 * Search over the local food cache
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Local search
 *
 * With BLS loaded there are 7,000+ foods in the table, so re-reading them on
 * every keystroke is not viable. A compact in-memory index is built once and
 * reused; it holds only the fields scoring needs, and is invalidated when the
 * table's row count changes.
 * ------------------------------------------------------------------ */

interface IndexEntry {
  id: string
  state: FoodState
  /** Lowercased "name brand nameDe", pre-joined for substring matching. */
  hay: string
  /** Lowercased primary name, for prefix scoring. */
  name: string
  source: FoodSource
  verified: boolean
  favorite: boolean
  useCount: number
  lastUsedAt: number
}

let searchIndex: IndexEntry[] | null = null
let indexedCount = -1

/** Drop the cached index; call after any write that adds or removes foods. */
export function invalidateFoodIndex(): void {
  searchIndex = null
  indexedCount = -1
}

async function getIndex(): Promise<IndexEntry[]> {
  const count = await db.foods.count()
  if (searchIndex && indexedCount === count) return searchIndex

  const all = await db.foods.toArray()
  searchIndex = all
    .filter((f) => !f.deleted)
    .map((f) => ({
      id: f.id,
      hay: `${f.name} ${f.nameDe ?? ''} ${f.brand ?? ''}`.toLowerCase(),
      name: (f.name || f.nameDe || '').toLowerCase(),
      state: f.state,
      source: f.source,
      verified: f.verified,
      favorite: f.favorite ?? false,
      useCount: f.useCount ?? 0,
      lastUsedAt: f.lastUsedAt ?? 0,
    }))
  indexedCount = count
  return searchIndex
}

function scoreEntry(
  e: IndexEntry,
  q: string,
  tokens: string[],
  prefers: 'raw' | 'cooked',
): number {
  // Every query token must appear somewhere, so "chicken raw" cannot match a
  // food that is only "chicken".
  for (const t of tokens) if (!e.hay.includes(t)) return -1

  let s = 0
  if (e.name === q) s += 120
  else if (e.name.startsWith(q)) s += 60
  else if (e.hay.includes(q)) s += 25

  // Word-boundary hits beat mid-word ones: "oat" should rank "Oat flakes"
  // above "Groats".
  for (const t of tokens) {
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(e.hay)) s += 12
  }

  // A shorter name containing the query is usually the more generic, more
  // likely-intended food: "Rice" over "Rice pudding with cinnamon".
  s += Math.max(0, 22 - e.name.length / 3)

  if (e.favorite) s += 40
  s += Math.min(30, e.useCount * 4)
  if (e.lastUsedAt) {
    const ageDays = (Date.now() - e.lastUsedAt) / 86_400_000
    s += Math.max(0, 18 - ageDays / 2)
  }

  // Source priority: things the user made or ate before, then the national
  // composition database, then crowdsourced retail data.
  if (e.source === 'custom') s += 14
  else if (e.source === 'seed') s += 10
  else if (e.source === 'bls') s += 8
  if (e.verified) s += 5

  // BLS ships raw and cooked variants of the same food side by side. Surface
  // the one matching how this user actually weighs, unless they typed the
  // other state explicitly.
  const asked = tokens.some((t) => /raw|uncooked/.test(t))
    ? 'raw'
    : tokens.some((t) => /cook|boil|fried|roast|grill|baked|steam/.test(t))
      ? 'cooked'
      : null
  const target = asked ?? prefers
  if (e.state === target) s += 16
  else if (e.state !== 'as_sold') s -= 6

  return s
}

export async function searchLocalFoods(
  query: string,
  limit = 30,
  /** Override the profile's raw/cooked preference, e.g. recipes are built from raw weights. */
  state?: 'raw' | 'cooked',
): Promise<Food[]> {
  const q = query.trim().toLowerCase()

  if (!q) {
    // No query: the most recently used foods, which is what people re-log.
    const recent = await db.foods.orderBy('lastUsedAt').reverse().limit(limit * 2).toArray()
    return recent.filter((f) => !f.deleted && f.lastUsedAt).slice(0, limit)
  }

  const [index, profile] = await Promise.all([getIndex(), getProfile()])
  const tokens = q.split(/\s+/).filter(Boolean)
  const prefers = state ?? profile.weighsFood ?? 'cooked'

  const scored: Array<{ id: string; s: number }> = []
  for (const e of index) {
    const s = scoreEntry(e, q, tokens, prefers)
    if (s >= 0) scored.push({ id: e.id, s })
  }
  scored.sort((a, b) => b.s - a.s)

  const top = scored.slice(0, limit)
  const foods = await db.foods.bulkGet(top.map((t) => t.id))
  return foods.filter((f): f is Food => f != null)
}

export async function findByBarcode(barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first()
}
