import { db, DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../lib/db'
import { buildSeedExercises } from './exercises'
import { buildSeedFoods } from './germanStaples'

/**
 * First-run bootstrap. Idempotent: safe to call on every launch, and it will
 * not overwrite a profile the user has already filled in.
 */
export async function seedIfEmpty(): Promise<void> {
  const now = Date.now()

  if (!(await db.profile.get('me'))) {
    await db.profile.put({ ...DEFAULT_PROFILE, createdAt: now, updatedAt: now })
  }
  if (!(await db.settings.get('settings'))) {
    await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now })
  }

  // Add missing staples rather than bailing if *any* food exists — that way a
  // later release can ship new seed foods to devices that are already in use.
  const seeds = buildSeedFoods(now)
  const existing = new Set(await db.foods.where('source').equals('seed').primaryKeys())
  const missing = seeds.filter((f) => !existing.has(f.id))
  if (missing.length) await db.foods.bulkPut(missing)

  const exercises = buildSeedExercises()
  const haveEx = new Set(await db.exercises.toCollection().primaryKeys())
  const missingEx = exercises.filter((e) => !haveEx.has(e.id))
  if (missingEx.length) await db.exercises.bulkPut(missingEx)
}
