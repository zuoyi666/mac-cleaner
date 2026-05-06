import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import type { AppLanguage, CleanupPreview, CleanupResult } from '../../shared/types'
import { t } from '../../shared/i18n'
import type { InternalCandidate } from './scanner'
import { isWithinPath } from './pathSafety'

const CONFIRMATION_TTL_MS = 5 * 60 * 1000

export interface CleanupStore {
  getCandidate(candidateId: string): InternalCandidate | undefined
  removeCandidate(candidateId: string): void
}

export interface CleanupManager {
  cleanupPreview(candidateIds: string | string[], language?: AppLanguage): CleanupPreview
  moveToTrash(candidateIds: string | string[], confirmationId: string, language?: AppLanguage): Promise<CleanupResult>
}

interface Confirmation {
  candidateIds: string[]
  scanId: string
  pathSnapshotHash: string
  expiresAt: number
}

export function createCleanupManager(
  store: CleanupStore,
  trashItem: (pathName: string) => Promise<void>
): CleanupManager {
  const confirmations = new Map<string, Confirmation>()

  return {
    cleanupPreview(candidateIdsInput: string | string[], language: AppLanguage = 'zh-CN'): CleanupPreview {
      const candidates = getCleanableCandidates(store, candidateIdsInput, language)
      const scanId = assertSingleScan(candidates, language)
      const candidateIds = candidates.map((candidate) => candidate.id)
      const pathSnapshotHash = hashCandidates(candidates)
      const confirmationId = crypto.randomUUID()
      const expiresAt = Date.now() + CONFIRMATION_TTL_MS
      confirmations.set(confirmationId, { candidateIds, scanId, pathSnapshotHash, expiresAt })
      const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
      const pathSamples = candidates.flatMap((candidate) => candidate.pathSamples).slice(0, 8)

      return {
        candidateIds,
        confirmationId,
        scanId,
        pathSnapshotHash,
        title: candidates.length === 1 ? candidates[0].title : t(language, 'cleanup.batchTitle', { count: candidates.length }),
        titleKey: candidates.length === 1 ? undefined : 'cleanup.batchTitle',
        titleParams: candidates.length === 1 ? undefined : { count: candidates.length },
        totalBytes,
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples,
        impact: candidates.length === 1 ? localizedCandidateImpact(candidates[0], language) : summarizeBatchImpact(candidates, language),
        impactKey: candidates.length === 1 ? candidates[0].impactKey : batchImpactKey(candidates),
        warning: t(language, 'cleanup.warning'),
        warningKey: 'cleanup.warning',
        expiresAt: new Date(expiresAt).toISOString()
      }
    },

    async moveToTrash(candidateIdsInput: string | string[], confirmationId: string, language: AppLanguage = 'zh-CN'): Promise<CleanupResult> {
      const candidates = getCleanableCandidates(store, candidateIdsInput, language)
      const candidateIds = candidates.map((candidate) => candidate.id)
      const confirmation = confirmations.get(confirmationId)

      if (
        !confirmation ||
        !sameIds(confirmation.candidateIds, candidateIds) ||
        confirmation.expiresAt < Date.now() ||
        confirmation.scanId !== assertSingleScan(candidates, language) ||
        confirmation.pathSnapshotHash !== hashCandidates(candidates)
      ) {
        throw new Error(t(language, 'cleanup.error.confirmExpired'))
      }

      confirmations.delete(confirmationId)

      const failed: CleanupResult['failed'] = []
      let successCount = 0
      let cleanedBytes = 0
      const successfulCandidates = new Set<string>()

      for (const candidate of candidates) {
        let candidateSucceeded = true
        for (const snapshot of candidate.pathSnapshots) {
          const targetPath = snapshot.path
          if (!isWithinPath(targetPath, candidate.allowedRoot)) {
            failed.push({
              candidateId: candidate.id,
              path: targetPath,
              error: t(language, 'cleanup.failure.outsideAllowlist'),
              errorKey: 'cleanup.failure.outsideAllowlist'
            })
            candidateSucceeded = false
            continue
          }

          try {
            const stats = await fs.lstat(targetPath)
            if (stats.isSymbolicLink()) {
              failed.push({
                candidateId: candidate.id,
                path: targetPath,
                error: t(language, 'cleanup.failure.skipSymlink'),
                errorKey: 'cleanup.failure.skipSymlink'
              })
              candidateSucceeded = false
              continue
            }
            if (snapshot.lastModified && stats.mtime.toISOString() !== snapshot.lastModified) {
              failed.push({
                candidateId: candidate.id,
                path: targetPath,
                error: t(language, 'cleanup.failure.changedAfterScan'),
                errorKey: 'cleanup.failure.changedAfterScan'
              })
              candidateSucceeded = false
              continue
            }
            await trashItem(targetPath)
            successCount += 1
            cleanedBytes += snapshot.sizeBytes
          } catch (error) {
            failed.push({ candidateId: candidate.id, path: targetPath, error: formatError(error) })
            candidateSucceeded = false
            continue
          }
        }
        if (candidateSucceeded) successfulCandidates.add(candidate.id)
      }

      for (const candidateId of successfulCandidates) {
        store.removeCandidate(candidateId)
      }

      return {
        candidateIds,
        cleanedBytes,
        successCount,
        failed,
        movedToTrash: successCount > 0,
        needsRescan: successCount > 0 || failed.length > 0
      }
    }
  }
}

function getCleanableCandidates(store: CleanupStore, candidateIdsInput: string | string[], language: AppLanguage): InternalCandidate[] {
  const candidateIds = normalizeCandidateIds(candidateIdsInput, language)
  return candidateIds.map((candidateId) => {
    const candidate = store.getCandidate(candidateId)
    if (!candidate) {
      throw new Error(t(language, 'cleanup.error.notFound'))
    }

    if (!candidate.canClean || candidate.safety === 'discouraged') {
      throw new Error(t(language, 'cleanup.error.discouraged'))
    }

    return candidate
  })
}

function normalizeCandidateIds(candidateIdsInput: string | string[], language: AppLanguage): string[] {
  const candidateIds = Array.isArray(candidateIdsInput) ? candidateIdsInput : [candidateIdsInput]
  const normalized = [...new Set(candidateIds.filter((candidateId) => typeof candidateId === 'string' && candidateId.length > 0))]
  if (!normalized.length) {
    throw new Error(t(language, 'cleanup.error.needSelection'))
  }
  return normalized
}

function assertSingleScan(candidates: InternalCandidate[], language: AppLanguage): string {
  const scanIds = new Set(candidates.map((candidate) => candidate.scanId))
  if (scanIds.size !== 1) {
    throw new Error(t(language, 'cleanup.error.mixedScans'))
  }
  return candidates[0].scanId
}

function hashCandidates(candidates: InternalCandidate[]): string {
  const snapshot = candidates
    .map((candidate) => ({
      id: candidate.id,
      scanId: candidate.scanId,
      pathSnapshotHash: candidate.pathSnapshotHash
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id))
}

function localizedCandidateImpact(candidate: InternalCandidate, language: AppLanguage): string {
  return candidate.impactKey ? t(language, candidate.impactKey) : candidate.impact
}

function batchImpactKey(candidates: InternalCandidate[]): string {
  const safetyLabels = new Set(candidates.map((candidate) => candidate.safety))
  if (safetyLabels.has('confirm')) {
    return 'cleanup.batchImpactConfirm'
  }
  return 'cleanup.batchImpactSafe'
}

function summarizeBatchImpact(candidates: InternalCandidate[], language: AppLanguage): string {
  return t(language, batchImpactKey(candidates))
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
