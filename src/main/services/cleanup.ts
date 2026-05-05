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
  cleanupPreview(candidateId: string): CleanupPreview
  moveToTrash(candidateId: string, confirmationId: string): Promise<CleanupResult>
}

interface Confirmation {
  candidateId: string
  expiresAt: number
}

export function createCleanupManager(
  store: CleanupStore,
  trashItem: (pathName: string) => Promise<void>
): CleanupManager {
  const confirmations = new Map<string, Confirmation>()

  return {
    cleanupPreview(candidateId: string): CleanupPreview {
      const candidate = getCleanableCandidate(store, candidateId)
      const confirmationId = crypto.randomUUID()
      const expiresAt = Date.now() + CONFIRMATION_TTL_MS
      confirmations.set(confirmationId, { candidateId, expiresAt })

      return {
        candidateId,
        confirmationId,
        title: candidate.title,
        totalBytes: candidate.sizeBytes,
        pathCount: candidate.paths.length,
        pathSamples: candidate.paths.slice(0, 5),
        impact: candidate.impact,
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。清倒废纸篓前仍可手动恢复。',
        expiresAt: new Date(expiresAt).toISOString()
      }
    },

    async moveToTrash(candidateId: string, confirmationId: string): Promise<CleanupResult> {
      const candidate = getCleanableCandidate(store, candidateId)
      const confirmation = confirmations.get(confirmationId)

      if (!confirmation || confirmation.candidateId !== candidateId || confirmation.expiresAt < Date.now()) {
        throw new Error('清理确认已失效，请重新确认。')
      }

      confirmations.delete(confirmationId)

      const failed: CleanupResult['failed'] = []
      let successCount = 0

      for (const targetPath of candidate.paths) {
        if (!isWithinPath(targetPath, candidate.allowedRoot)) {
          failed.push({ path: targetPath, error: '路径超出允许清理范围。' })
          continue
        }

        try {
          const stats = await fs.lstat(targetPath)
          if (stats.isSymbolicLink()) {
            failed.push({ path: targetPath, error: '跳过符号链接。' })
            continue
          }
          await trashItem(targetPath)
          successCount += 1
        } catch (error) {
          failed.push({ path: targetPath, error: formatError(error) })
        }
      }

      if (successCount === candidate.paths.length) {
        store.removeCandidate(candidateId)
      }

      return {
        candidateId,
        cleanedBytes: successCount > 0 ? candidate.sizeBytes : 0,
        successCount,
        failed,
        movedToTrash: successCount > 0
      }
    }
  }
}

function getCleanableCandidate(store: CleanupStore, candidateId: string): InternalCandidate {
  const candidate = store.getCandidate(candidateId)
  if (!candidate) {
    throw new Error('未找到该清理项目，请重新扫描。')
  }

  if (!candidate.canClean || candidate.safety === 'discouraged') {
    throw new Error('该项目被标记为不建议清理，不能执行自动清理。')
  }

  return candidate
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
