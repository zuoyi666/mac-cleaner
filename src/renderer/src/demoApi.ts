import type {
  AppLanguage,
  CleanupCandidate,
  CleanupPreview,
  CleanupResult,
  CleanupTrustReport,
  HumanExplanation,
  LocalUpdateConfig,
  LocalUpdateProgress,
  LocalUpdateStatus,
  MacCleanerApi,
  ProtectedPath,
  ScanProgress,
  ScanRequest,
  ScanSummary,
  StorageRecommendation,
  ThemePreference
} from '../../shared/types'
import { t } from '../../shared/i18n'

const now = new Date('2026-05-05T10:00:00.000Z').toISOString()
const demoScanId = 'demo-scan-2026-05-05'

export const demoSummary: ScanSummary = {
  scanId: demoScanId,
  scannedAt: now,
  homeDir: '/Users/yizuo',
  disk: {
    mountPath: '/',
    totalBytes: 994_662_584_320,
    usedBytes: 703_441_219_584,
    availableBytes: 291_221_364_736
  },
  totalCleanableBytes: 25_970_597_888,
  brief: {
    urgency: 'healthy',
    summary: t('zh-CN', 'scanBrief.summary.healthy', {
      total: '927 GB',
      usedPercent: 71,
      available: '271 GB',
      safe: '18 GB',
      confirm: '7.8 GB',
      topCount: 3
    }),
    summaryKey: 'scanBrief.summary.healthy',
    summaryParams: {
      total: '927 GB',
      usedPercent: 71,
      available: '271 GB',
      safe: '18 GB',
      confirm: '7.8 GB',
      topCount: 3
    },
    nextStep: t('zh-CN', 'scanBrief.nextStep.safe'),
    nextStepKey: 'scanBrief.nextStep.safe',
    topRecommendationIds: ['demo-rec-git', 'demo-rec-xcode-dyld', 'demo-rec-codex-sessions'],
    safeBytes: 18_005_000_000,
    confirmBytes: 7_965_597_888,
    manualBytes: 38_794_383_360,
    blockedBytes: 0,
    buckets: [
      {
        kind: 'recommended-cleanup',
        title: t('zh-CN', 'scanBrief.bucket.recommended-cleanup.title'),
        titleKey: 'scanBrief.bucket.recommended-cleanup.title',
        description: t('zh-CN', 'scanBrief.bucket.recommended-cleanup.description', { count: 0, bytes: '0 B' }),
        descriptionKey: 'scanBrief.bucket.recommended-cleanup.description',
        count: 0,
        totalBytes: 0,
        recommendationIds: []
      },
      {
        kind: 'review-first',
        title: t('zh-CN', 'scanBrief.bucket.review-first.title'),
        titleKey: 'scanBrief.bucket.review-first.title',
        description: t('zh-CN', 'scanBrief.bucket.review-first.description', { count: 1, bytes: '7.4 GB' }),
        descriptionKey: 'scanBrief.bucket.review-first.description',
        count: 1,
        totalBytes: 7_945_680_896,
        recommendationIds: ['demo-rec-codex-sessions']
      },
      {
        kind: 'manual-tool',
        title: t('zh-CN', 'scanBrief.bucket.manual-tool.title'),
        titleKey: 'scanBrief.bucket.manual-tool.title',
        description: t('zh-CN', 'scanBrief.bucket.manual-tool.description', { count: 2, bytes: '36 GB' }),
        descriptionKey: 'scanBrief.bucket.manual-tool.description',
        count: 2,
        totalBytes: 38_794_383_360,
        recommendationIds: ['demo-rec-git', 'demo-rec-xcode-dyld']
      },
      {
        kind: 'do-not-delete',
        title: t('zh-CN', 'scanBrief.bucket.do-not-delete.title'),
        titleKey: 'scanBrief.bucket.do-not-delete.title',
        description: t('zh-CN', 'scanBrief.bucket.do-not-delete.description', { count: 0, bytes: '0 B' }),
        descriptionKey: 'scanBrief.bucket.do-not-delete.description',
        count: 0,
        totalBytes: 0,
        recommendationIds: []
      }
    ]
  },
  trash: {
    sizeBytes: 2_110_144_000,
    itemCount: 84,
    pathToken: 'demo-trash'
  },
  issues: [
    {
      id: 'demo-issue',
      path: '~/Library/Caches/com.apple.containermanagerd',
      message: t('zh-CN', 'demo.issue.permission'),
      messageKey: 'demo.issue.permission',
      severity: 'warning'
    }
  ],
  issueGroups: [
    {
      id: 'issue-group-permission',
      kind: 'permission',
      title: t('zh-CN', 'issueGroup.permission.title', { count: 1 }),
      titleKey: 'issueGroup.permission.title',
      message: t('zh-CN', 'issueGroup.permission.message', { count: 1 }),
      messageKey: 'issueGroup.permission.message',
      messageParams: { count: 1 },
      severity: 'warning',
      count: 1,
      pathSamples: ['~/Library/Caches/com.apple.containermanagerd']
    }
  ],
  coverage: {
    mode: 'comprehensive',
    fullDiskAccessStatus: 'likely-missing',
    roots: ['~', '/Applications', '/Library', '/private/var/folders'],
    scannedRootCount: 4,
    skippedRootCount: 0,
    scannedEntries: 46_180,
    measuredBytes: 126_448_220_160,
    inaccessibleCount: 1,
    timeoutCount: 0,
    symlinkCount: 0,
    protectedCount: 0,
    insightCount: 4
  },
  categories: [
    {
      id: 'caches',
      name: t('zh-CN', 'category.caches.name'),
      nameKey: 'category.caches.name',
      description: t('zh-CN', 'category.caches.description'),
      descriptionKey: 'category.caches.description',
      sizeBytes: 12_804_505_600,
      candidateCount: 8,
      safetyBreakdown: { safe: 8, confirm: 0, discouraged: 0 }
    },
    {
      id: 'logs',
      name: t('zh-CN', 'category.logs.name'),
      nameKey: 'category.logs.name',
      description: t('zh-CN', 'category.logs.description'),
      descriptionKey: 'category.logs.description',
      sizeBytes: 842_792_960,
      candidateCount: 5,
      safetyBreakdown: { safe: 5, confirm: 0, discouraged: 0 }
    },
    {
      id: 'diagnostics',
      name: t('zh-CN', 'category.diagnostics.name'),
      nameKey: 'category.diagnostics.name',
      description: t('zh-CN', 'category.diagnostics.description'),
      descriptionKey: 'category.diagnostics.description',
      sizeBytes: 421_527_552,
      candidateCount: 4,
      safetyBreakdown: { safe: 4, confirm: 0, discouraged: 0 }
    },
    {
      id: 'http-storage',
      name: t('zh-CN', 'category.http-storage.name'),
      nameKey: 'category.http-storage.name',
      description: t('zh-CN', 'category.http-storage.description'),
      descriptionKey: 'category.http-storage.description',
      sizeBytes: 2_602_532_864,
      candidateCount: 3,
      safetyBreakdown: { safe: 0, confirm: 3, discouraged: 0 }
    },
    {
      id: 'saved-state',
      name: t('zh-CN', 'category.saved-state.name'),
      nameKey: 'category.saved-state.name',
      description: t('zh-CN', 'category.saved-state.description'),
      descriptionKey: 'category.saved-state.description',
      sizeBytes: 116_391_936,
      candidateCount: 6,
      safetyBreakdown: { safe: 0, confirm: 6, discouraged: 0 }
    },
    {
      id: 'downloads',
      name: t('zh-CN', 'category.downloads.name'),
      nameKey: 'category.downloads.name',
      description: t('zh-CN', 'category.downloads.description'),
      descriptionKey: 'category.downloads.description',
      sizeBytes: 2_152_554_496,
      candidateCount: 4,
      safetyBreakdown: { safe: 0, confirm: 4, discouraged: 0 }
    },
    {
      id: 'developer-caches',
      name: t('zh-CN', 'category.developer-caches.name'),
      nameKey: 'category.developer-caches.name',
      description: t('zh-CN', 'category.developer-caches.description'),
      descriptionKey: 'category.developer-caches.description',
      sizeBytes: 7_030_292_480,
      candidateCount: 2,
      safetyBreakdown: { safe: 2, confirm: 0, discouraged: 0 }
    }
  ],
  candidates: [
    makeDemoCandidate({
      id: 'demo-dev-derived-data',
      title: 'Xcode DerivedData',
      categoryId: 'developer-caches',
      categoryName: '开发工具缓存',
      categoryNameKey: 'category.developer-caches.name',
      kind: 'developer-cache',
      safety: 'safe',
      canClean: true,
      sizeBytes: 7_030_292_480,
      itemCount: 18_241,
      pathPreview: '~/Library/Developer/Xcode/DerivedData',
      pathToken: 'demo-derived-data-token',
      reason: '开发工具缓存通常可重新生成。',
      reasonKey: 'candidate.developer-cache.reason',
      impact: '下次构建可能变慢，但不会删除源码项目。',
      impactKey: 'candidate.developer-cache.impact',
      actionLabel: '移到废纸篓',
      actionLabelKey: 'candidate.developer-cache.action',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-cache-arc',
      title: 'company.thebrowser.Browser',
      categoryId: 'caches',
      categoryName: '用户缓存',
      categoryNameKey: 'category.caches.name',
      kind: 'cache',
      safety: 'safe',
      canClean: true,
      sizeBytes: 5_441_781_760,
      itemCount: 13_824,
      pathPreview: '~/Library/Caches/company.thebrowser.Browser',
      pathToken: 'demo-cache-arc-token',
      reason: '缓存通常可由应用重新生成。',
      reasonKey: 'candidate.cache.reason',
      impact: '清理后相关应用首次启动或加载内容时可能变慢，但不会删除核心文档。',
      impactKey: 'candidate.cache.impact',
      actionLabel: '移到废纸篓',
      actionLabelKey: 'candidate.cache.action',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-cache-xcode',
      title: 'com.apple.dt.Xcode',
      categoryId: 'caches',
      categoryName: '用户缓存',
      categoryNameKey: 'category.caches.name',
      kind: 'cache',
      safety: 'safe',
      canClean: true,
      sizeBytes: 3_812_421_632,
      itemCount: 9_241,
      pathPreview: '~/Library/Caches/com.apple.dt.Xcode',
      pathToken: 'demo-cache-xcode-token',
      reason: '缓存通常可由应用重新生成。',
      reasonKey: 'candidate.cache.reason',
      impact: '清理后相关应用首次启动或加载内容时可能变慢，但不会删除核心文档。',
      impactKey: 'candidate.cache.impact',
      actionLabel: '移到废纸篓',
      actionLabelKey: 'candidate.cache.action',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-http-storage',
      title: 'com.chatapp.desktop',
      categoryId: 'http-storage',
      categoryName: '网页缓存存储',
      categoryNameKey: 'category.http-storage.name',
      kind: 'http-storage',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 2_602_532_864,
      itemCount: 4_932,
      pathPreview: '~/Library/HTTPStorages/com.chatapp.desktop',
      pathToken: 'demo-http-token',
      reason: 'HTTP 存储可能包含应用内网页缓存、cookie 或本地站点数据。',
      reasonKey: 'candidate.http-storage.reason',
      impact: '相关应用可能需要重新登录、重新下载网页资源，或丢失部分网站本地状态。',
      impactKey: 'candidate.http-storage.impact',
      actionLabel: '确认后移到废纸篓',
      actionLabelKey: 'candidate.http-storage.action',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-download-1',
      title: 'DesignTool-4.2.1.dmg',
      categoryId: 'downloads',
      categoryName: '下载目录旧安装包',
      categoryNameKey: 'category.downloads.name',
      kind: 'download-archive',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 1_742_405_120,
      itemCount: 1,
      pathPreview: '~/Downloads/DesignTool-4.2.1.dmg',
      pathToken: 'demo-download-token',
      reason: '旧安装包和压缩包通常可再次下载，但可能仍被你需要。',
      reasonKey: 'candidate.download-archive.reason',
      impact: '会移走你下载过的安装包或归档文件；请先确认不是仍要保留的文件。',
      impactKey: 'candidate.download-archive.impact',
      actionLabel: '确认后移到废纸篓',
      actionLabelKey: 'candidate.download-archive.action',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-saved-state',
      title: 'com.apple.Preview.savedState',
      categoryId: 'saved-state',
      categoryName: '应用保存状态',
      categoryNameKey: 'category.saved-state.name',
      kind: 'saved-state',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 91_119_616,
      itemCount: 64,
      pathPreview: '~/Library/Saved Application State/com.apple.Preview.savedState',
      pathToken: 'demo-saved-token',
      reason: '保存状态不属于用户文档，但可能影响应用重新打开时的窗口恢复。',
      reasonKey: 'candidate.saved-state.reason',
      impact: '清理后应用可能无法恢复上次窗口位置、标签页或临时界面状态。',
      impactKey: 'candidate.saved-state.impact',
      actionLabel: '确认后移到废纸篓',
      actionLabelKey: 'candidate.saved-state.action',
      lastModified: now
    })
  ],
  recommendations: [
    {
      id: 'demo-rec-git',
      scanId: demoScanId,
      kind: 'git-garbage',
      risk: 'confirm',
      recommendedAction: 'run-safe-tool',
      canExecute: false,
      title: t('zh-CN', 'recommendation.gitGarbage.title', { repoName: 'worldquant-alpha' }),
      titleKey: 'recommendation.gitGarbage.title',
      titleParams: { repoName: 'worldquant-alpha' },
      sizeBytes: 31_707_381_760,
      itemCount: 2_292,
      pathCount: 2_292,
      pathPreview: '~/worldquant-alpha/.git/objects',
      pathSamples: ['~/worldquant-alpha/.git/objects/pack/tmp_pack_demo'],
      pathToken: 'demo-rec-git-token',
      priorityScore: 2_131_707_381_760,
      ...makeDemoRecommendationAdvisory('zh-CN', 'manual-tool', {
        title: t('zh-CN', 'recommendation.gitGarbage.title', { repoName: 'worldquant-alpha' }),
        size: '29.5 GB',
        path: '~/worldquant-alpha/.git/objects',
        action: t('zh-CN', 'recommendation.gitGarbage.action')
      }, [['advisor.exclusion.gitRoot.label', 'advisor.exclusion.gitRoot.detail']]),
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'recommendation.gitGarbage.reason', { tempCount: 2292 }),
      reasonKey: 'recommendation.gitGarbage.reason',
      reasonParams: { tempCount: 2292 },
      recommendation: t('zh-CN', 'recommendation.gitGarbage.recommendation'),
      recommendationKey: 'recommendation.gitGarbage.recommendation',
      actionLabel: t('zh-CN', 'recommendation.gitGarbage.action'),
      actionLabelKey: 'recommendation.gitGarbage.action',
      explanation: makeDemoExplanation('zh-CN', 'recommendation.gitGarbage.explanation', { repoName: 'worldquant-alpha', tempCount: 2292, size: '29.5 GB' }),
      lastModified: now,
      deletionMode: 'manual-tool'
    },
    {
      id: 'demo-rec-xcode-dyld',
      scanId: demoScanId,
      kind: 'xcode-simulator-cache',
      risk: 'safe',
      recommendedAction: 'open-owner-app',
      canExecute: false,
      title: t('zh-CN', 'recommendation.xcodeDyld.title'),
      titleKey: 'recommendation.xcodeDyld.title',
      sizeBytes: 7_087_001_600,
      itemCount: 812,
      pathCount: 812,
      pathPreview: '/Library/Developer/CoreSimulator/Caches/dyld',
      pathSamples: ['/Library/Developer/CoreSimulator/Caches/dyld'],
      pathToken: 'demo-rec-xcode-dyld-token',
      priorityScore: 3_007_087_001_600,
      ...makeDemoRecommendationAdvisory('zh-CN', 'manual-tool', {
        title: t('zh-CN', 'recommendation.xcodeDyld.title'),
        size: '6.6 GB',
        path: '/Library/Developer/CoreSimulator/Caches/dyld',
        action: t('zh-CN', 'recommendation.xcodeDyld.action')
      }),
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'recommendation.xcodeDyld.reason', { size: '6.6 GB' }),
      reasonKey: 'recommendation.xcodeDyld.reason',
      reasonParams: { size: '6.6 GB' },
      recommendation: t('zh-CN', 'recommendation.xcodeDyld.recommendation'),
      recommendationKey: 'recommendation.xcodeDyld.recommendation',
      actionLabel: t('zh-CN', 'recommendation.xcodeDyld.action'),
      actionLabelKey: 'recommendation.xcodeDyld.action',
      explanation: makeDemoExplanation('zh-CN', 'recommendation.xcodeDyld.explanation', { size: '6.6 GB' }),
      lastModified: now,
      deletionMode: 'manual-tool'
    },
    {
      id: 'demo-rec-codex-sessions',
      scanId: demoScanId,
      kind: 'codex-history',
      risk: 'confirm',
      recommendedAction: 'reveal-only',
      canExecute: false,
      title: t('zh-CN', 'recommendation.codexSessions.title'),
      titleKey: 'recommendation.codexSessions.title',
      sizeBytes: 7_945_680_896,
      itemCount: 320,
      pathCount: 320,
      pathPreview: '~/.codex/sessions',
      pathSamples: ['~/.codex/sessions'],
      pathToken: 'demo-rec-codex-sessions-token',
      priorityScore: 2_007_945_680_896,
      ...makeDemoRecommendationAdvisory('zh-CN', 'review-first', {
        title: t('zh-CN', 'recommendation.codexSessions.title'),
        size: '7.4 GB',
        path: '~/.codex/sessions',
        action: t('zh-CN', 'recommendation.codexSessions.action')
      }),
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'recommendation.codexSessions.reason', { size: '7.4 GB' }),
      reasonKey: 'recommendation.codexSessions.reason',
      reasonParams: { size: '7.4 GB' },
      recommendation: t('zh-CN', 'recommendation.codexSessions.recommendation'),
      recommendationKey: 'recommendation.codexSessions.recommendation',
      actionLabel: t('zh-CN', 'recommendation.codexSessions.action'),
      actionLabelKey: 'recommendation.codexSessions.action',
      explanation: makeDemoExplanation('zh-CN', 'recommendation.codexSessions.explanation', { size: '7.4 GB' }),
      lastModified: now,
      deletionMode: 'reveal-only'
    }
  ],
  insights: [
    {
      id: 'demo-insight-applications',
      scanId: demoScanId,
      title: 'Applications',
      kind: 'application',
      risk: 'not-recommended',
      sizeBytes: 48_122_920_960,
      itemCount: 312,
      pathCount: 312,
      pathPreview: '/Applications',
      pathSamples: ['/Applications'],
      pathToken: 'demo-insight-applications-token',
      canReveal: true,
      readable: true,
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'insight.application.reason'),
      reasonKey: 'insight.application.reason',
      recommendation: t('zh-CN', 'insight.application.recommendation'),
      recommendationKey: 'insight.application.recommendation',
      explanation: makeDemoExplanation('zh-CN', 'insight.application.explanation'),
      lastModified: now
    },
    {
      id: 'demo-insight-pictures',
      scanId: demoScanId,
      title: 'Pictures',
      kind: 'privacy-data',
      risk: 'not-recommended',
      sizeBytes: 36_808_908_800,
      itemCount: 8_420,
      pathCount: 8_420,
      pathPreview: '~/Pictures',
      pathSamples: ['~/Pictures'],
      pathToken: 'demo-insight-pictures-token',
      canReveal: true,
      readable: true,
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'insight.privacy.reason'),
      reasonKey: 'insight.privacy.reason',
      recommendation: t('zh-CN', 'insight.privacy.recommendation'),
      recommendationKey: 'insight.privacy.recommendation',
      explanation: makeDemoExplanation('zh-CN', 'insight.privacy.explanation'),
      lastModified: now
    },
    {
      id: 'demo-insight-documents',
      scanId: demoScanId,
      title: 'Documents',
      kind: 'user-content',
      risk: 'review',
      sizeBytes: 22_110_011_392,
      itemCount: 1_204,
      pathCount: 1_204,
      pathPreview: '~/Documents',
      pathSamples: ['~/Documents'],
      pathToken: 'demo-insight-documents-token',
      canReveal: true,
      readable: true,
      estimateSource: 'filesystem-walk',
      reason: t('zh-CN', 'insight.userContent.reason'),
      reasonKey: 'insight.userContent.reason',
      recommendation: t('zh-CN', 'insight.userContent.recommendation'),
      recommendationKey: 'insight.userContent.recommendation',
      explanation: makeDemoExplanation('zh-CN', 'insight.userContent.explanation'),
      lastModified: now
    },
    {
      id: 'demo-insight-library',
      scanId: demoScanId,
      title: 'Library',
      kind: 'system-support',
      risk: 'not-recommended',
      sizeBytes: 19_604_127_744,
      itemCount: 28_592,
      pathCount: 28_592,
      pathPreview: '~/Library',
      pathSamples: ['~/Library'],
      pathToken: 'demo-insight-library-token',
      canReveal: true,
      readable: true,
      estimateSource: 'partial-filesystem-walk',
      reason: t('zh-CN', 'insight.systemSupport.reason'),
      reasonKey: 'insight.systemSupport.reason',
      recommendation: t('zh-CN', 'insight.systemSupport.recommendation'),
      recommendationKey: 'insight.systemSupport.recommendation',
      explanation: makeDemoExplanation('zh-CN', 'insight.systemSupport.explanation'),
      lastModified: now
    }
  ]
}

export function createDemoApi(): MacCleanerApi {
  let listeners: Array<(progress: ScanProgress) => void> = []
  let updateListeners: Array<(progress: LocalUpdateProgress) => void> = []
  let languagePreference: AppLanguage | null = null
  let themePreference: ThemePreference | null = null
  let protectedPaths: ProtectedPath[] = []
  const demoUpdateConfig: LocalUpdateConfig = {
    repoPath: '/Users/yizuo/Mac-Cleaner',
    installTarget: '/Users/yizuo/Desktop/Mac Cleaner.app'
  }

  return {
    async scan(request: AppLanguage | ScanRequest = 'zh-CN') {
      const language = typeof request === 'string' ? request : request.language ?? 'zh-CN'
      listeners.forEach((listener) =>
        listener({
          scanId: demoScanId,
          stage: 'scanning',
          message: t(language, 'demo.progress.loading'),
          messageKey: 'demo.progress.loading',
          percent: 40
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 250))
      listeners.forEach((listener) =>
        listener({
          scanId: demoScanId,
          stage: 'done',
          message: t(language, 'demo.progress.done'),
          messageKey: 'demo.progress.done',
          percent: 100
        })
      )
      return demoSummary
    },
    async cancelScan() {},
    async cleanupPreview(candidateIds: string[], language: AppLanguage = 'zh-CN'): Promise<CleanupPreview> {
      const candidates = demoSummary.candidates.filter((item) => candidateIds.includes(item.id))
      if (!candidates.length) throw new Error(t(language, 'demo.notFound'))
      const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
      const operationPaths = candidates.map((candidate) => candidate.pathPreview)
      return {
        candidateIds,
        confirmationId: `demo-confirm-${candidateIds.join('-')}`,
        scanId: demoScanId,
        pathSnapshotHash: `demo-preview-${candidateIds.join('-')}`,
        title: candidates.length === 1 ? candidates[0].title : t(language, 'cleanup.batchTitle', { count: candidates.length }),
        titleKey: candidates.length === 1 ? undefined : 'cleanup.batchTitle',
        titleParams: candidates.length === 1 ? undefined : { count: candidates.length },
        totalBytes,
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples: operationPaths.slice(0, 8),
        operationPaths,
        trustReport: makeDemoTrustReport(candidates, totalBytes, operationPaths, language),
        impact: candidates.length === 1 ? localizeDemoImpact(candidates[0], language) : t(language, 'demo.batchImpact'),
        impactKey: candidates.length === 1 ? candidates[0].impactKey : 'demo.batchImpact',
        explanation: candidates.length === 1 ? candidates[0].explanation : makeDemoExplanation(language, 'cleanup.batchConfirm.explanation', {
          count: candidates.length,
          bytes: formatBytesForMessage(totalBytes)
        }),
        warning: t(language, 'cleanup.warning'),
        warningKey: 'cleanup.warning',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      }
    },
    async moveToTrash(candidateIds: string[]): Promise<CleanupResult> {
      const cleanedBytes = demoSummary.candidates
        .filter((candidate) => candidateIds.includes(candidate.id))
        .reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
      return {
        candidateIds,
        cleanedBytes,
        successCount: candidateIds.length,
        verifiedRemovedCount: candidateIds.length,
        trashBeforeBytes: demoSummary.trash.sizeBytes,
        trashAfterBytes: demoSummary.trash.sizeBytes + cleanedBytes,
        trashDeltaBytes: cleanedBytes,
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }
    },
    async previewRecommendationAction(recommendationId: string, language: AppLanguage = 'zh-CN') {
      const recommendation = demoSummary.recommendations.find((item) => item.id === recommendationId) ?? demoSummary.recommendations[0]
      return {
        recommendationId: recommendation.id,
        confirmationId: 'demo-recommendation-confirm',
        scanId: demoSummary.scanId,
        title: recommendation.title,
        titleKey: recommendation.titleKey,
        titleParams: recommendation.titleParams,
        action: recommendation.recommendedAction,
        canExecute: recommendation.canExecute,
        totalBytes: recommendation.sizeBytes,
        pathCount: recommendation.pathCount,
        pathSamples: recommendation.pathSamples,
        actionLabel: recommendation.actionLabel,
        actionLabelKey: recommendation.actionLabelKey,
        actionLabelParams: recommendation.actionLabelParams,
        explanation: recommendation.explanation,
        warning: t(language, recommendation.canExecute ? 'recommendation.preview.executeWarning' : 'recommendation.preview.readOnlyWarning'),
        warningKey: recommendation.canExecute ? 'recommendation.preview.executeWarning' : 'recommendation.preview.readOnlyWarning',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      }
    },
    async runRecommendationAction(recommendationId: string) {
      return {
        recommendationId,
        action: 'reveal-only',
        executed: false,
        message: t('zh-CN', 'recommendation.result.readOnly'),
        messageKey: 'recommendation.result.readOnly',
        revealResult: {
          ok: true,
          targetKind: 'directory',
          method: 'open-path',
          message: t('zh-CN', 'main.revealOpenedDirectory'),
          messageKey: 'main.revealOpenedDirectory'
        } as const
      }
    },
    async revealPath() {
      return {
        ok: true,
        targetKind: 'directory',
        method: 'open-path',
        message: t('zh-CN', 'main.revealOpenedDirectory'),
        messageKey: 'main.revealOpenedDirectory'
      } as const
    },
    async openFullDiskAccessSettings() {
      return {
        ok: true,
        targetKind: 'unknown',
        method: 'none',
        message: t('zh-CN', 'main.fullDiskAccessOpened'),
        messageKey: 'main.fullDiskAccessOpened'
      } as const
    },
    async checkForLocalUpdate(language: AppLanguage = 'zh-CN'): Promise<LocalUpdateStatus> {
      return {
        state: 'current',
        updateAvailable: false,
        currentVersion: '0.10.0',
        latestVersion: '0.10.0',
        repoPath: demoUpdateConfig.repoPath,
        installTarget: demoUpdateConfig.installTarget,
        currentBranch: 'codex/reliability-upgrades',
        upstream: 'origin/codex/reliability-upgrades',
        localCommit: 'demo-local',
        remoteCommit: 'demo-local',
        remoteUrl: 'https://github.com/zuoyi666/mac-cleaner.git',
        dirty: false,
        message: t(language, 'localUpdate.status.current'),
        messageKey: 'localUpdate.status.current',
        checkedAt: new Date().toISOString()
      }
    },
    async runLocalSourceUpdate(language: AppLanguage = 'zh-CN') {
      updateListeners.forEach((listener) =>
        listener({
          stage: 'done',
          message: t(language, 'localUpdate.result.noUpdate'),
          messageKey: 'localUpdate.result.noUpdate'
        })
      )
      return {
        updated: false,
        previousVersion: '0.10.0',
        currentVersion: '0.10.0',
        installedPath: demoUpdateConfig.installTarget,
        needsRelaunch: false,
        message: t(language, 'localUpdate.result.noUpdate'),
        messageKey: 'localUpdate.result.noUpdate'
      }
    },
    async configureLocalUpdate(config: Partial<LocalUpdateConfig>) {
      return { ...demoUpdateConfig, ...config }
    },
    async getLanguagePreference() {
      return languagePreference
    },
    async setLanguagePreference(language: AppLanguage) {
      languagePreference = language
      return languagePreference
    },
    async getThemePreference() {
      return themePreference
    },
    async setThemePreference(nextThemePreference: ThemePreference) {
      themePreference = nextThemePreference
      return themePreference
    },
    async getProtectedPaths() {
      return protectedPaths
    },
    async setProtectedPaths(nextProtectedPaths: ProtectedPath[]) {
      protectedPaths = nextProtectedPaths
      return protectedPaths
    },
    onScanProgress(listener: (progress: ScanProgress) => void) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((item) => item !== listener)
      }
    },
    onLocalUpdateProgress(listener: (progress: LocalUpdateProgress) => void) {
      updateListeners = [...updateListeners, listener]
      return () => {
        updateListeners = updateListeners.filter((item) => item !== listener)
      }
    }
  }
}

function localizeDemoImpact(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.impactKey ? t(language, candidate.impactKey) : candidate.impact
}

function makeDemoTrustReport(
  candidates: CleanupCandidate[],
  totalBytes: number,
  operationPaths: string[],
  language: AppLanguage
): CleanupTrustReport {
  const hasReviewItems = candidates.some((candidate) => candidate.safety === 'confirm')
  const params = {
    count: candidates.length,
    paths: operationPaths.length,
    bytes: formatBytesForMessage(totalBytes),
    roots: candidates.map((candidate) => candidate.pathPreview.split('/').slice(0, 3).join('/')).join(', '),
    categories: candidates.map((candidate) => candidate.categoryNameKey ? t(language, candidate.categoryNameKey) : candidate.categoryName).join(', '),
    targets: candidates.map((candidate) => candidate.targetNameKey ? t(language, candidate.targetNameKey) : candidate.targetName ?? candidate.categoryName).join(', ')
  }
  const item = (labelKey: string, detailKey: string, tone: 'safe' | 'confirm' | 'blocked' | 'info') => ({
    label: t(language, labelKey, params),
    labelKey,
    labelParams: params,
    detail: t(language, detailKey, params),
    detailKey,
    detailParams: params,
    tone
  })

  return {
    summary: t(language, hasReviewItems ? 'trust.summary.review' : 'trust.summary.recommended', params),
    summaryKey: hasReviewItems ? 'trust.summary.review' : 'trust.summary.recommended',
    summaryParams: params,
    evidence: [
      item('trust.evidence.scan.label', 'trust.evidence.scan.detail', 'safe'),
      item('trust.evidence.target.label', 'trust.evidence.target.detail', 'safe'),
      item('trust.evidence.allowlist.label', 'trust.evidence.allowlist.detail', 'safe'),
      item('trust.evidence.snapshot.label', 'trust.evidence.snapshot.detail', 'safe'),
      item('trust.evidence.symlink.label', 'trust.evidence.symlink.detail', 'safe')
    ],
    guarantees: [
      item('trust.guarantee.trash.label', 'trust.guarantee.trash.detail', 'safe'),
      item('trust.guarantee.noAdmin.label', 'trust.guarantee.noAdmin.detail', 'safe'),
      item('trust.guarantee.noArbitrary.label', 'trust.guarantee.noArbitrary.detail', 'safe')
    ],
    exclusions: [
      item('trust.exclusion.outsideList.label', 'trust.exclusion.outsideList.detail', 'blocked'),
      item('trust.exclusion.system.label', 'trust.exclusion.system.detail', 'blocked'),
      item('trust.exclusion.trashEmpty.label', 'trust.exclusion.trashEmpty.detail', 'blocked')
    ],
    recovery: t(language, 'trust.recovery.trash', params),
    recoveryKey: 'trust.recovery.trash',
    recoveryParams: params
  }
}

function makeDemoRecommendationAdvisory(
  language: AppLanguage,
  decision: StorageRecommendation['decision'],
  params: Record<string, string | number>,
  extraExclusions: Array<[string, string]> = []
): Pick<StorageRecommendation, 'confidence' | 'decision' | 'evidence' | 'doNotTouch' | 'advisorSummary' | 'advisorSummaryKey' | 'advisorSummaryParams'> {
  const confidence: StorageRecommendation['confidence'] = decision === 'recommended-cleanup' || decision === 'do-not-delete' ? 'high' : 'medium'
  const advisorSummaryKey = `advisor.summary.${decision}`
  const item = (labelKey: string, detailKey: string, tone: 'safe' | 'confirm' | 'blocked' | 'info') => ({
    label: t(language, labelKey, params),
    labelKey,
    labelParams: params,
    detail: t(language, detailKey, params),
    detailKey,
    detailParams: params,
    tone
  })
  return {
    confidence,
    decision,
    advisorSummary: t(language, advisorSummaryKey, params),
    advisorSummaryKey,
    advisorSummaryParams: params,
    evidence: [
      item('advisor.evidence.size.label', 'advisor.evidence.size.detail', 'info'),
      item('advisor.evidence.snapshot.label', 'advisor.evidence.snapshot.detail', 'safe'),
      item('advisor.evidence.knownPattern.label', 'advisor.evidence.knownPattern.detail', 'confirm'),
      item('advisor.evidence.action.label', 'advisor.evidence.action.detail', 'info')
    ],
    doNotTouch: [
      item('advisor.exclusion.noArbitrary.label', 'advisor.exclusion.noArbitrary.detail', 'blocked'),
      item('advisor.exclusion.noAutoAction.label', 'advisor.exclusion.noAutoAction.detail', 'blocked'),
      ...extraExclusions.map(([labelKey, detailKey]) => item(labelKey, detailKey, 'blocked'))
    ]
  }
}

function makeDemoCandidate(candidate: Omit<CleanupCandidate, 'scanId' | 'pathCount' | 'pathSamples' | 'pathSnapshotHash' | 'estimateSource' | 'explanation'>): CleanupCandidate {
  const targetNameKey = candidate.targetNameKey ?? candidate.categoryNameKey
  const targetName = targetNameKey ? t('zh-CN', targetNameKey) : candidate.targetName ?? candidate.categoryName
  return {
    ...candidate,
    scanId: demoScanId,
    displayKind: candidate.displayKind ?? 'single',
    pathCount: candidate.itemCount,
    pathSamples: [candidate.pathPreview],
    pathSnapshotHash: `hash-${candidate.id}`,
    estimateSource: candidate.itemCount === 1 ? 'file-stat' : 'filesystem-walk',
    explanation: makeDemoExplanation('zh-CN', candidateExplanationBase(candidate.kind)),
    targetId: candidate.targetId ?? candidate.categoryId,
    targetName,
    targetNameKey,
    deletionMode: candidate.deletionMode ?? 'trash',
    preflightEvidence: candidate.preflightEvidence ?? [
      {
        label: t('zh-CN', 'preflight.allowedRoot.label', { root: candidate.pathPreview.split('/').slice(0, 3).join('/') }),
        labelKey: 'preflight.allowedRoot.label',
        labelParams: { root: candidate.pathPreview.split('/').slice(0, 3).join('/') },
        detail: t('zh-CN', 'preflight.allowedRoot.detail', { root: candidate.pathPreview.split('/').slice(0, 3).join('/') }),
        detailKey: 'preflight.allowedRoot.detail',
        detailParams: { root: candidate.pathPreview.split('/').slice(0, 3).join('/') },
        tone: 'safe'
      },
      {
        label: t('zh-CN', 'preflight.symlink.label'),
        labelKey: 'preflight.symlink.label',
        detail: t('zh-CN', 'preflight.symlink.detail'),
        detailKey: 'preflight.symlink.detail',
        tone: 'safe'
      }
    ]
  }
}

function candidateExplanationBase(kind: CleanupCandidate['kind']): string {
  if (kind === 'cache') return 'candidate.cache.explanation'
  if (kind === 'log') return 'candidate.log.explanation'
  if (kind === 'diagnostic') return 'candidate.diagnostic.explanation'
  if (kind === 'http-storage') return 'candidate.http-storage.explanation'
  if (kind === 'saved-state') return 'candidate.saved-state.explanation'
  if (kind === 'download-archive') return 'candidate.download-archive.explanation'
  if (kind === 'developer-cache') return 'candidate.developer-cache.explanation'
  return 'candidate.blocked.explanation'
}

function makeDemoExplanation(
  language: AppLanguage,
  baseKey: string,
  params: Record<string, string | number> = {}
): HumanExplanation {
  return {
    summary: t(language, `${baseKey}.summary`, params),
    summaryKey: `${baseKey}.summary`,
    summaryParams: params,
    what: t(language, `${baseKey}.what`, params),
    whatKey: `${baseKey}.what`,
    whatParams: params,
    cleanability: t(language, `${baseKey}.cleanability`, params),
    cleanabilityKey: `${baseKey}.cleanability`,
    cleanabilityParams: params,
    afterAction: t(language, `${baseKey}.afterAction`, params),
    afterActionKey: `${baseKey}.afterAction`,
    afterActionParams: params,
    keepAdvice: t(language, `${baseKey}.keepAdvice`, params),
    keepAdviceKey: `${baseKey}.keepAdvice`,
    keepAdviceParams: params,
    nextStep: t(language, `${baseKey}.nextStep`, params),
    nextStepKey: `${baseKey}.nextStep`,
    nextStepParams: params
  }
}

function formatBytesForMessage(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}
