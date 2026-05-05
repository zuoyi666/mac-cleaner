import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import type { CleanupPreview, CleanupResult } from '../../shared/types'
import type { InternalCandidate } from './scanner'
import { isWithinPath } from './pathSafety'

const CONFIRMATION_TTL_MS = 5 * 60 * 1000

export interface CleanupStore {
  getCandidate(candidateId: string): InternalCandidate | undefined
  removeCandidate(candidateId: string): void
}

export interface CleanupManager {
  cleanupPreview(candidateIds: string | string[]): CleanupPreview
  moveToTrash(candidateIds: string | string[], confirmationId: string): Promise<CleanupResult>
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
    cleanupPreview(candidateIdsInput: string | string[]): CleanupPreview {
      const candidates = getCleanableCandidates(store, candidateIdsInput)
      const scanId = assertSingleScan(candidates)
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
        title: candidates.length === 1 ? candidates[0].title : `${candidates.length} 个清理项目`,
        totalBytes,
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples,
        impact: candidates.length === 1 ? candidates[0].impact : summarizeBatchImpact(candidates),
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。清倒废纸篓前仍可手动恢复。',
        expiresAt: new Date(expiresAt).toISOString()
      }
    },

    async moveToTrash(candidateIdsInput: string | string[], confirmationId: string): Promise<CleanupResult> {
      const candidates = getCleanableCandidates(store, candidateIdsInput)
      const candidateIds = candidates.map((candidate) => candidate.id)
      const confirmation = confirmations.get(confirmationId)

      if (
        !confirmation ||
        !sameIds(confirmation.candidateIds, candidateIds) ||
        confirmation.expiresAt < Date.now() ||
        confirmation.scanId !== assertSingleScan(candidates) ||
        confirmation.pathSnapshotHash !== hashCandidates(candidates)
      ) {
        throw new Error('清理确认已失效，请重新确认。')
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
            failed.push({ candidateId: candidate.id, path: targetPath, error: '路径超出允许清理范围。' })
            candidateSucceeded = false
            continue
          }

          try {
            const stats = await fs.lstat(targetPath)
            if (stats.isSymbolicLink()) {
              failed.push({ candidateId: candidate.id, path: targetPath, error: '跳过符号链接。' })
              candidateSucceeded = false
              continue
            }
            if (snapshot.lastModified && stats.mtime.toISOString() !== snapshot.lastModified) {
              failed.push({ candidateId: candidate.id, path: targetPath, error: '路径在扫描后发生变化，请重新扫描。' })
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

function getCleanableCandidates(store: CleanupStore, candidateIdsInput: string | string[]): InternalCandidate[] {
  const candidateIds = normalizeCandidateIds(candidateIdsInput)
  return candidateIds.map((candidateId) => {
    const candidate = store.getCandidate(candidateId)
    if (!candidate) {
      throw new Error('未找到该清理项目，请重新扫描。')
    }

    if (!candidate.canClean || candidate.safety === 'discouraged') {
      throw new Error('该项目被标记为不建议清理，不能执行自动清理。')
    }

    return candidate
  })
}

function normalizeCandidateIds(candidateIdsInput: string | string[]): string[] {
  const candidateIds = Array.isArray(candidateIdsInput) ? candidateIdsInput : [candidateIdsInput]
  const normalized = [...new Set(candidateIds.filter((candidateId) => typeof candidateId === 'string' && candidateId.length > 0))]
  if (!normalized.length) {
    throw new Error('至少需要选择一个清理项目。')
  }
  return normalized
}

function assertSingleScan(candidates: InternalCandidate[]): string {
  const scanIds = new Set(candidates.map((candidate) => candidate.scanId))
  if (scanIds.size !== 1) {
    throw new Error('所选项目来自不同扫描结果，请重新扫描后再清理。')
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

function summarizeBatchImpact(candidates: InternalCandidate[]): string {
  const safetyLabels = new Set(candidates.map((candidate) => candidate.safety))
  if (safetyLabels.has('confirm')) {
    return '所选项目中包含需要确认的缓存、网页存储或下载归档；可能需要重新登录、重新下载资源或恢复窗口状态。'
  }
  return '所选项目通常可由应用重新生成；首次重新打开相关应用时可能变慢。'
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
