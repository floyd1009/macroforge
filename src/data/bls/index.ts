import { db } from '../../lib/db'
import type { Food, FoodState, Nutrients } from '../../lib/types'

/**
 * Bundeslebensmittelschlüssel (BLS) 4.0 — the German national food composition
 * database, published by the Max Rubner-Institut.
 *
 * 7,140 foods, 138 analysed nutrients each, released December 2025 under
 * CC BY 4.0 with explicit permission for "App- und Softwareentwicklung".
 * DOI: 10.25826/Data20251217-134202-0
 *
 * This is the authoritative source for *generic* foods — chicken breast,
 * rolled oats, a boiled potato — which is exactly where Open Food Facts is
 * weakest, because nobody scans a potato. Two properties make it fit this app
 * without adaptation:
 *
 *  - Carbohydrate is reported as **available** carbohydrate, with fibre listed
 *    separately. That is the EU convention the whole schema is built on, so no
 *    conversion is needed and no fibre is double-counted.
 *  - Energy uses the LMIV Annex XIV factors, the same ones `kcalFromMacros`
 *    implements — so the app's own consistency check agrees with the source
 *    rather than fighting it.
 *
 * The file is ~300 kB gzipped and is loaded lazily: it is imported into
 * IndexedDB once, in the background, after first launch.
 */

interface BlsPayload {
  v: number
  source: string
  doi: string
  cols: string[]
  rows: Array<Array<string | number | null>>
}

/** Optional nutrients carried through when the source reports a value. */
const OPTIONAL_KEYS = ['fiber', 'sugar', 'satFat', 'salt', 'alcohol', 'polyols'] as const

export const BLS_CITATION =
  'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0 (CC BY 4.0)'

function toFood(row: Array<string | number | null>, idx: Record<string, number>, now: number): Food | null {
  const code = String(row[idx.code] ?? '')
  const en = String(row[idx.en] ?? '').trim()
  const de = String(row[idx.de] ?? '').trim()
  const name = en || de
  if (!code || !name) return null

  const num = (k: string): number | undefined => {
    const v = row[idx[k]]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }

  const per100: Nutrients = {
    kcal: num('kcal') ?? 0,
    protein: num('protein') ?? 0,
    carbs: num('carbs') ?? 0,
    fat: num('fat') ?? 0,
  }
  for (const k of OPTIONAL_KEYS) {
    const v = num(k)
    // Zero is a real measurement here, but carrying a zero for every trace
    // nutrient across 7,140 foods costs more than it informs.
    if (v != null && v > 0) per100[k] = v
  }

  const state = (row[idx.state] as FoodState) ?? 'as_sold'

  return {
    id: `bls:${code}`,
    source: 'bls',
    sourceId: code,
    name,
    nameDe: de && de !== en ? de : undefined,
    state,
    carbBasis: 'available',
    basis: 'g',
    per100,
    servings: [{ label: '100 g', amount: 100, isDefault: true }],
    verified: true,
    provenance: 'BLS 4.0 (Max Rubner-Institut)',
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  }
}

let importing: Promise<number> | null = null

/**
 * Import BLS into IndexedDB if it is not already there.
 *
 * Idempotent and safe to call on every launch. Deduplicated with a module-level
 * promise so a fast navigation cannot start two imports at once.
 */
export function importBls(onProgress?: (done: number, total: number) => void): Promise<number> {
  if (importing) return importing
  importing = (async () => {
    const existing = await db.foods.where('source').equals('bls').count()
    if (existing > 7000) return existing

    // Dynamic import keeps the ~300 kB out of the initial bundle entirely.
    const payload = (await import('./bls.json')).default as unknown as BlsPayload
    const idx: Record<string, number> = {}
    payload.cols.forEach((c, i) => (idx[c] = i))

    const now = Date.now()
    const foods = payload.rows
      .map((r) => toFood(r, idx, now))
      .filter((f): f is Food => f !== null)

    // Chunked so a large bulkPut cannot block the main thread for a full second.
    const CHUNK = 500
    for (let i = 0; i < foods.length; i += CHUNK) {
      await db.foods.bulkPut(foods.slice(i, i + CHUNK))
      onProgress?.(Math.min(i + CHUNK, foods.length), foods.length)
    }
    return foods.length
  })()

  return importing.finally(() => {
    importing = null
  })
}

export async function isBlsLoaded(): Promise<boolean> {
  return (await db.foods.where('source').equals('bls').count()) > 7000
}

/** Count of BLS foods currently in the database, for the settings readout. */
export async function blsCount(): Promise<number> {
  return db.foods.where('source').equals('bls').count()
}
