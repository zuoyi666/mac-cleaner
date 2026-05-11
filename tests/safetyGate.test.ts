import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeProtectedPaths, runSafetyGate } from '../src/main/services/safetyGate'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('SafetyGate', () => {
  it('rejects root, home, and whole Library paths before cleanup', async () => {
    const homeDir = await makeHome()

    await expectSafetyBlocked('/', '/', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked(homeDir, homeDir, homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked(path.join(homeDir, 'Library'), path.join(homeDir, 'Library'), homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/System', '/', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/System/Library/Caches/example', '/System/Library/Caches', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/bin', '/', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/sbin', '/', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/usr/bin', '/usr', homeDir, 'preflight.blocked.forbiddenRoot.detail')
    await expectSafetyBlocked('/usr/sbin', '/usr', homeDir, 'preflight.blocked.forbiddenRoot.detail')
  })

  it('rejects traversal text, paths outside the safe root, symlinks, and protected paths', async () => {
    const homeDir = await makeHome()
    const allowedRoot = path.join(homeDir, 'Library', 'Caches')
    const safePath = path.join(allowedRoot, 'com.example.app')
    const outsidePath = path.join(homeDir, 'Downloads', 'OldInstaller.dmg')
    const symlinkPath = path.join(allowedRoot, 'external-link')
    await fs.mkdir(safePath, { recursive: true })
    await fs.mkdir(path.dirname(outsidePath), { recursive: true })
    await fs.writeFile(outsidePath, 'installer')
    await fs.symlink(os.tmpdir(), symlinkPath)

    expect((await runSafetyGate({ targetPath: `${allowedRoot}/../Caches/com.example.app`, allowedRoot, homeDir })).allowed).toBe(false)
    expect((await runSafetyGate({ targetPath: outsidePath, allowedRoot, homeDir })).blockReasonKey).toBe('preflight.blocked.outsideRoot.detail')
    expect((await runSafetyGate({ targetPath: symlinkPath, allowedRoot, homeDir })).blockReasonKey).toBe('preflight.blocked.symlink.detail')
    expect(
      (
        await runSafetyGate({
          targetPath: safePath,
          allowedRoot,
          homeDir,
          protectedPaths: [{ id: 'keep', path: safePath, createdAt: new Date().toISOString() }]
        })
      ).blockReasonKey
    ).toBe('preflight.blocked.protectedPath.detail')
  })

  it('allows a normal path inside the safe root and normalizes protected paths conservatively', async () => {
    const homeDir = await makeHome()
    const allowedRoot = path.join(homeDir, 'Library', 'Caches')
    const safePath = path.join(allowedRoot, 'com.example.app')
    await fs.mkdir(safePath, { recursive: true })

    const result = await runSafetyGate({ targetPath: safePath, allowedRoot, homeDir })
    expect(result.allowed).toBe(true)
    expect(result.evidence.map((item) => item.labelKey)).toContain('preflight.allowedRoot.label')
    expect(result.evidence.map((item) => item.labelKey)).toContain('preflight.symlink.label')

    const protectedPaths = normalizeProtectedPaths(
      [
        { id: '', path: '~/Projects/keep', createdAt: '' },
        { id: 'bad-root', path: homeDir, createdAt: '' },
        { id: 'bad-traversal', path: '~/Projects/../Library', createdAt: '' },
        { id: 'duplicate', path: '~/Projects/keep', createdAt: '' }
      ],
      homeDir,
      new Date('2026-05-11T00:00:00Z')
    )

    expect(protectedPaths).toEqual([
      {
        id: expect.stringMatching(/^protected-/),
        path: path.join(homeDir, 'Projects', 'keep'),
        createdAt: '2026-05-11T00:00:00.000Z'
      }
    ])
  })
})

async function expectSafetyBlocked(targetPath: string, allowedRoot: string, homeDir: string, reasonKey: string): Promise<void> {
  const result = await runSafetyGate({ targetPath, allowedRoot, homeDir })
  expect(result.allowed).toBe(false)
  expect(result.blockReasonKey).toBe(reasonKey)
}

async function makeHome(): Promise<string> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-safety-'))
  tempRoots.push(homeDir)
  await fs.mkdir(path.join(homeDir, 'Library', 'Caches'), { recursive: true })
  return homeDir
}
