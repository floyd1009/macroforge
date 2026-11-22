import { db, getSettings } from './db'

/**
 * Backup and restore.
 *
 * There is no server, so the exported file is the only copy of the data that
 * exists outside the phone. An export nobody can load back is not a backup,
 * which is why restore lives next to it and is tested against the same shape.
 */

/** Every table that holds user data. Photos are blobs and are left out. */
export const EXPORT_TABLES = [
  'profile',
  'settings',
  'foods',
  'entries',
  'recipes',
  'weights',
  'exercises',
  'workouts',
  'programs',
  'checkins',
  'measurements',
] as const

type TableName = (typeof EXPORT_TABLES)[number]
export type BackupFile = { version: number; exportedAt: string } & Partial<Record<TableName, unknown[]>>

export const BACKUP_VERSION = 2

export async function exportData(): Promise<BackupFile> {
  const dump: BackupFile = { version: BACKUP_VERSION, exportedAt: new Date().toISOString() }
  for (const t of EXPORT_TABLES) {
    const rows = (await db.table(t).toArray()) as unknown[]
    dump[t] =
      t === 'settings'
        ? // Never write a credential into a file the user might share.
          rows.map((s) => {
            const row = s as { ai?: object }
            return { ...row, ai: { ...row.ai, apiKey: undefined } }
          })
        : t === 'foods'
          ? // The bundled national database reloads itself; exporting 7,000
            // rows nobody edited would make every backup 5 MB.
            rows.filter((f) => {
              const food = f as { source?: string; useCount?: number; favorite?: boolean }
              return food.source !== 'bls' || (food.useCount ?? 0) > 0 || food.favorite
            })
          : rows
  }
  return dump
}

/**
 * Check a parsed file before anything is deleted. Throws with a message a
 * person can act on; returns the tables that are present and well-formed.
 */
export function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('That is not a MacroForge export file.')
  }
  const file = raw as Record<string, unknown>
  if (typeof file.version !== 'number' || typeof file.exportedAt !== 'string') {
    throw new Error('That is not a MacroForge export file.')
  }
  if (file.version > BACKUP_VERSION) {
    throw new Error('This export was made by a newer version of the app. Update the app, then restore.')
  }
  for (const t of EXPORT_TABLES) {
    const rows = file[t]
    if (rows === undefined) continue
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object')) {
      throw new Error(`The "${t}" section of this file is damaged.`)
    }
  }
  if (!Array.isArray(file.entries) && !Array.isArray(file.weights) && !Array.isArray(file.workouts)) {
    throw new Error('This file contains no log data.')
  }
  return file as BackupFile
}

/** Replace the contents of the app with a backup. All or nothing. */
export async function importData(raw: unknown): Promise<Record<'entries' | 'weights' | 'workouts', number>> {
  const file = validateBackup(raw)
  // The key is never exported, so keep the one already on this device.
  const currentKey = (await getSettings()).ai.apiKey

  const present = EXPORT_TABLES.filter((t) => Array.isArray(file[t]))
  await db.transaction(
    'rw',
    present.map((t) => db.table(t)),
    async () => {
      for (const t of present) {
        const rows = file[t] as object[]
        const table = db.table(t)
        if (t === 'foods') {
          // Keep the bundled database in place; overwrite only what the file has.
          await table.bulkPut(rows)
          continue
        }
        await table.clear()
        await table.bulkPut(
          t === 'settings'
            ? rows.map((s) => {
                const row = s as { ai?: object }
                return { ...row, ai: { ...row.ai, apiKey: currentKey } }
              })
            : rows,
        )
      }
    },
  )

  return {
    entries: file.entries?.length ?? 0,
    weights: file.weights?.length ?? 0,
    workouts: file.workouts?.length ?? 0,
  }
}
