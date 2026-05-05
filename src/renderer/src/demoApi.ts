import type {
  CleanupCandidate,
  CleanupPreview,
  CleanupResult,
  MacCleanerApi,
  ScanProgress,
  ScanSummary
} from '../../shared/types'

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
  totalCleanableBytes: 18_940_305_408,
  trash: {
    sizeBytes: 2_110_144_000,
    itemCount: 84,
    pathToken: 'demo-trash'
  },
  issues: [
    {
      id: 'demo-issue',
      path: '~/Library/Caches/com.apple.containermanagerd',
      message: '权限不足，已跳过该目录。',
      severity: 'warning'
    }
  ],
  categories: [
    {
      id: 'caches',
      name: '用户缓存',
      description: '应用可重新生成的用户级缓存',
      sizeBytes: 12_804_505_600,
      candidateCount: 8,
      safetyBreakdown: { safe: 8, confirm: 0, discouraged: 0 }
    },
    {
      id: 'logs',
      name: '日志文件',
      description: '用户级应用日志和历史运行记录',
      sizeBytes: 842_792_960,
      candidateCount: 5,
      safetyBreakdown: { safe: 5, confirm: 0, discouraged: 0 }
    },
    {
      id: 'diagnostics',
      name: '崩溃与诊断报告',
      description: '历史崩溃报告和诊断文件',
      sizeBytes: 421_527_552,
      candidateCount: 4,
      safetyBreakdown: { safe: 4, confirm: 0, discouraged: 0 }
    },
    {
      id: 'http-storage',
      name: '网页缓存存储',
      description: '应用内网页视图的 HTTP 存储缓存',
      sizeBytes: 2_602_532_864,
      candidateCount: 3,
      safetyBreakdown: { safe: 0, confirm: 3, discouraged: 0 }
    },
    {
      id: 'saved-state',
      name: '应用保存状态',
      description: '窗口恢复状态和临时会话外观',
      sizeBytes: 116_391_936,
      candidateCount: 6,
      safetyBreakdown: { safe: 0, confirm: 6, discouraged: 0 }
    },
    {
      id: 'downloads',
      name: '下载目录旧安装包',
      description: 'Downloads 中超过 30 天的安装包和压缩包',
      sizeBytes: 2_152_554_496,
      candidateCount: 4,
      safetyBreakdown: { safe: 0, confirm: 4, discouraged: 0 }
    }
  ],
  candidates: [
    makeDemoCandidate({
      id: 'demo-cache-arc',
      title: 'company.thebrowser.Browser',
      categoryId: 'caches',
      categoryName: '用户缓存',
      kind: 'cache',
      safety: 'safe',
      canClean: true,
      sizeBytes: 5_441_781_760,
      itemCount: 13_824,
      pathPreview: '~/Library/Caches/company.thebrowser.Browser',
      pathToken: 'demo-cache-arc-token',
      reason: '缓存通常可由应用重新生成。',
      impact: '清理后相关应用首次启动或加载内容时可能变慢，但不会删除核心文档。',
      actionLabel: '移到废纸篓',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-cache-xcode',
      title: 'com.apple.dt.Xcode',
      categoryId: 'caches',
      categoryName: '用户缓存',
      kind: 'cache',
      safety: 'safe',
      canClean: true,
      sizeBytes: 3_812_421_632,
      itemCount: 9_241,
      pathPreview: '~/Library/Caches/com.apple.dt.Xcode',
      pathToken: 'demo-cache-xcode-token',
      reason: '缓存通常可由应用重新生成。',
      impact: '清理后相关应用首次启动或加载内容时可能变慢，但不会删除核心文档。',
      actionLabel: '移到废纸篓',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-http-storage',
      title: 'com.chatapp.desktop',
      categoryId: 'http-storage',
      categoryName: '网页缓存存储',
      kind: 'http-storage',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 2_602_532_864,
      itemCount: 4_932,
      pathPreview: '~/Library/HTTPStorages/com.chatapp.desktop',
      pathToken: 'demo-http-token',
      reason: 'HTTP 存储可能包含应用内网页缓存、cookie 或本地站点数据。',
      impact: '相关应用可能需要重新登录、重新下载网页资源，或丢失部分网站本地状态。',
      actionLabel: '确认后移到废纸篓',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-download-1',
      title: 'DesignTool-4.2.1.dmg',
      categoryId: 'downloads',
      categoryName: '下载目录旧安装包',
      kind: 'download-archive',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 1_742_405_120,
      itemCount: 1,
      pathPreview: '~/Downloads/DesignTool-4.2.1.dmg',
      pathToken: 'demo-download-token',
      reason: '旧安装包和压缩包通常可再次下载，但可能仍被你需要。',
      impact: '会移走你下载过的安装包或归档文件；请先确认不是仍要保留的文件。',
      actionLabel: '确认后移到废纸篓',
      lastModified: now
    }),
    makeDemoCandidate({
      id: 'demo-saved-state',
      title: 'com.apple.Preview.savedState',
      categoryId: 'saved-state',
      categoryName: '应用保存状态',
      kind: 'saved-state',
      safety: 'confirm',
      canClean: true,
      sizeBytes: 91_119_616,
      itemCount: 64,
      pathPreview: '~/Library/Saved Application State/com.apple.Preview.savedState',
      pathToken: 'demo-saved-token',
      reason: '保存状态不属于用户文档，但可能影响应用重新打开时的窗口恢复。',
      impact: '清理后应用可能无法恢复上次窗口位置、标签页或临时界面状态。',
      actionLabel: '确认后移到废纸篓',
      lastModified: now
    })
  ]
}

export function createDemoApi(): MacCleanerApi {
  let listeners: Array<(progress: ScanProgress) => void> = []

  return {
    async scan() {
      listeners.forEach((listener) =>
        listener({ scanId: demoScanId, stage: 'scanning', message: '浏览器预览模式：正在加载示例扫描结果', percent: 40 })
      )
      await new Promise((resolve) => setTimeout(resolve, 250))
      listeners.forEach((listener) => listener({ scanId: demoScanId, stage: 'done', message: '示例扫描完成', percent: 100 }))
      return demoSummary
    },
    async cancelScan() {},
    async cleanupPreview(candidateIds: string[]): Promise<CleanupPreview> {
      const candidates = demoSummary.candidates.filter((item) => candidateIds.includes(item.id))
      if (!candidates.length) throw new Error('未找到示例项目')
      const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
      return {
        candidateIds,
        confirmationId: `demo-confirm-${candidateIds.join('-')}`,
        scanId: demoScanId,
        pathSnapshotHash: `demo-preview-${candidateIds.join('-')}`,
        title: candidates.length === 1 ? candidates[0].title : `${candidates.length} 个清理项目`,
        totalBytes,
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples: candidates.map((candidate) => candidate.pathPreview),
        impact: candidates.length === 1 ? candidates[0].impact : '所选项目包含多个缓存或需确认项，请确认后再移到废纸篓。',
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。清倒废纸篓前仍可手动恢复。',
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
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }
    },
    async revealPath() {},
    onScanProgress(listener: (progress: ScanProgress) => void) {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((item) => item !== listener)
      }
    }
  }
}

function makeDemoCandidate(candidate: Omit<CleanupCandidate, 'scanId' | 'pathCount' | 'pathSamples' | 'pathSnapshotHash' | 'estimateSource'>): CleanupCandidate {
  return {
    ...candidate,
    scanId: demoScanId,
    pathCount: candidate.itemCount,
    pathSamples: [candidate.pathPreview],
    pathSnapshotHash: `hash-${candidate.id}`,
    estimateSource: candidate.itemCount === 1 ? 'file-stat' : 'filesystem-walk'
  }
}
