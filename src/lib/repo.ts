import { db, getProfile, getSettings, newId } from './db'
import { addDays, todayKey, type DateKey } from './date'
import {
  adaptiveExpenditure,
  computeTargets,
  scale,
  sum,
  trendSeries,
  ZERO,
  type ExpenditureEstimate,
} from './nutrition'
import type {
  Confidence,
  Provenance,
  EntryMethod,
  Food,
  LogEntry,
  MacroTargets,
  MealSlot,
  Nutrients,
  Profile,
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

/** Daily kcal totals over a trailing window, skipping days with nothing logged. */
export async function intakeHistory(days = 60): Promise<Array<{ date: DateKey; kcal: number }>> {
  const start = addDays(todayKey(), -days)
  const rows = await db.entries.where('date').aboveOrEqual(start).toArray()
  const byDate = new Map<DateKey, number>()
  for (const e of rows) {
    if (e.deleted) continue
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.nutrients.kcal)
  }
  return [...byDate.entries()]
    .map(([date, kcal]) => ({ date, kcal }))
    .filter((d) => d.kcal > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
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
  targets: MacroTargets
  expenditure: ExpenditureEstimate
  consumed: Nutrients
  entries: LogEntry[]
  currentKg?: number
  trendKg?: number
}

export async function buildDayPlan(date: DateKey = todayKey()): Promise<DayPlan> {
  const [profile, settings, entries, weights, intake] = await Promise.all([
    getProfile(),
    getSettings(),
    entriesForDay(date),
    weightHistory(180),
    intakeHistory(60),
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

  const targets = computeTargets({
    profile,
    tdee: expenditure.tdee,
    currentKg: currentKg ?? 75,
    bodyFatPct,
  })

  return {
    date,
    profile,
    settings,
    targets,
    expenditure,
    consumed: totals(entries),
    entries,
    currentKg: last?.kg,
    trendKg: last?.trendKg,
  }
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

  // Without a Food row the only sane rescale is proportional to the old amount.
  const nutrients = food
    ? scale(food.per100, resolved)
    : scale(scale(entry.nutrients, 100 / (entry.resolvedAmount || 100)), resolved)

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
    return merged
  }
  await db.foods.put(food)
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

function score(food: Food, q: string): number {
  const name = `${food.name || food.nameDe} ${food.brand ?? ''}`.toLowerCase()
  if (!name.includes(q)) return -1
  let s = 0
  if (name.startsWith(q)) s += 40
  const wordStart = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)
  if (wordStart) s += 20
  if (food.favorite) s += 30
  if (food.verified) s += 8
  s += Math.min(25, (food.useCount ?? 0) * 3)
  // Recency bonus, decaying over a month.
  if (food.lastUsedAt) {
    const ageDays = (Date.now() - food.lastUsedAt) / 86_400_000
    s += Math.max(0, 15 - ageDays / 2)
  }
  return s
}

export async function searchLocalFoods(query: string, limit = 30): Promise<Food[]> {
  const q = query.trim().toLowerCase()
  const all = await db.foods.toArray()
  const live = all.filter((f) => !f.deleted)
  if (!q) {
    return live
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || (b.useCount ?? 0) - (a.useCount ?? 0))
      .slice(0, limit)
  }
  return live
    .map((f) => ({ f, s: score(f, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f)
}

export async function findByBarcode(barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first()
}
