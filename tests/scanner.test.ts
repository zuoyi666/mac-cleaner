import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanStorage } from '../src/main/services/scanner'

const tempRoots: string[] = []
const fixedNow = new Date('2026-05-05T12:00:00.000Z')

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('scanStorage', () => {
  it('measures allowlisted user cache directories and skips symlinks', async () => {
    const homeDir = await makeHome()
    const cacheDir = path.join(homeDir, 'Library', 'Caches', 'com.example.app')
    await writeSizedFile(path.join(cacheDir, 'cache.bin'), 128)
    await fs.symlink(os.tmpdir(), path.join(cacheDir, 'external-link'))

    const run = await scanStorage({ homeDir, now: fixedNow })
    const candidate = run.summary.candidates.find((item) => item.title === 'com.example.app')

    expect(candidate?.safety).toBe('safe')
    expect(candidate?.sizeBytes).toBe(128)
    expect(candidate?.pathPreview).toBe('~/Library/Caches/com.example.app')
    expect(run.summary.issues.some((issue) => issue.message.includes('符号链接'))).toBe(true)
  })

  it('only includes old installer and archive files from Downloads', async () => {
    const homeDir = await makeHome()
    const downloads = path.join(homeDir, 'Downloads')
    await writeSizedFile(path.join(downloads, 'OldInstaller.dmg'), 256, daysAgo(45))
    await writeSizedFile(path.join(downloads, 'RecentArchive.zip'), 512, daysAgo(3))
    await writeSizedFile(path.join(downloads, 'ImportantNotes.txt'), 1024, daysAgo(90))

    const run = await scanStorage({ homeDir, now: fixedNow })
    const titles = run.summary.candidates.map((candidate) => candidate.title)
    const oldInstaller = run.summary.candidates.find((candidate) => candidate.title === 'OldInstaller.dmg')

    expect(titles).toContain('OldInstaller.dmg')
    expect(titles).not.toContain('RecentArchive.zip')
    expect(titles).not.toContain('ImportantNotes.txt')
    expect(oldInstaller?.safety).toBe('confirm')
  })

  it('does not double count diagnostic reports as logs', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'Logs', 'app.log'), 64)
    await writeSizedFile(path.join(homeDir, 'Library', 'Logs', 'DiagnosticReports', 'app.crash'), 128)

    const run = await scanStorage({ homeDir, now: fixedNow })
    const logs = run.summary.categories.find((category) => category.id === 'logs')
    const diagnostics = run.summary.categories.find((category) => category.id === 'diagnostics')

    expect(run.summary.candidates.some((candidate) => candidate.categoryId === 'logs' && candidate.title === 'DiagnosticReports')).toBe(
      false
    )
    expect(logs?.sizeBytes).toBe(64)
    expect(diagnostics?.sizeBytes).toBe(128)
  })

  it('marks HTTPStorages candidates as requiring confirmation', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'HTTPStorages', 'com.example.webview', 'state.db'), 128)

    const run = await scanStorage({ homeDir, now: fixedNow })
    const candidate = run.summary.candidates.find((item) => item.categoryId === 'http-storage')

    expect(candidate?.safety).toBe('confirm')
    expect(candidate?.impact).toContain('重新登录')
  })

  it('can abort a scan before touching allowlisted roots', async () => {
    const homeDir = await makeHome()
    const controller = new AbortController()
    controller.abort()

    await expect(scanStorage({ homeDir, now: fixedNow, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('does not scan outside the fixed user-level allowlist', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Documents', 'ImportantArchive.dmg'), 2048, daysAgo(120))

    const run = await scanStorage({ homeDir, now: fixedNow })

    expect(run.summary.candidates.some((candidate) => candidate.pathPreview.includes('Documents'))).toBe(false)
  })
})

async function makeHome(): Promise<string> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-scan-'))
  tempRoots.push(homeDir)
  await Promise.all([
    fs.mkdir(path.join(homeDir, 'Library', 'Caches'), { recursive: true }),
    fs.mkdir(path.join(homeDir, 'Library', 'Logs'), { recursive: true }),
    fs.mkdir(path.join(homeDir, 'Library', 'HTTPStorages'), { recursive: true }),
    fs.mkdir(path.join(homeDir, 'Library', 'Saved Application State'), { recursive: true }),
    fs.mkdir(path.join(homeDir, 'Downloads'), { recursive: true }),
    fs.mkdir(path.join(homeDir, '.Trash'), { recursive: true })
  ])
  return homeDir
}

async function writeSizedFile(filePath: string, size: number, modifiedAt = fixedNow): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, Buffer.alloc(size, 1))
  await fs.utimes(filePath, modifiedAt, modifiedAt)
}

function daysAgo(days: number): Date {
  return new Date(fixedNow.getTime() - days * 24 * 60 * 60 * 1000)
}
