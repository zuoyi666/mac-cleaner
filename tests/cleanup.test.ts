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
    const trashItem = vi.fn(async (targetPath: string) => {
      await fs.rm(targetPath, { recursive: true, force: true })
    })
    const manager = createCleanupManager(store, trashItem)

    await expect(manager.moveToTrash([candidate.id], 'wrong-confirmation')).rejects.toThrow('确认')

    const preview = manager.cleanupPreview([candidate.id])
    expect(preview.operationPaths).toEqual([candidate.paths[0]])
    expect(preview.trustReport?.summary).toContain('固定安全清理规则')
    expect(preview.trustReport?.evidence.map((item) => item.label)).toContain('路径快照已绑定')
    expect(preview.trustReport?.guarantees.map((item) => item.label)).toContain('只移到废纸篓')
    expect(preview.trustReport?.exclusions.map((item) => item.label)).toContain('不会碰清单外路径')

    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(1)
    expect(result.verifiedRemovedCount).toBe(1)
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
    expect(result.failed[0]?.errorKey).toBe('preflight.blocked.outsideRoot.detail')
    expect(result.failed[0]?.error).toContain('允许根目录')
    expect(trashItem).not.toHaveBeenCalled()
    expect(store.getCandidate(candidate.id)).toBe(candidate)
  })

  it('rechecks user-protected paths before moving anything to trash', async () => {
    const { candidate, store } = await makeStoreCandidate()
    const trashItem = vi.fn(async () => undefined)
    const manager = createCleanupManager(
      {
        ...store,
        getProtectedPaths: () => [{ id: 'keep', path: candidate.paths[0], createdAt: new Date().toISOString() }]
      },
      trashItem
    )

    const preview = manager.cleanupPreview([candidate.id])
    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(0)
    expect(result.failed[0]?.errorKey).toBe('preflight.blocked.protectedPath.detail')
    expect(result.failed[0]?.error).toContain('保护')
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
      if (targetPath === secondPath) throw Object.assign(new Error('permission denied'), { code: 'EPERM' })
      await fs.rm(targetPath, { recursive: true, force: true })
    })
    const manager = createCleanupManager(store, trashItem)
    const preview = manager.cleanupPreview([first.id, second.id])
    const result = await manager.moveToTrash([first.id, second.id], preview.confirmationId)

    expect(result.successCount).toBe(1)
    expect(result.verifiedRemovedCount).toBe(1)
    expect(result.cleanedBytes).toBe(5)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.errorKey).toBe('cleanup.failure.permissionDenied')
    expect(store.getCandidate(first.id)).toBeUndefined()
    expect(store.getCandidate(second.id)).toBe(second)
  })

  it('moves every path inside a grouped cleanup candidate and verifies source removal', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-cleanup-'))
    tempRoots.push(homeDir)
    const allowedRoot = path.join(homeDir, 'Library', 'Caches')
    const firstPath = path.join(allowedRoot, 'small.one')
    const secondPath = path.join(allowedRoot, 'small.two')
    await writeFile(path.join(firstPath, 'cache.bin'), 'one')
    await writeFile(path.join(secondPath, 'cache.bin'), 'two')

    const candidate = makeCandidate({
      id: 'grouped',
      pathName: firstPath,
      allowedRoot,
      sizeBytes: 6,
      displayKind: 'group',
      groupCount: 2,
      paths: [firstPath, secondPath],
      pathSnapshots: [
        { path: firstPath, sizeBytes: 3, itemCount: 1 },
        { path: secondPath, sizeBytes: 3, itemCount: 1 }
      ],
      pathSamples: [firstPath, secondPath],
      pathCount: 2,
      itemCount: 2
    })
    const store = makeStore(candidate)
    const manager = createCleanupManager(store, async (targetPath) => {
      await fs.rm(targetPath, { recursive: true, force: true })
    })
    const preview = manager.cleanupPreview([candidate.id])
    const result = await manager.moveToTrash([candidate.id], preview.confirmationId)

    expect(result.successCount).toBe(2)
    expect(result.verifiedRemovedCount).toBe(2)
    expect(result.cleanedBytes).toBe(6)
    expect(store.getCandidate(candidate.id)).toBeUndefined()
  })

  it('localizes cleanup preview and validation errors in English', async () => {
    const { candidate, store } = await makeStoreCandidate()
    const manager = createCleanupManager(store, vi.fn(async () => undefined))

    const preview = manager.cleanupPreview([candidate.id], 'en-US')

    expect(preview.impact).toContain('documents, photos, and projects are not removed')
    expect(preview.warning).toContain('moved to Trash')
    await expect(manager.moveToTrash([candidate.id], 'wrong-confirmation', 'en-US')).rejects.toThrow(
      'Cleanup confirmation has expired'
    )
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
    categoryNameKey: 'category.caches.name',
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
    reasonKey: 'candidate.cache.reason',
    impact: '清理后相关应用首次启动或加载内容时可能变慢。',
    impactKey: 'candidate.cache.impact',
    explanation: {
      summary: '这是可重建缓存，通常可以放心清理。',
      summaryKey: 'candidate.cache.explanation.summary',
      what: '这是 App 为了加快打开、加载图片、网页或列表而存下来的临时材料。',
      whatKey: 'candidate.cache.explanation.what',
      cleanability: '可以删。它不是你的正式文件，App 需要时会自己重新生成。',
      cleanabilityKey: 'candidate.cache.explanation.cleanability',
      afterAction: '移到废纸篓后，相关 App 第一次打开或加载内容可能慢一点。',
      afterActionKey: 'candidate.cache.explanation.afterAction',
      keepAdvice: '如果你正在离线使用某个 App，或正在排查它的问题，可以先留着。',
      keepAdviceKey: 'candidate.cache.explanation.keepAdvice',
      nextStep: '想快速释放空间，可以把它加入批量清理。',
      nextStepKey: 'candidate.cache.explanation.nextStep'
    },
    actionLabel: '移到废纸篓',
    actionLabelKey: 'candidate.cache.action',
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
