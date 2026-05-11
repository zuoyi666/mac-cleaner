import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanStorage } from '../src/main/services/scanner'

const tempRoots: string[] = []
const fixedNow = new Date('2026-05-05T12:00:00.000Z')

afterEach(async () => {
  vi.restoreAllMocks()
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

  it('reports a timed-out large directory once instead of flooding every child path', async () => {
    const homeDir = await makeHome()
    await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => writeSizedFile(path.join(homeDir, 'Library', 'Caches', 'deep-cache', `part-${index}.bin`), 128))
    )
    let nowMs = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      nowMs += 20_000
      return nowMs
    })

    const run = await scanStorage({ homeDir, now: fixedNow, mode: 'standard' })
    const timeoutGroup = run.summary.issueGroups.find((group) => group.kind === 'timeout')

    expect(timeoutGroup?.count).toBe(1)
    expect(timeoutGroup?.severity).toBe('info')
    expect(timeoutGroup?.pathSamples).toEqual(['~/Library/Caches/deep-cache'])
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

  it('groups multiple small same-risk cache entries while keeping large entries separate', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'Caches', 'small.one', 'cache.bin'), 64)
    await writeSizedFile(path.join(homeDir, 'Library', 'Caches', 'small.two', 'cache.bin'), 96)
    await writeSizedFile(path.join(homeDir, 'Library', 'Caches', 'large.app', 'cache.bin'), 101 * 1024 * 1024)

    const run = await scanStorage({ homeDir, now: fixedNow })
    const grouped = run.summary.candidates.find((candidate) => candidate.displayKind === 'group' && candidate.categoryId === 'caches')
    const large = run.summary.candidates.find((candidate) => candidate.title === 'large.app')

    expect(grouped?.title).toContain('小体积用户缓存')
    expect(grouped?.groupCount).toBe(2)
    expect(grouped?.sizeBytes).toBe(160)
    expect(grouped?.pathSamples).toHaveLength(2)
    expect(grouped?.explanation.summary).toContain('2 个同类小项目')
    expect(grouped?.explanation.summaryParams).toMatchObject({ count: 2 })
    expect(large?.displayKind).toBe('single')
    expect(large?.sizeBytes).toBe(101 * 1024 * 1024)
  })

  it('adds complete human explanations to cleanup candidates', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'Caches', 'com.example.cache', 'cache.bin'), 128)
    await writeSizedFile(path.join(homeDir, 'Library', 'Logs', 'example.log'), 128)
    await writeSizedFile(path.join(homeDir, 'Library', 'Logs', 'DiagnosticReports', 'example.crash'), 128)
    await writeSizedFile(path.join(homeDir, 'Library', 'HTTPStorages', 'com.example.webview', 'state.db'), 128)
    await writeSizedFile(path.join(homeDir, 'Library', 'Saved Application State', 'com.example.savedState', 'state.bin'), 128)
    await writeSizedFile(path.join(homeDir, 'Downloads', 'OldTool.pkg'), 128, daysAgo(45))
    await writeSizedFile(path.join(homeDir, 'Library', 'Developer', 'Xcode', 'DerivedData', 'DemoApp', 'build.bin'), 128)

    const run = await scanStorage({ homeDir, now: fixedNow })
    const expectedKinds = new Set(['cache', 'log', 'diagnostic', 'http-storage', 'saved-state', 'download-archive', 'developer-cache'])

    for (const kind of expectedKinds) {
      const candidate = run.summary.candidates.find((item) => item.kind === kind)
      expect(candidate?.explanation.summary).toBeTruthy()
      expect(candidate?.explanation.what).toBeTruthy()
      expect(candidate?.explanation.cleanability).toBeTruthy()
      expect(candidate?.explanation.afterAction).toBeTruthy()
      expect(candidate?.explanation.keepAdvice).toBeTruthy()
      expect(candidate?.explanation.nextStep).toBeTruthy()
      expect(candidate?.explanation.summaryKey).toContain('.explanation.summary')
    }
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

  it('returns English category and candidate text when requested', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'HTTPStorages', 'com.example.webview', 'state.db'), 128)

    const run = await scanStorage({ homeDir, now: fixedNow, language: 'en-US' })
    const category = run.summary.categories.find((item) => item.id === 'http-storage')
    const candidate = run.summary.candidates.find((item) => item.categoryId === 'http-storage')

    expect(category?.name).toBe('Web Cache Storage')
    expect(category?.nameKey).toBe('category.http-storage.name')
    expect(candidate?.categoryName).toBe('Web Cache Storage')
    expect(candidate?.reason).toContain('web-view data')
    expect(candidate?.impact).toContain('sign in again')
    expect(candidate?.explanation.summary).toContain('Web storage')
    expect(candidate?.explanation.keepAdvice).toContain('every day')
    expect(candidate?.actionLabel).toBe('Review and Move to Trash')
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

  it('adds large user content to the storage map without making it cleanable', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Documents', 'LargeProject.mov'), 60 * 1024 * 1024, daysAgo(10))

    const run = await scanStorage({ homeDir, now: fixedNow, mode: 'comprehensive' })
    const insight = run.summary.insights.find((item) => item.pathPreview === '~/Documents')

    expect(insight?.risk).toBe('review')
    expect(insight?.recommendationKey).toBe('insight.userContent.recommendation')
    expect(insight?.explanation.summary).toContain('个人文件')
    expect(insight?.explanation.cleanability).toContain('不要一键删')
    expect(run.summary.candidates.some((candidate) => candidate.pathPreview.includes('Documents'))).toBe(false)
    expect(run.summary.coverage.mode).toBe('comprehensive')
    expect(run.summary.coverage.fullDiskAccessStatus).toBe('unknown')
  })

  it('groups scan issues and keeps permission-limited paths out of cleanup', async () => {
    const homeDir = await makeHome()
    const blockedDir = path.join(homeDir, 'Library', 'Caches', 'PrivateCache')
    await writeSizedFile(path.join(blockedDir, 'secret.bin'), 128)
    await fs.chmod(blockedDir, 0o000)

    try {
      const run = await scanStorage({ homeDir, now: fixedNow, mode: 'comprehensive' })
      const permissionGroup = run.summary.issueGroups.find((group) => group.kind === 'permission')

      expect(permissionGroup?.count).toBeGreaterThan(0)
      expect(run.summary.candidates.every((candidate) => candidate.pathPreview !== '~/Library/Caches/PrivateCache')).toBe(true)
    } finally {
      await fs.chmod(blockedDir, 0o755).catch(() => undefined)
    }
  })

  it('adds regeneratable developer caches as safe cleanup candidates', async () => {
    const homeDir = await makeHome()
    await writeSizedFile(path.join(homeDir, 'Library', 'Developer', 'Xcode', 'DerivedData', 'DemoApp', 'build.bin'), 512)

    const run = await scanStorage({ homeDir, now: fixedNow })
    const candidate = run.summary.candidates.find((item) => item.categoryId === 'developer-caches')

    expect(candidate?.safety).toBe('safe')
    expect(candidate?.kind).toBe('developer-cache')
    expect(candidate?.reasonKey).toBe('candidate.developer-cache.reason')
  })

  it('adds high-value read-only recommendations for Git, Xcode, and Codex data', async () => {
    const homeDir = await makeHome()
    await writeSparseFile(path.join(homeDir, 'worldquant-alpha', '.git', 'objects', 'pack', 'tmp_pack_demo'), 300 * 1024 * 1024)
    await writeSparseFile(path.join(homeDir, 'Library', 'Developer', 'XCTestDevices', 'device.bin'), 140 * 1024 * 1024)
    await writeSparseFile(path.join(homeDir, '.codex', 'sessions', 'old-session.jsonl'), 160 * 1024 * 1024)

    const run = await scanStorage({ homeDir, now: fixedNow, mode: 'comprehensive' })
    const git = run.summary.recommendations.find((item) => item.kind === 'git-garbage')
    const xcode = run.summary.recommendations.find((item) => item.kind === 'xcode-simulator-cache')
    const codex = run.summary.recommendations.find((item) => item.kind === 'codex-history')

    expect(git?.pathPreview).toBe('~/worldquant-alpha/.git/objects')
    expect(git?.recommendedAction).toBe('run-safe-tool')
    expect(git?.canExecute).toBe(false)
    expect(git?.decision).toBe('manual-tool')
    expect(git?.confidence).toBe('medium')
    expect(git?.evidence.some((item) => item.labelKey === 'advisor.evidence.knownPattern.label')).toBe(true)
    expect(git?.doNotTouch.some((item) => item.labelKey === 'advisor.exclusion.gitRoot.label')).toBe(true)
    expect(git?.explanation.cleanability).toContain('不要用清理工具直接删整个 .git')
    expect(xcode?.recommendationKey).toBe('recommendation.xctestDevices.recommendation')
    expect(codex?.explanation.afterAction).toContain('旧对话')
    expect(['healthy', 'low-space', 'critical']).toContain(run.summary.brief.urgency)
    expect(run.summary.brief.summaryKey).toBe(`scanBrief.summary.${run.summary.brief.urgency}`)
    expect(run.summary.brief.topRecommendationIds).toContain(git?.id)
    expect(run.summary.brief.buckets.find((bucket) => bucket.kind === 'manual-tool')?.recommendationIds).toContain(git?.id)
    expect(run.summary.recommendations[0]?.priorityScore).toBeGreaterThanOrEqual(run.summary.recommendations[1]?.priorityScore ?? 0)
    expect(run.summary.candidates.some((candidate) => candidate.pathPreview.includes('.git'))).toBe(false)
  })

  it('keeps ordinary large user content out of automatic cleanup', async () => {
    const homeDir = await makeHome()
    await writeSparseFile(path.join(homeDir, 'Documents', 'family-archive.mov'), 600 * 1024 * 1024)

    const run = await scanStorage({ homeDir, now: fixedNow, mode: 'comprehensive' })

    expect(run.summary.candidates.some((candidate) => candidate.pathPreview.includes('family-archive.mov'))).toBe(false)
    expect(run.summary.insights.some((insight) => insight.pathPreview.includes('Documents'))).toBe(true)
    expect(run.summary.recommendations.every((recommendation) => recommendation.pathPreview !== '~/Documents/family-archive.mov')).toBe(true)
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

async function writeSparseFile(filePath: string, size: number, modifiedAt = fixedNow): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, '')
  await fs.truncate(filePath, size)
  await fs.utimes(filePath, modifiedAt, modifiedAt)
}

function daysAgo(days: number): Date {
  return new Date(fixedNow.getTime() - days * 24 * 60 * 60 * 1000)
}
