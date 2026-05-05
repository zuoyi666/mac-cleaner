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

    await expect(manager.moveToTrash(candidate.id, 'wrong-confirmation')).rejects.toThrow('确认')

    const preview = manager.cleanupPreview(candidate.id)
    const result = await manager.moveToTrash(candidate.id, preview.confirmationId)

    expect(result.successCount).toBe(1)
    expect(result.movedToTrash).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(candidate.paths[0])
    expect(store.getCandidate(candidate.id)).toBeUndefined()
  })

  it('refuses discouraged candidates', async () => {
    const { candidate, store } = await makeStoreCandidate({ safety: 'discouraged', canClean: false })
    const manager = createCleanupManager(store, vi.fn(async () => undefined))

    expect(() => manager.cleanupPreview(candidate.id)).toThrow('不建议清理')
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
    const preview = manager.cleanupPreview(candidate.id)
    const result = await manager.moveToTrash(candidate.id, preview.confirmationId)

    expect(result.successCount).toBe(0)
    expect(result.failed[0]?.error).toContain('超出允许清理范围')
    expect(trashItem).not.toHaveBeenCalled()
    expect(store.getCandidate(candidate.id)).toBe(candidate)
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
  return { candidate, store: makeStore(candidate) }
}

function makeStore(initialCandidate: InternalCandidate) {
  const candidates = new Map([[initialCandidate.id, initialCandidate]])
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
  return {
    id,
    title: path.basename(pathName),
    categoryId: 'caches',
    categoryName: '用户缓存',
    kind: 'cache',
    safety: 'safe',
    canClean: true,
    sizeBytes,
    itemCount: 1,
    pathPreview: pathName,
    pathToken: `${id}-token`,
    reason: '缓存通常可由应用重新生成。',
    impact: '清理后相关应用首次启动或加载内容时可能变慢。',
    actionLabel: '移到废纸篓',
    paths: [pathName],
    allowedRoot,
    ...overrides
  }
}
