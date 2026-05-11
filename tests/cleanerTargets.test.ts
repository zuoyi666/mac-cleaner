import { describe, expect, it } from 'vitest'
import { cleanerTargets, validateCleanerTargets } from '../src/main/services/cleanerTargets'

describe('cleanerTargets', () => {
  it('keeps the v0.16 registry explicit, trash-first, and sudo-free', () => {
    expect(() => validateCleanerTargets()).not.toThrow()
    expect(cleanerTargets.map((target) => target.id)).toEqual([
      'caches',
      'logs',
      'diagnostics',
      'http-storage',
      'saved-state',
      'downloads',
      'developer-caches'
    ])

    for (const target of cleanerTargets) {
      expect(target.nameKey).toBeTruthy()
      expect(target.descriptionKey).toBeTruthy()
      expect(target.relativePaths.length).toBeGreaterThan(0)
      expect(target.reasonKey).toBeTruthy()
      expect(target.impactKey).toBeTruthy()
      expect(target.actionLabelKey).toBeTruthy()
      expect(target.preflightChecks).toEqual(expect.arrayContaining(['safe-root', 'no-symlink', 'same-volume', 'not-protected']))
      expect(target.deletionMode).toBe('trash')
      expect(target.requiresSudo).toBe(false)
    }
  })

  it('rejects unsafe registry entries', () => {
    expect(() =>
      validateCleanerTargets([
        {
          ...cleanerTargets[0],
          id: 'unsafe-root',
          relativePaths: ['/']
        }
      ])
    ).toThrow('Unsafe cleaner target path')

    expect(() =>
      validateCleanerTargets([
        {
          ...cleanerTargets[0],
          id: 'unsafe-sudo',
          requiresSudo: true
        }
      ])
    ).toThrow('cannot require sudo')
  })
})
