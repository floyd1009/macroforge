import Dexie, { type EntityTable } from 'dexie'
import type {
  CorrectionLog,
  Exercise,
  Food,
  LogEntry,
  Profile,
  Recipe,
  Settings,
  StoredPhoto,
  WeightEntry,
  Workout,
} from './types'

/**
 * Everything lives in IndexedDB on the device. There is no server, so there is
 * no account, no sync, and no data leaving the phone except the specific
 * photo/text you hand to an AI provider you configured yourself.
 */
class MacroForgeDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<LogEntry, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  weights!: EntityTable<WeightEntry, 'date'>
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  profile!: EntityTable<Profile, 'id'>
  settings!: EntityTable<Settings, 'id'>
  corrections!: EntityTable<CorrectionLog, 'id'>
  photos!: EntityTable<StoredPhoto, 'id'>

  constructor() {
    super('macroforge')
    this.version(1).stores({
      // `barcode` is unique-ish but OFF has duplicates, so keep it non-unique.
      foods: 'id, source, sourceId, barcode, name, brand, retailer, lastUsedAt, useCount, favorite',
      // [date+meal] powers the day view; `captureId` groups AI-created entries.
      entries: 'id, date, [date+meal], meal, foodId, captureId, method, createdAt',
      recipes: 'id, name, updatedAt',
      weights: 'date, updatedAt',
      exercises: 'id, name, primary, lastUsedAt, useCount',
      workouts: 'id, date, startedAt',
      profile: 'id',
      settings: 'id',
      corrections: 'id, entryId, capturedAt, method',
      photos: 'id, createdAt',
    })
  }
}

export const db = new MacroForgeDB()

/** Crypto-strong id; falls back for older WebKit that lacks randomUUID. */
export function newId(): string {
  const c: Crypto | undefined = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c?.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  sex: 'male',
  heightCm: 178,
  activity: 'moderate',
  goal: 'maintain',
  rateKgPerWeek: 0,
  manualTargets: null,
  proteinPerKg: 2.0,
  fatPerKg: 0.8,
  units: 'metric',
  locale: 'en',
  createdAt: 0,
  updatedAt: 0,
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  ai: { provider: 'anthropic', enabled: false },
  // 0.10 ≈ a 19-day half-life: responsive enough to see a real trend within a
  // week, damped enough to ignore a salty dinner or a bad night's sleep.
  weightTrendAlpha: 0.1,
  firstDayOfWeek: 1,
  showFiber: true,
  keepPhotos: true,
  updatedAt: 0,
}

export async function getProfile(): Promise<Profile> {
  return (await db.profile.get('me')) ?? DEFAULT_PROFILE
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  if (!s) return DEFAULT_SETTINGS
  // Merge so a schema addition never lands as `undefined` on an existing device.
  return { ...DEFAULT_SETTINGS, ...s, ai: { ...DEFAULT_SETTINGS.ai, ...s.ai } }
}

/**
 * Ask iOS to keep the database out of the eviction pool. Safari grants this
 * silently for home-screen web apps and usually declines it in a normal tab,
 * so a `false` here is informational, not an error.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted?.()) return true
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}
