import { resolveMeasure } from '../../data/haushaltsmasse'
import { newId } from '../../lib/db'
import { scale, scaleAcrossState } from '../../lib/nutrition'
import { searchLocalFoods } from '../../lib/repo'
import type { Confidence, Food, Nutrients } from '../../lib/types'
import { searchProducts, isOnline } from '../openfoodfacts'
import type { AiFoodItem } from './prompts'

/**
 * Turn what the model *saw* into numbers we can defend.
 *
 * The model supplies a food name, a quantity and a household measure. This
 * module does everything numeric: resolving the measure to grams against the
 * Haushaltsmaße table, matching the name to a real composition entry, and
 * applying raw/cooked yield factors. Nothing here trusts the model with a
 * calorie value, because a calorie value from a model cannot be audited.
 */

export interface ResolvedItem {
  id: string
  /** What the model reported, kept verbatim for the correction log. */
  raw: AiFoodItem
  /** The composition entry we matched it to, if any. */
  food?: Food
  matchQuality: 'exact' | 'close' | 'weak' | 'none'
  grams: number
  unit: 'g' | 'ml'
  nutrients: Nutrients
  /** ±fraction on kcal, combining portion spread and match quality. */
  uncertainty: number
  confidence: Confidence
  /** Why this number is what it is, in one line, for the UI. */
  explanation: string
  /** Model believes this was used but could not see it (oil, sugar, butter). */
  assumed: boolean
  /** Set when we could not resolve it and the user must intervene. */
  needsAttention: boolean
}

/** Normalise for matching: lowercase, strip umlaut diacritics and plurals. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 0–1 similarity, biased toward substring containment which matters here. */
function similarity(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (y.includes(x) || x.includes(y)) {
    return 0.75 + 0.2 * (Math.min(x.length, y.length) / Math.max(x.length, y.length))
  }
  const xt = new Set(x.split(' '))
  const yt = new Set(y.split(' '))
  let hits = 0
  for (const t of xt) if (yt.has(t)) hits++
  const jaccard = hits / (xt.size + yt.size - hits)
  return jaccard * 0.7
}

async function findFood(name: string, brand?: string): Promise<{ food?: Food; quality: ResolvedItem['matchQuality'] }> {
  const query = brand ? `${brand} ${name}` : name

  // Local first: seeds and anything the user has logged before are both
  // instant and more likely to be the thing they actually eat.
  const local = await searchLocalFoods(name, 12)
  let best: { food: Food; score: number } | null = null
  for (const f of local) {
    const s = Math.max(similarity(name, f.nameDe ?? f.name), similarity(name, f.name))
    if (!best || s > best.score) best = { food: f, score: s }
  }
  if (best && best.score >= 0.9) return { food: best.food, quality: 'exact' }
  if (best && best.score >= 0.62) return { food: best.food, quality: 'close' }

  // Only go to the network when the local answer is genuinely poor.
  if (isOnline()) {
    try {
      const remote = await searchProducts(query, { pageSize: 12 })
      for (const r of remote) {
        const s = Math.max(similarity(name, r.food.nameDe ?? r.food.name), similarity(name, r.food.name))
        const adjusted = s * (0.7 + 0.3 * r.quality)
        if (!best || adjusted > best.score) best = { food: r.food, score: adjusted }
      }
    } catch {
      // Offline or OFF is shedding load — fall through to whatever we had.
    }
  }

  if (!best) return { quality: 'none' }
  if (best.score >= 0.9) return { food: best.food, quality: 'exact' }
  if (best.score >= 0.62) return { food: best.food, quality: 'close' }
  if (best.score >= 0.35) return { food: best.food, quality: 'weak' }
  return { quality: 'none' }
}

/** Uncertainty added by how well the name matched a database entry. */
const MATCH_UNCERTAINTY: Record<ResolvedItem['matchQuality'], number> = {
  exact: 0.05,
  close: 0.12,
  weak: 0.25,
  none: 0.5,
}

export async function resolveItems(items: AiFoodItem[]): Promise<ResolvedItem[]> {
  return Promise.all(items.map(resolveItem))
}

export async function resolveItem(raw: AiFoodItem): Promise<ResolvedItem> {
  const { food, quality } = await findFood(raw.name, raw.brand)

  // --- portion -----------------------------------------------------
  let grams: number
  let unit: 'g' | 'ml' = 'g'
  let portionSpread: number
  let portionNote: string

  const measure = (raw.measure ?? '').trim().toLowerCase()
  if (measure === 'g' || measure === 'ml') {
    grams = raw.quantity
    unit = measure as 'g' | 'ml'
    // A stated mass from a photo is still an estimate; from text it is the
    // user's own figure. The model's confidence carries that distinction.
    portionSpread = 0.15
    portionNote = `${Math.round(grams)} ${unit}`
  } else {
    const resolved = resolveMeasure(measure, raw.quantity, raw.name)
    if (resolved) {
      grams = resolved.grams
      unit = resolved.unit
      portionSpread = resolved.spread
      portionNote = `${raw.quantity} × ${measure} ≈ ${Math.round(grams)} ${unit}`
    } else {
      // Unknown measure: fall back to a food's own default serving if it has
      // one, otherwise 100 g, and flag it loudly.
      const serving = food?.servings.find((s) => s.isDefault) ?? food?.servings[0]
      grams = (serving?.amount ?? 100) * raw.quantity
      unit = food?.basis ?? 'g'
      portionSpread = 0.5
      portionNote = `Maß „${raw.measure}" unbekannt — geschätzt`
    }
  }

  // --- nutrients ---------------------------------------------------
  let nutrients: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  if (food) {
    nutrients =
      raw.state === 'as_sold' || food.state === 'as_sold' || !food.yieldFactor
        ? scale(food.per100, grams)
        : scaleAcrossState(food.per100, grams, raw.state, food.state, food.yieldFactor)
  }

  // --- uncertainty --------------------------------------------------
  // Independent error sources add in quadrature rather than linearly;
  // summing them would overstate the band badly on a multi-item plate.
  const modelSpread = Math.max(0, 1 - (raw.confidence ?? 0.5)) * 0.4
  const uncertainty = Math.min(
    0.9,
    Math.sqrt(portionSpread ** 2 + MATCH_UNCERTAINTY[quality] ** 2 + modelSpread ** 2),
  )

  const confidence: Confidence = uncertainty < 0.18 ? 'high' : uncertainty < 0.35 ? 'medium' : 'low'

  const parts = [portionNote]
  if (food) {
    parts.push(food.provenance ?? (food.source === 'off' ? 'Open Food Facts' : 'eigene Daten'))
    if (raw.state !== 'as_sold' && food.yieldFactor && food.state !== 'as_sold' && raw.state !== food.state) {
      parts.push(`${raw.state === 'cooked' ? 'gegart' : 'roh'} umgerechnet (Faktor ${food.yieldFactor})`)
    }
  } else {
    parts.push('kein Datenbank-Treffer')
  }

  return {
    id: newId(),
    raw,
    food,
    matchQuality: quality,
    grams,
    unit,
    nutrients,
    uncertainty,
    confidence,
    explanation: parts.join(' · '),
    assumed: raw.assumed ?? false,
    needsAttention: !food || quality === 'weak' || quality === 'none',
  }
}

/** Total for a plate, with the combined uncertainty band on kcal. */
export function plateTotal(items: ResolvedItem[]): { nutrients: Nutrients; kcalLow: number; kcalHigh: number } {
  const nutrients = items.reduce<Nutrients>(
    (acc, i) => ({
      kcal: acc.kcal + i.nutrients.kcal,
      protein: acc.protein + i.nutrients.protein,
      carbs: acc.carbs + i.nutrients.carbs,
      fat: acc.fat + i.nutrients.fat,
      fiber: (acc.fiber ?? 0) + (i.nutrients.fiber ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )

  // Per-item errors are largely independent, so the plate's relative error is
  // smaller than the worst item's — the usual quadrature sum.
  const absErr = Math.sqrt(
    items.reduce((s, i) => s + (i.nutrients.kcal * i.uncertainty) ** 2, 0),
  )
  return {
    nutrients,
    kcalLow: Math.max(0, nutrients.kcal - absErr),
    kcalHigh: nutrients.kcal + absErr,
  }
}
