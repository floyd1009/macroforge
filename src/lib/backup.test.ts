import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, validateBackup } from './backup'

const ok = { version: 1, exportedAt: '2026-11-01T00:00:00.000Z', entries: [{ id: 'a' }], weights: [] }

describe('backup validation', () => {
  it('accepts a version 1 export, which has no programs or check-ins', () => {
    expect(validateBackup(ok).entries).toHaveLength(1)
  })

  it('rejects files that are not exports', () => {
    expect(() => validateBackup(null)).toThrow(/not a MacroForge export/)
    expect(() => validateBackup([])).toThrow(/not a MacroForge export/)
    expect(() => validateBackup({ foo: 1 })).toThrow(/not a MacroForge export/)
  })

  it('refuses an export from a newer app rather than half-loading it', () => {
    expect(() => validateBackup({ ...ok, version: BACKUP_VERSION + 1 })).toThrow(/newer version/)
  })

  it('names the damaged section', () => {
    expect(() => validateBackup({ ...ok, weights: 'nope' })).toThrow(/"weights"/)
    expect(() => validateBackup({ ...ok, entries: [null] })).toThrow(/"entries"/)
  })

  it('refuses a file with no log data, since restoring it would only delete', () => {
    expect(() => validateBackup({ version: 1, exportedAt: 'x', profile: [] })).toThrow(/no log data/)
  })
})
