import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCleanupManager } from '../src/main/services/cleanup'
import type { InternalCandidate } from '../src/main/services/scanner'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('createCleanupManager', () => {
  it('requires a matching confirmation id before moving a candidate to trash', async () => {
    const { candidate, store } = await makeStoreCandidate()
    const trashItem = vi.fn(async () => undefined)
    const manager = createCleanupManager(store, trashItem)

    await expect(manager.moveToTrash([candidate.id], 'wrong-confirmation')).rejects.toThrow('确认')

    const preview = manager.cleanupPreview([candidate.id])
    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(1)
    expect(result.movedToTrash).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(candidate.paths[0])
    expect(store.getCandidate(candidate.id)).toBeUndefined()
  })

  it('refuses discouraged candidates', async () => {
    const { candidate, store } = await makeStoreCandidate({ safety: 'discouraged', canClean: false })
    const manager = createCleanupManager(store, vi.fn(async () => undefined))

    expect(() => manager.cleanupPreview([candidate.id])).toThrow('不建议清理')
  })

  it('does not trash paths outside the candidate allowlist root', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-cleanup-'))
    tempRoots.push(homeDir)
    const allowedRoot = path.join(homeDir, 'Library', 'Caches')
    const outsideRoot = path.join(homeDir, 'Downloads')
    const targetPath = path.join(outsideRoot, 'OldInstaller.dmg')
    await fs.mkdir(outsideRoot, { recursive: true })
    await fs.writeFile(targetPath, 'installer')

    const candidate = makeCandidate({
      id: 'unsafe-path',
      pathName: targetPath,
      allowedRoot,
      sizeBytes: 9
    })
    const store = makeStore(candidate)
    const trashItem = vi.fn(async () => undefined)
    const manager = createCleanupManager(store, trashItem)
    const preview = manager.cleanupPreview([candidate.id])
    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(0)
    expect(result.failed[0]?.error).toContain('超出允许清理范围')
    expect(trashItem).not.toHaveBeenCalled()
    expect(store.getCandidate(candidate.id)).toBe(candidate)
  })

  it('rejects a confirmation when the scan snapshot changes after preview', async () => {
    const { candidate, store } = await makeStoreCandidate()
    const manager = createCleanupManager(store, vi.fn(async () => undefined))

    const preview = manager.cleanupPreview([candidate.id])
    candidate.scanId = 'new-scan-id'

    await expect(manager.moveToTrash([candidate.id], preview.confirmationId)).rejects.toThrow('确认已失效')
  })

  it('reports a changed path without moving it to trash', async () => {
    const { candidate, store } = await makeStoreCandidate()
    const trashItem = vi.fn(async () => undefined)
    const manager = createCleanupManager(store, trashItem)
    const preview = manager.cleanupPreview([candidate.id])

    const changedAt = new Date(Date.now() + 10_000)
    await fs.utimes(candidate.paths[0], changedAt, changedAt)

    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(0)
    expect(result.cleanedBytes).toBe(0)
    expect(result.needsRescan).toBe(true)
    expect(result.failed[0]?.error).toContain('发生变化')
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('counts only successfully moved paths when a batch partially fails', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-cleanup-'))
    tempRoots.push(homeDir)
    const allowedRoot = path.join(homeDir, 'Library', 'Caches')
    const firstPath = path.join(allowedRoot, 'first.bin')
    const secondPath = path.join(allowedRoot, 'second.bin')
    await writeFile(firstPath, 'first')
    await writeFile(secondPath, 'second')

    const first = makeCandidate({ id: 'first', pathName: firstPath, allowedRoot, sizeBytes: 5 })
    const second = makeCandidate({ id: 'second', pathName: secondPath, allowedRoot, sizeBytes: 6 })
    const store = makeStore(first, second)
    const trashItem = vi.fn(async (targetPath: string) => {
      if (targetPath === secondPath) throw new Error('permission denied')
    })
    const manager = createCleanupManager(store, trashItem)
    const preview = manager.cleanupPreview([first.id, second.id])
    const result = await manager.moveToTrash([first.id, second.id], preview.confirmationId)

    expect(result.successCount).toBe(1)
    expect(result.cleanedBytes).toBe(5)
    expect(result.failed).toHaveLength(1)
    expect(store.getCandidate(first.id)).toBeUndefined()
    expect(store.getCandidate(second.id)).toBe(second)
  })
})

async function makeStoreCandidate(overrides: Partial<InternalCandidate> = {}) {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-cleanup-'))
  tempRoots.push(homeDir)
  const allowedRoot = path.join(homeDir, 'Library', 'Caches')
  const targetPath = path.join(allowedRoot, 'com.example.app')
  await fs.mkdir(targetPath, { recursive: true })
  await fs.writeFile(path.join(targetPath, 'cache.bin'), 'cache')

  const candidate = makeCandidate({
    id: 'candidate-1',
    pathName: targetPath,
    allowedRoot,
    sizeBytes: 5,
    ...overrides
  })
  await refreshSnapshot(candidate)
  return { candidate, store: makeStore(candidate) }
}

function makeStore(...initialCandidates: InternalCandidate[]) {
  const candidates = new Map(initialCandidates.map((candidate) => [candidate.id, candidate]))
  return {
    getCandidate(candidateId: string) {
      return candidates.get(candidateId)
    },
    removeCandidate(candidateId: string) {
      candidates.delete(candidateId)
    }
  }
}

function makeCandidate({
  id,
  pathName,
  allowedRoot,
  sizeBytes,
  ...overrides
}: {
  id: string
  pathName: string
  allowedRoot: string
  sizeBytes: number
} & Partial<InternalCandidate>): InternalCandidate {
  const pathSnapshot = {
    path: pathName,
    sizeBytes,
    itemCount: 1
  }

  return {
    id,
    scanId: 'scan-1',
    title: path.basename(pathName),
    categoryId: 'caches',
    categoryName: '用户缓存',
    kind: 'cache',
    safety: 'safe',
    canClean: true,
    sizeBytes,
    itemCount: 1,
    pathCount: 1,
    pathPreview: pathName,
    pathSamples: [pathName],
    pathToken: `${id}-token`,
    pathSnapshotHash: `hash-${id}`,
    estimateSource: 'file-stat',
    reason: '缓存通常可由应用重新生成。',
    impact: '清理后相关应用首次启动或加载内容时可能变慢。',
    actionLabel: '移到废纸篓',
    paths: [pathName],
    allowedRoot,
    ...overrides,
    pathSnapshots: overrides.pathSnapshots ?? [pathSnapshot]
  }
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

async function refreshSnapshot(candidate: InternalCandidate): Promise<void> {
  const stats = await fs.lstat(candidate.paths[0])
  candidate.lastModified = stats.mtime.toISOString()
  candidate.pathSnapshots[0].lastModified = stats.mtime.toISOString()
}
