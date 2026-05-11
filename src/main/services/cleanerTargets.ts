import fs from 'node:fs/promises'
import path from 'node:path'
import type { CleanerTargetRisk, CleanupKind, DeletionMode, SafetyLevel } from '../../shared/types'

const DOWNLOAD_EXTENSIONS = new Set([
  '.dmg',
  '.pkg',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.rar',
  '.7z',
  '.iso'
])

const OLD_DOWNLOAD_DAYS = 30

export interface CleanerTarget {
  id: string
  nameKey: string
  descriptionKey: string
  relativePaths: string[]
  excludedRelativePaths?: string[]
  kind: CleanupKind
  safety: SafetyLevel
  risk: CleanerTargetRisk
  deletionMode: DeletionMode
  requiresSudo: boolean
  requiresFullDiskAccess: boolean
  preflightChecks: string[]
  reasonKey: string
  impactKey: string
  actionLabelKey: string
  includeFile?: (entryPath: string, stats: Awaited<ReturnType<typeof fs.lstat>>, now: Date) => boolean
  directChildrenOnly?: boolean
}

export const cleanerTargets: CleanerTarget[] = [
  {
    id: 'caches',
    nameKey: 'category.caches.name',
    descriptionKey: 'category.caches.description',
    relativePaths: ['Library/Caches'],
    kind: 'cache',
    safety: 'safe',
    risk: 'safe',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.cache.reason',
    impactKey: 'candidate.cache.impact',
    actionLabelKey: 'candidate.cache.action'
  },
  {
    id: 'logs',
    nameKey: 'category.logs.name',
    descriptionKey: 'category.logs.description',
    relativePaths: ['Library/Logs'],
    excludedRelativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'log',
    safety: 'safe',
    risk: 'safe',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.log.reason',
    impactKey: 'candidate.log.impact',
    actionLabelKey: 'candidate.log.action'
  },
  {
    id: 'diagnostics',
    nameKey: 'category.diagnostics.name',
    descriptionKey: 'category.diagnostics.description',
    relativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'diagnostic',
    safety: 'safe',
    risk: 'safe',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.diagnostic.reason',
    impactKey: 'candidate.diagnostic.impact',
    actionLabelKey: 'candidate.diagnostic.action'
  },
  {
    id: 'http-storage',
    nameKey: 'category.http-storage.name',
    descriptionKey: 'category.http-storage.description',
    relativePaths: ['Library/HTTPStorages'],
    kind: 'http-storage',
    safety: 'confirm',
    risk: 'confirm',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.http-storage.reason',
    impactKey: 'candidate.http-storage.impact',
    actionLabelKey: 'candidate.http-storage.action'
  },
  {
    id: 'saved-state',
    nameKey: 'category.saved-state.name',
    descriptionKey: 'category.saved-state.description',
    relativePaths: ['Library/Saved Application State'],
    kind: 'saved-state',
    safety: 'confirm',
    risk: 'confirm',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.saved-state.reason',
    impactKey: 'candidate.saved-state.impact',
    actionLabelKey: 'candidate.saved-state.action'
  },
  {
    id: 'downloads',
    nameKey: 'category.downloads.name',
    descriptionKey: 'category.downloads.description',
    relativePaths: ['Downloads'],
    kind: 'download-archive',
    safety: 'confirm',
    risk: 'confirm',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.download-archive.reason',
    impactKey: 'candidate.download-archive.impact',
    actionLabelKey: 'candidate.download-archive.action',
    directChildrenOnly: true,
    includeFile: (entryPath, stats, now) => {
      if (!stats.isFile()) return false
      const extension = path.extname(entryPath).toLowerCase()
      const ageMs = now.getTime() - stats.mtime.getTime()
      return DOWNLOAD_EXTENSIONS.has(extension) && ageMs >= OLD_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000
    }
  },
  {
    id: 'developer-caches',
    nameKey: 'category.developer-caches.name',
    descriptionKey: 'category.developer-caches.description',
    relativePaths: [
      'Library/Developer/Xcode/DerivedData',
      'Library/Caches/Homebrew',
      'Library/Caches/pip',
      'Library/pnpm/store',
      '.npm',
      '.cache/yarn'
    ],
    kind: 'developer-cache',
    safety: 'safe',
    risk: 'safe',
    deletionMode: 'trash',
    requiresSudo: false,
    requiresFullDiskAccess: false,
    preflightChecks: ['safe-root', 'no-symlink', 'same-volume', 'not-protected'],
    reasonKey: 'candidate.developer-cache.reason',
    impactKey: 'candidate.developer-cache.impact',
    actionLabelKey: 'candidate.developer-cache.action'
  }
]

export function validateCleanerTargets(targets = cleanerTargets): void {
  const seen = new Set<string>()
  for (const target of targets) {
    if (seen.has(target.id)) throw new Error(`Duplicate cleaner target id: ${target.id}`)
    seen.add(target.id)
    if (!target.relativePaths.length) throw new Error(`Cleaner target has no paths: ${target.id}`)
    if (target.deletionMode !== 'trash') throw new Error(`Existing v0.16 targets must remain Trash-only: ${target.id}`)
    if (target.requiresSudo) throw new Error(`Cleaner target cannot require sudo: ${target.id}`)
    for (const relativePath of [...target.relativePaths, ...(target.excludedRelativePaths ?? [])]) {
      if (path.isAbsolute(relativePath) || /[\u0000-\u001f\u007f]/.test(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
        throw new Error(`Unsafe cleaner target path: ${target.id}`)
      }
    }
  }
}
