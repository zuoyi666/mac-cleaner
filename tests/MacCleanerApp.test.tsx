// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MacCleanerApp } from '../src/renderer/src/MacCleanerApp'
import { demoSummary } from '../src/renderer/src/demoApi'
import type {
  AppLanguage,
  CleanupCandidate,
  CleanupPreview,
  LocalUpdateProgress,
  LocalUpdateStatus,
  MacCleanerApi,
  ScanSummary,
  ThemePreference
} from '../src/shared/types'

const currentUpdateStatus: LocalUpdateStatus = {
  state: 'current',
  updateAvailable: false,
  currentVersion: '0.10.0',
  latestVersion: '0.10.0',
  repoPath: '/Users/yizuo/Mac-Cleaner',
  installTarget: '/Users/yizuo/Desktop/Mac Cleaner.app',
  currentBranch: 'codex/reliability-upgrades',
  upstream: 'origin/codex/reliability-upgrades',
  localCommit: 'local',
  remoteCommit: 'local',
  remoteUrl: 'https://github.com/zuoyi666/mac-cleaner.git',
  dirty: false,
  message: '当前本机代码已与 GitHub 同步。',
  messageKey: 'localUpdate.status.current',
  checkedAt: new Date().toISOString()
}

const revealOk = {
  ok: true,
  targetKind: 'directory',
  method: 'open-path',
  message: '已在 Finder 中打开目录。',
  messageKey: 'main.revealOpenedDirectory'
} as const

function makeApi(overrides: Partial<MacCleanerApi> = {}): MacCleanerApi {
  return {
    scan: vi.fn().mockResolvedValue(demoSummary),
    cancelScan: vi.fn().mockResolvedValue(undefined),
    cleanupPreview: vi.fn(),
    moveToTrash: vi.fn(),
    previewRecommendationAction: vi.fn(),
    runRecommendationAction: vi.fn(),
    revealPath: vi.fn().mockResolvedValue(revealOk),
    openFullDiskAccessSettings: vi.fn().mockResolvedValue({
      ok: true,
      targetKind: 'unknown',
      method: 'none',
      message: '已打开 macOS 隐私设置。',
      messageKey: 'main.fullDiskAccessOpened'
    }),
    checkForLocalUpdate: vi.fn().mockResolvedValue(currentUpdateStatus),
    runLocalSourceUpdate: vi.fn().mockResolvedValue({
      updated: false,
      previousVersion: '0.10.0',
      currentVersion: '0.10.0',
      installedPath: currentUpdateStatus.installTarget,
      needsRelaunch: false,
      message: '当前已经是最新版本。',
      messageKey: 'localUpdate.result.noUpdate'
    }),
    configureLocalUpdate: vi.fn().mockResolvedValue({
      repoPath: currentUpdateStatus.repoPath,
      installTarget: currentUpdateStatus.installTarget
    }),
    getLanguagePreference: vi.fn().mockResolvedValue(null),
    setLanguagePreference: vi.fn().mockImplementation(async (language: AppLanguage) => language),
    getThemePreference: vi.fn().mockResolvedValue(null),
    setThemePreference: vi.fn().mockImplementation(async (themePreference: ThemePreference) => themePreference),
    onScanProgress: vi.fn(() => () => undefined),
    onLocalUpdateProgress: vi.fn(() => () => undefined),
    ...overrides
  }
}

describe('MacCleanerApp', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    localStorage.clear()
    localStorage.setItem('mac-cleaner-language', 'zh-CN')
  })

  it('shows scan results and requires confirmation before cleanup', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const firstCandidate = demoSummary.candidates[0]
    const preview: CleanupPreview = {
      candidateIds: [firstCandidate.id],
      confirmationId: 'confirm-1',
      scanId: demoSummary.scanId,
      pathSnapshotHash: firstCandidate.pathSnapshotHash,
      title: firstCandidate.title,
      totalBytes: firstCandidate.sizeBytes,
      pathCount: 1,
      pathSamples: [firstCandidate.pathPreview],
      operationPaths: [firstCandidate.pathPreview],
      trustReport: {
        summary: '我的判断：这 1 个项目命中固定安全清理规则。',
        evidence: [
          { label: '来自本次扫描', detail: '只接受扫描生成的候选 ID。', tone: 'safe' },
          { label: '路径快照已绑定', detail: '路径变化会拒绝执行。', tone: 'safe' }
        ],
        guarantees: [
          { label: '只移到废纸篓', detail: '不会永久删除。', tone: 'safe' }
        ],
        exclusions: [
          { label: '不会碰清单外路径', detail: '不会处理其它路径。', tone: 'blocked' }
        ],
        recovery: '清倒废纸篓前可以恢复。'
      },
      impact: firstCandidate.impact,
      explanation: firstCandidate.explanation,
      warning: '确认后会将这些项目移到废纸篓，不会永久删除。',
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    }
    const api: MacCleanerApi = {
      scan: vi.fn().mockResolvedValue(demoSummary),
      cancelScan: vi.fn().mockResolvedValue(undefined),
      cleanupPreview: vi.fn().mockResolvedValue(preview),
      moveToTrash: vi.fn().mockResolvedValue({
        candidateIds: [firstCandidate.id],
        cleanedBytes: firstCandidate.sizeBytes,
        successCount: 1,
        verifiedRemovedCount: 1,
        trashBeforeBytes: demoSummary.trash.sizeBytes,
        trashAfterBytes: demoSummary.trash.sizeBytes + firstCandidate.sizeBytes,
        trashDeltaBytes: firstCandidate.sizeBytes,
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }),
      previewRecommendationAction: vi.fn(),
      runRecommendationAction: vi.fn(),
      revealPath: vi.fn().mockResolvedValue(revealOk),
      openFullDiskAccessSettings: vi.fn().mockResolvedValue({
        ok: true,
        targetKind: 'unknown',
        method: 'none',
        message: '已打开 macOS 隐私设置。',
        messageKey: 'main.fullDiskAccessOpened'
      }),
      checkForLocalUpdate: vi.fn().mockResolvedValue(currentUpdateStatus),
      runLocalSourceUpdate: vi.fn().mockResolvedValue({
        updated: false,
        previousVersion: '0.10.0',
        currentVersion: '0.10.0',
        installedPath: currentUpdateStatus.installTarget,
        needsRelaunch: false,
        message: '当前已经是最新版本。',
        messageKey: 'localUpdate.result.noUpdate'
      }),
      configureLocalUpdate: vi.fn().mockResolvedValue({
        repoPath: currentUpdateStatus.repoPath,
        installTarget: currentUpdateStatus.installTarget
      }),
      getLanguagePreference: vi.fn().mockResolvedValue(null),
      setLanguagePreference: vi.fn().mockImplementation(async (language: AppLanguage) => language),
      getThemePreference: vi.fn().mockResolvedValue(null),
      setThemePreference: vi.fn().mockImplementation(async (themePreference: ThemePreference) => themePreference),
      onScanProgress: vi.fn(() => () => undefined),
      onLocalUpdateProgress: vi.fn(() => () => undefined)
    }

    render(<MacCleanerApp api={api} initialSummary={null} />)

    await user.click(screen.getByRole('button', { name: /扫描存储空间/ }))
    expect(await screen.findByText('扫描总结')).toBeInTheDocument()
    expect(screen.getAllByText('空间健康').length).toBeGreaterThan(0)
    expect(screen.getByText('处理分组')).toBeInTheDocument()
    expect(screen.getByText('判断依据')).toBeInTheDocument()
    expect(screen.getByText('我明确不会碰')).toBeInTheDocument()
    expect(await screen.findAllByText('高价值发现')).not.toHaveLength(0)
    expect(screen.getAllByText(/Git 临时垃圾/)).not.toHaveLength(0)
    expect(screen.getAllByText(/不删除整个 \.git/)).not.toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /安心清理/ }))
    expect(await screen.findAllByText('我建议清理')).not.toHaveLength(0)
    expect(screen.getAllByText('先看说明')).not.toHaveLength(0)
    expect(screen.getByText('安全清理控制台')).toBeInTheDocument()
    expect(screen.getByText('我的建议')).toBeInTheDocument()
    expect(screen.getByText('能不能删')).toBeInTheDocument()
    expect(screen.getByText('处理后会怎样')).toBeInTheDocument()
    expect(screen.getAllByText(/可重建|开发工具缓存/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: `在 Finder 中显示: ${firstCandidate.title}` }))
    expect(api.revealPath).toHaveBeenCalledWith(firstCandidate.pathToken)
    expect(await screen.findByText('已在 Finder 中打开目录。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `移到废纸篓: ${firstCandidate.title}` }))
    expect(api.cleanupPreview).toHaveBeenCalledWith([firstCandidate.id], 'zh-CN')
    expect(await screen.findByRole('dialog', { name: /清理前信任确认/ })).toBeInTheDocument()
    expect(screen.getByText('只移动到废纸篓')).toBeInTheDocument()
    expect(screen.getByText('为什么我认为可以这样处理')).toBeInTheDocument()
    expect(screen.getByText('本次将移动的完整入口路径')).toBeInTheDocument()
    expect(screen.getByText('不会碰清单外路径')).toBeInTheDocument()
    expect(screen.getAllByText('什么情况先保留').length).toBeGreaterThan(0)
    expect(screen.getAllByText('扫描内项目数').length).toBeGreaterThan(0)
    expect(api.moveToTrash).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /复制给 Codex 复核/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(firstCandidate.pathPreview))
    expect(await screen.findByText(/已复制复核报告/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /我已看懂，移到废纸篓/ }))

    await waitFor(() => {
      expect(api.moveToTrash).toHaveBeenCalledWith([firstCandidate.id], 'confirm-1', 'zh-CN')
    })
  })

  it('can select multiple cleanable rows before opening one confirmation', async () => {
    const user = userEvent.setup()
    const candidates = demoSummary.candidates.slice(0, 2)
    const api: MacCleanerApi = {
      scan: vi.fn().mockResolvedValue(demoSummary),
      cancelScan: vi.fn().mockResolvedValue(undefined),
      cleanupPreview: vi.fn().mockResolvedValue({
        candidateIds: candidates.map((candidate) => candidate.id),
        confirmationId: 'batch-confirm',
        scanId: demoSummary.scanId,
        pathSnapshotHash: 'batch-hash',
        title: '2 个清理项目',
        totalBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples: candidates.map((candidate) => candidate.pathPreview),
        impact: '批量清理影响说明',
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      }),
      moveToTrash: vi.fn().mockResolvedValue({
        candidateIds: candidates.map((candidate) => candidate.id),
        cleanedBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        successCount: 2,
        verifiedRemovedCount: 2,
        trashBeforeBytes: demoSummary.trash.sizeBytes,
        trashAfterBytes: demoSummary.trash.sizeBytes + candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        trashDeltaBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }),
      previewRecommendationAction: vi.fn(),
      runRecommendationAction: vi.fn(),
      revealPath: vi.fn().mockResolvedValue(revealOk),
      openFullDiskAccessSettings: vi.fn().mockResolvedValue({
        ok: true,
        targetKind: 'unknown',
        method: 'none',
        message: '已打开 macOS 隐私设置。',
        messageKey: 'main.fullDiskAccessOpened'
      }),
      checkForLocalUpdate: vi.fn().mockResolvedValue(currentUpdateStatus),
      runLocalSourceUpdate: vi.fn().mockResolvedValue({
        updated: false,
        previousVersion: '0.10.0',
        currentVersion: '0.10.0',
        installedPath: currentUpdateStatus.installTarget,
        needsRelaunch: false,
        message: '当前已经是最新版本。',
        messageKey: 'localUpdate.result.noUpdate'
      }),
      configureLocalUpdate: vi.fn().mockResolvedValue({
        repoPath: currentUpdateStatus.repoPath,
        installTarget: currentUpdateStatus.installTarget
      }),
      getLanguagePreference: vi.fn().mockResolvedValue(null),
      setLanguagePreference: vi.fn().mockImplementation(async (language: AppLanguage) => language),
      getThemePreference: vi.fn().mockResolvedValue(null),
      setThemePreference: vi.fn().mockImplementation(async (themePreference: ThemePreference) => themePreference),
      onScanProgress: vi.fn(() => () => undefined),
      onLocalUpdateProgress: vi.fn(() => () => undefined)
    }

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: /安心清理/ }))
    await user.click(screen.getByRole('button', { name: /选择可清理项/ }))
    await user.click(screen.getByRole('button', { name: /批量确认/ }))

    expect(api.cleanupPreview).toHaveBeenCalledWith(expect.arrayContaining(candidates.map((candidate) => candidate.id)), 'zh-CN')
    expect(await screen.findByRole('dialog', { name: /清理前信任确认/ })).toBeInTheDocument()
  })

  it('surfaces Finder reveal failures instead of doing a silent no-op', async () => {
    const user = userEvent.setup()
    const firstCandidate = demoSummary.candidates[0]
    const api = makeApi({
      revealPath: vi.fn().mockResolvedValue({
        ok: false,
        targetKind: 'missing',
        method: 'none',
        message: '该位置已经不存在，请重新扫描。',
        messageKey: 'main.revealMissing'
      })
    })

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: /安心清理/ }))
    await user.click(screen.getByRole('button', { name: `在 Finder 中显示: ${firstCandidate.title}` }))

    expect(api.revealPath).toHaveBeenCalledWith(firstCandidate.pathToken)
    expect(await screen.findByText('该位置已经不存在，请重新扫描。')).toBeInTheDocument()
  })

  it('marks permission-blocked items as not recommended without requesting access', async () => {
    const user = userEvent.setup()
    const blockedCandidate: CleanupCandidate = {
      ...demoSummary.candidates[0],
      id: 'blocked-private-cache',
      title: '受限目录',
      categoryId: 'blocked',
      categoryName: '权限受限目录',
      categoryNameKey: undefined,
      kind: 'blocked',
      safety: 'discouraged',
      canClean: false,
      sizeBytes: 0,
      itemCount: 0,
      pathCount: 0,
      pathPreview: '~/Library/Private',
      pathSamples: ['~/Library/Private'],
      pathToken: 'blocked-token',
      pathSnapshotHash: 'blocked-hash',
      estimateSource: 'blocked',
      reason: '权限状态无法确认。',
      reasonKey: undefined,
      impact: '应用不会尝试绕过 macOS 权限，也不会清理无法确认安全性的路径。',
      impactKey: 'candidate.blocked.impact',
      explanation: {
        summary: '这个位置现在看不清，Mac Cleaner 不会帮你删。',
        summaryKey: 'candidate.blocked.explanation.summary',
        what: '这是扫描时遇到的受限位置或异常目录：无法访问该目录：EPERM',
        whatKey: 'candidate.blocked.explanation.what',
        whatParams: { reason: '无法访问该目录：EPERM' },
        cleanability: '不要一键删。工具无法确认它是不是安全缓存。',
        cleanabilityKey: 'candidate.blocked.explanation.cleanability',
        afterAction: '这里不会进入清理流程，因此不会移动或修改任何文件。',
        afterActionKey: 'candidate.blocked.explanation.afterAction',
        keepAdvice: '如果你想了解空间占用，可以授权后重新扫描；不授权也不影响其它安全项清理。',
        keepAdviceKey: 'candidate.blocked.explanation.keepAdvice',
        nextStep: '只把它当作提示看，优先处理上方明确安全的候选项。',
        nextStepKey: 'candidate.blocked.explanation.nextStep'
      },
      actionLabel: '不可清理',
      actionLabelKey: 'candidate.blocked.action',
      blockedReason: '无法访问该目录：EPERM',
      blockedReasonKey: 'blocked.cannotAccessDir',
      blockedReasonParams: { error: 'EPERM' }
    }
    const blockedSummary: ScanSummary = {
      ...demoSummary,
      totalCleanableBytes: 0,
      categories: [
        {
          id: 'blocked',
          name: '权限受限目录',
          description: '无法确认安全性的目录',
          sizeBytes: 0,
          candidateCount: 1,
          safetyBreakdown: { safe: 0, confirm: 0, discouraged: 1 }
        }
      ],
      candidates: [blockedCandidate],
      issues: [
        {
          id: 'blocked-issue',
          path: '~/Library/Private',
          message: '无法访问：EPERM',
          messageKey: 'issue.cannotAccess',
          messageParams: { error: 'EPERM' },
          severity: 'warning'
        }
      ]
    }

    render(<MacCleanerApp api={makeApi()} initialSummary={blockedSummary} />)
    await screen.findByText('已是最新')

    await user.click(screen.getByRole('button', { name: /安心清理/ }))
    expect(screen.getAllByText('不要一键删')).not.toHaveLength(0)
    expect(screen.getByText('权限与安全边界')).toBeInTheDocument()
    expect(screen.getByText(/不会申请管理员权限/)).toBeInTheDocument()
    expect(screen.getByText(/不会进入自动清理流程/)).toBeInTheDocument()
    screen.getAllByRole('button', { name: /不可清理/ }).forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('shows the storage map separately without cleanup actions for insights', async () => {
    const user = userEvent.setup()

    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: /空间地图/ }))

    expect(screen.getAllByText('Applications')).not.toHaveLength(0)
    expect(screen.getAllByText('不建议自动清理')).not.toHaveLength(0)
    expect(screen.getByText(/空间地图只负责解释和定位/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /移到废纸篓: Applications/ })).not.toBeInTheDocument()
  })

  it('opens the Full Disk Access guide from grouped permission issues', async () => {
    const user = userEvent.setup()
    const api = makeApi()
    const multiIssueSummary: ScanSummary = {
      ...demoSummary,
      issues: [
        ...demoSummary.issues,
        {
          id: 'demo-symlink-issue',
          path: '~/Library/Caches/Homebrew/ffmpeg--8.1.1',
          message: '跳过符号链接。',
          messageKey: 'issue.skipSymlink',
          severity: 'warning'
        }
      ],
      issueGroups: [
        ...demoSummary.issueGroups,
        {
          id: 'issue-group-symlink',
          kind: 'symlink',
          title: '1 个符号链接已跳过',
          titleKey: 'issueGroup.symlink.title',
          message: '符号链接可能指向其它位置，工具不会跟随它们跨出安全边界。',
          messageKey: 'issueGroup.symlink.message',
          messageParams: { count: 1 },
          severity: 'warning',
          count: 1,
          pathSamples: ['~/Library/Caches/Homebrew/ffmpeg--8.1.1']
        }
      ]
    }

    render(<MacCleanerApp api={api} initialSummary={multiIssueSummary} />)

    const issueSummary = screen.getByText(/2 个目录因权限/)
    await user.click(issueSummary)

    const issueDetails = issueSummary.closest('details')
    expect(issueDetails).toHaveClass('issue-details')
    expect(issueDetails).toHaveAttribute('open')
    expect(screen.getByRole('region', { name: '可滚动的扫描问题详情' })).toHaveClass('issue-details-body')
    expect(screen.getByRole('region', { name: '可滚动的扫描问题详情' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/上下滚动/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /开启 Full Disk Access/ }))

    expect(api.openFullDiskAccessSettings).toHaveBeenCalled()
    expect(await screen.findByText(/已打开 macOS 隐私设置/)).toBeInTheDocument()
  })

  it('does not keep showing the Full Disk Access enable button after access appears granted', async () => {
    const user = userEvent.setup()
    const api = makeApi()
    const grantedSummary: ScanSummary = {
      ...demoSummary,
      coverage: {
        ...demoSummary.coverage,
        fullDiskAccessStatus: 'likely-granted'
      }
    }

    render(<MacCleanerApp api={api} initialSummary={grantedSummary} />)

    await user.click(screen.getByText(/1 个目录因权限/))

    expect(screen.queryByRole('button', { name: /开启 Full Disk Access/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Full Disk Access 看起来已开启/)).toBeInTheDocument()
    expect(api.openFullDiskAccessSettings).not.toHaveBeenCalled()
  })

  it('switches the current UI to English without rescanning', async () => {
    const user = userEvent.setup()
    const firstCandidate = demoSummary.candidates[0]
    const api = makeApi({
      cleanupPreview: vi.fn().mockResolvedValue({
        candidateIds: [firstCandidate.id],
        confirmationId: 'english-confirm',
        scanId: demoSummary.scanId,
        pathSnapshotHash: firstCandidate.pathSnapshotHash,
        title: firstCandidate.title,
        totalBytes: firstCandidate.sizeBytes,
        pathCount: firstCandidate.pathCount,
        pathSamples: [firstCandidate.pathPreview],
        impact: firstCandidate.impact,
        impactKey: firstCandidate.impactKey,
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。',
        warningKey: 'cleanup.warning',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    })

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: 'English' }))

    await waitFor(() => {
      expect(api.setLanguagePreference).toHaveBeenCalledWith('en-US')
    })
    expect(localStorage.getItem('mac-cleaner-language')).toBe('en-US')
    expect(screen.getByRole('button', { name: /Scan Storage/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Safe Cleanup/ }))
    expect(screen.getAllByText('Recommended Cleanup')).not.toHaveLength(0)
    expect(screen.getAllByText('Review First')).not.toHaveLength(0)
    expect(screen.getByText('My recommendation')).toBeInTheDocument()
    expect(screen.getByText('Can it be removed?')).toBeInTheDocument()
    expect(screen.getAllByText(/Regeneratable|Developer cache/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: `Move to Trash: ${firstCandidate.title}` }))

    expect(await screen.findByRole('dialog', { name: /Trust Check Before Cleanup/ })).toBeInTheDocument()
    expect(screen.getByText(/Trash only/)).toBeInTheDocument()
  })

  it('uses the installer-provided initial language before legacy localStorage', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?initialLanguage=en-US')
    localStorage.setItem('mac-cleaner-language', 'zh-CN')

    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)

    expect(await screen.findByText('Up to date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan Storage/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Safe Cleanup/ }))
    expect(screen.getAllByText('Recommended Cleanup')).not.toHaveLength(0)
  })

  it('shows theme choices and defaults to Aurora Light', async () => {
    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)

    expect(await screen.findByText('已是最新')).toBeInTheDocument()
    const themePicker = screen.getByRole('radiogroup', { name: '皮肤主题' })

    expect(themePicker).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '极光浅色' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radio', { name: '跟随系统' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '黑客终端' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '霓虹夜城' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '日光极简' })).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('aurora-light')
  })

  it('switches theme immediately without rescanning or changing selected cleanup state', async () => {
    const user = userEvent.setup()
    const api = makeApi()

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: /安心清理/ }))
    await user.click(screen.getByRole('radio', { name: '黑客终端' }))

    await waitFor(() => {
      expect(api.setThemePreference).toHaveBeenCalledWith('hacker-dark')
    })
    expect(localStorage.getItem('mac-cleaner-theme-preference')).toBe('hacker-dark')
    expect(document.documentElement.dataset.theme).toBe('hacker-dark')
    expect(api.scan).not.toHaveBeenCalled()
    expect(screen.getAllByText('Xcode DerivedData')).not.toHaveLength(0)

    await user.click(screen.getByRole('radio', { name: '日光极简' }))
    expect(document.documentElement.dataset.theme).toBe('solar-minimal')
  })

  it('uses the installer-provided initial theme before legacy localStorage', async () => {
    window.history.replaceState(null, '', '/?initialThemePreference=neon-night')
    localStorage.setItem('mac-cleaner-theme-preference', 'solar-minimal')

    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)

    expect(await screen.findByText('已是最新')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '霓虹夜城' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('neon-night')
  })

  it('falls back to Aurora when an old system preference is stored', async () => {
    localStorage.setItem('mac-cleaner-theme-preference', 'system')

    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)

    expect(await screen.findByText('已是最新')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '极光浅色' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('aurora-light')
  })

  it('falls back to Aurora when an old graphite URL preference is provided', async () => {
    window.history.replaceState(null, '', '/?initialThemePreference=graphite-pro')
    render(<MacCleanerApp api={makeApi()} initialSummary={demoSummary} />)
    expect(await screen.findByText('已是最新')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '极光浅色' })).toHaveAttribute('aria-checked', 'true')
  })

  it('does not silently show demo cleanup candidates when the native bridge is missing', async () => {
    render(<MacCleanerApp />)

    expect(await screen.findByText(/本地文件系统桥接未加载/)).toBeInTheDocument()
    expect(screen.queryByText('DesignTool-4.2.1.dmg')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /扫描存储空间/ })).toBeDisabled()
  })

  it('only shows demo candidates when preview mode is explicit', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/?demo=1')

    render(<MacCleanerApp />)

    await user.click(await screen.findByRole('button', { name: /安心清理/ }))
    expect(await screen.findByText('DesignTool-4.2.1.dmg')).toBeInTheDocument()
    expect(screen.getByText(/浏览器预览模式/)).toBeInTheDocument()
  })

  it('shows local update availability and requires confirmation before syncing', async () => {
    const user = userEvent.setup()
    const availableStatus: LocalUpdateStatus = {
      ...currentUpdateStatus,
      state: 'available',
      updateAvailable: true,
      latestVersion: '0.10.1',
      remoteCommit: 'remote',
      message: 'GitHub 上有新提交可同步。',
      messageKey: 'localUpdate.status.available'
    }
    const api: MacCleanerApi = {
      scan: vi.fn().mockResolvedValue(demoSummary),
      cancelScan: vi.fn().mockResolvedValue(undefined),
      cleanupPreview: vi.fn(),
      moveToTrash: vi.fn(),
      previewRecommendationAction: vi.fn(),
      runRecommendationAction: vi.fn(),
      revealPath: vi.fn().mockResolvedValue(revealOk),
      openFullDiskAccessSettings: vi.fn().mockResolvedValue({
        ok: true,
        targetKind: 'unknown',
        method: 'none',
        message: '已打开 macOS 隐私设置。',
        messageKey: 'main.fullDiskAccessOpened'
      }),
      checkForLocalUpdate: vi.fn().mockResolvedValue(availableStatus),
      runLocalSourceUpdate: vi.fn().mockResolvedValue({
        updated: true,
        previousVersion: '0.10.0',
        currentVersion: '0.10.1',
        installedPath: availableStatus.installTarget,
        needsRelaunch: true,
        message: '已同步到 0.10.1，即将重启。',
        messageKey: 'localUpdate.result.updated',
        messageParams: { currentVersion: '0.10.1' }
      }),
      configureLocalUpdate: vi.fn().mockResolvedValue({
        repoPath: availableStatus.repoPath,
        installTarget: availableStatus.installTarget
      }),
      getLanguagePreference: vi.fn().mockResolvedValue(null),
      setLanguagePreference: vi.fn().mockImplementation(async (language: AppLanguage) => language),
      getThemePreference: vi.fn().mockResolvedValue(null),
      setThemePreference: vi.fn().mockImplementation(async (themePreference: ThemePreference) => themePreference),
      onScanProgress: vi.fn(() => () => undefined),
      onLocalUpdateProgress: vi.fn(() => () => undefined)
    }

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    expect(await screen.findByText(/GitHub 上有新的 Mac Cleaner 版本/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /同步并安装/ })[0])
    expect(await screen.findByRole('dialog', { name: /确认同步并安装/ })).toBeInTheDocument()
    expect(api.runLocalSourceUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /确认同步并重启/ }))

    await waitFor(() => {
      expect(api.runLocalSourceUpdate).toHaveBeenCalledWith('zh-CN')
    })
  })

  it('replaces stale update progress after a completed current-version check', async () => {
    const user = userEvent.setup()
    let progressListener: ((progress: LocalUpdateProgress) => void) | undefined
    const api = makeApi({
      onLocalUpdateProgress: vi.fn((listener) => {
        progressListener = listener
        return () => undefined
      })
    })

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    expect(await screen.findByText(/检查完成：当前已经是最新版本/)).toBeInTheDocument()

    act(() => {
      progressListener?.({
        stage: 'fetching',
        message: '正在获取远端提交',
        messageKey: 'localUpdate.progress.fetching'
      })
    })
    expect(screen.getByText(/正在获取远端提交/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /检查更新/ }))

    await waitFor(() => {
      expect(screen.getByText(/检查完成：当前已经是最新版本/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/正在获取远端提交/)).not.toBeInTheDocument()
  })
})
