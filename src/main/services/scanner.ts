import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  CategorySummary,
  CleanupCandidate,
  CleanupKind,
  EstimateSource,
  SafetyLevel,
  ScanIssue,
  ScanProgress,
  ScanSummary,
  TrashSummary
} from '../../shared/types'
import { compactPathForDisplay } from './pathSafety'
import { getDiskSummary } from './disk'

const DOWNLOAD_EXTENSIONS = new Set([
  '.dmg',
  '.pkg',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.rar',
  '.7z',
  '.iso'
])

const OLD_DOWNLOAD_DAYS = 30
const TOP_LEVEL_MEASURE_CONCURRENCY = 4
const MAX_CANDIDATE_SCAN_MS = 15_000

interface CategoryDefinition {
  id: string
  name: string
  description: string
  relativePaths: string[]
  excludedRelativePaths?: string[]
  kind: CleanupKind
  safety: SafetyLevel
  reason: string
  impact: string
  actionLabel: string
  includeFile?: (entryPath: string, stats: Awaited<ReturnType<typeof fs.lstat>>, now: Date) => boolean
  directChildrenOnly?: boolean
}

export interface InternalCandidate extends CleanupCandidate {
  paths: string[]
  allowedRoot: string
  pathSnapshots: PathSnapshot[]
}

export interface ScanRun {
  summary: ScanSummary
  candidates: Map<string, InternalCandidate>
  pathTokens: Map<string, string>
}

export interface ScanOptions {
  homeDir?: string
  now?: Date
  signal?: AbortSignal
  onProgress?: (progress: ScanProgress) => void
}

interface MeasuredPath {
  sizeBytes: number
  itemCount: number
  pathCount: number
  lastModified?: Date
  pathLastModified?: Date
  estimateSource: EstimateSource
  truncated?: boolean
}

interface PathSnapshot {
  path: string
  sizeBytes: number
  itemCount: number
  lastModified?: string
}

interface MeasureContext {
  signal?: AbortSignal
  deadlineMs: number
  issues: ScanIssue[]
  progress: {
    scannedEntries: number
    measuredBytes: number
  }
  onProgress?: (progress: ScanProgress) => void
  scanId: string
  homeDir: string
}

const makeCategories = (): CategoryDefinition[] => [
  {
    id: 'caches',
    name: '用户缓存',
    description: '应用可重新生成的用户级缓存',
    relativePaths: ['Library/Caches'],
    kind: 'cache',
    safety: 'safe',
    reason: '缓存通常可由应用重新生成。',
    impact: '清理后相关应用首次启动或加载内容时可能变慢，但不会删除核心文档。',
    actionLabel: '移到废纸篓'
  },
  {
    id: 'logs',
    name: '日志文件',
    description: '用户级应用日志和历史运行记录',
    relativePaths: ['Library/Logs'],
    excludedRelativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'log',
    safety: 'safe',
    reason: '历史日志不影响应用正常启动。',
    impact: '会丢失部分历史排障记录，不影响应用功能。',
    actionLabel: '移到废纸篓'
  },
  {
    id: 'diagnostics',
    name: '崩溃与诊断报告',
    description: '历史崩溃报告和诊断文件',
    relativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'diagnostic',
    safety: 'safe',
    reason: '历史诊断报告只用于回溯问题。',
    impact: '会减少可供排查旧崩溃的信息，不影响应用运行。',
    actionLabel: '移到废纸篓'
  },
  {
    id: 'http-storage',
    name: '网页缓存存储',
    description: '应用内网页视图的 HTTP 存储缓存',
    relativePaths: ['Library/HTTPStorages'],
    kind: 'http-storage',
    safety: 'confirm',
    reason: 'HTTP 存储可能包含应用内网页缓存、cookie 或本地站点数据。',
    impact: '相关应用可能需要重新登录、重新下载网页资源，或丢失部分网站本地状态。',
    actionLabel: '确认后移到废纸篓'
  },
  {
    id: 'saved-state',
    name: '应用保存状态',
    description: '窗口恢复状态和临时会话外观',
    relativePaths: ['Library/Saved Application State'],
    kind: 'saved-state',
    safety: 'confirm',
    reason: '保存状态不属于用户文档，但可能影响应用重新打开时的窗口恢复。',
    impact: '清理后应用可能无法恢复上次窗口位置、标签页或临时界面状态。',
    actionLabel: '确认后移到废纸篓'
  },
  {
    id: 'downloads',
    name: '下载目录旧安装包',
    description: 'Downloads 中超过 30 天的安装包和压缩包',
    relativePaths: ['Downloads'],
    kind: 'download-archive',
    safety: 'confirm',
    reason: '旧安装包和压缩包通常可再次下载，但可能仍被你需要。',
    impact: '会移走你下载过的安装包或归档文件；请先确认不是仍要保留的文件。',
    actionLabel: '确认后移到废纸篓',
    directChildrenOnly: true,
    includeFile: (entryPath, stats, now) => {
      if (!stats.isFile()) return false
      const extension = path.extname(entryPath).toLowerCase()
      const ageMs = now.getTime() - stats.mtime.getTime()
      return DOWNLOAD_EXTENSIONS.has(extension) && ageMs >= OLD_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000
    }
  }
]

export async function scanStorage(options: ScanOptions = {}): Promise<ScanRun> {
  const homeDir = options.homeDir ?? os.homedir()
  const now = options.now ?? new Date()
  const scanId = crypto.randomUUID()
  const issues: ScanIssue[] = []
  const candidates = new Map<string, InternalCandidate>()
  const pathTokens = new Map<string, string>()
  const categories: CategorySummary[] = []
  const progress = {
    scannedEntries: 0,
    measuredBytes: 0
  }

  options.onProgress?.({
    scanId,
    stage: 'starting',
    message: '准备扫描用户级可清理位置',
    percent: 0,
    scannedEntries: 0,
    measuredBytes: 0
  })

  const categoryDefinitions = makeCategories()
  for (const [categoryIndex, category] of categoryDefinitions.entries()) {
    throwIfAborted(options.signal)
    const categoryCandidates: InternalCandidate[] = []
    const basePercent = Math.round((categoryIndex / categoryDefinitions.length) * 100)

    for (const relativePath of category.relativePaths) {
      throwIfAborted(options.signal)
      const root = path.join(homeDir, relativePath)
      options.onProgress?.({
        scanId,
        stage: 'scanning',
        currentPath: compactPathForDisplay(root, homeDir),
        message: `正在扫描${category.name}`,
        percent: basePercent,
        scannedEntries: progress.scannedEntries,
        measuredBytes: progress.measuredBytes
      })

      const discovered = await discoverCandidatesForRoot(
        category,
        root,
        homeDir,
        now,
        issues,
        {
          signal: options.signal,
          deadlineMs: Date.now() + MAX_CANDIDATE_SCAN_MS,
          issues,
          progress,
          onProgress: options.onProgress,
          scanId,
          homeDir
        }
      )
      categoryCandidates.push(...discovered)
    }

    for (const candidate of categoryCandidates) {
      candidates.set(candidate.id, candidate)
      pathTokens.set(candidate.pathToken, candidate.paths[0])
    }

    categories.push(summarizeCategory(category, categoryCandidates))
  }

  const trash = await scanTrash(homeDir, issues, {
    signal: options.signal,
    deadlineMs: Date.now() + MAX_CANDIDATE_SCAN_MS,
    issues,
    progress,
    onProgress: options.onProgress,
    scanId,
    homeDir
  })
  if (trash.pathToken) {
    pathTokens.set(trash.pathToken, path.join(homeDir, '.Trash'))
  }

  const disk = await getDiskSummary(homeDir)
  const publicCandidates = [...candidates.values()].map(stripInternalCandidate)
  const totalCleanableBytes = publicCandidates
    .filter((candidate) => candidate.canClean)
    .reduce((sum, candidate) => sum + candidate.sizeBytes, 0)

  options.onProgress?.({
    scanId,
    stage: 'done',
    message: '扫描完成',
    percent: 100,
    scannedEntries: progress.scannedEntries,
    measuredBytes: progress.measuredBytes
  })

  return {
    summary: {
      scanId,
      scannedAt: now.toISOString(),
      homeDir,
      disk,
      totalCleanableBytes,
      categories,
      candidates: publicCandidates,
      issues,
      trash
    },
    candidates,
    pathTokens
  }
}

async function discoverCandidatesForRoot(
  category: CategoryDefinition,
  root: string,
  homeDir: string,
  now: Date,
  issues: ScanIssue[],
  ctx: MeasureContext
): Promise<InternalCandidate[]> {
  throwIfAborted(ctx.signal)
  let rootStats
  try {
    rootStats = await fs.lstat(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      issues.push(makeIssue(root, `无法访问：${formatError(error)}`, 'warning'))
      return [makeBlockedCandidate(category, root, homeDir, `无法访问该目录：${formatError(error)}`, ctx.scanId)]
    }
    return []
  }

  if (rootStats.isSymbolicLink()) {
    issues.push(makeIssue(root, '跳过符号链接，避免跨出安全扫描范围。', 'info'))
    return []
  }

  if (!rootStats.isDirectory()) return []

  let entries: string[]
  try {
    entries = await fs.readdir(root)
  } catch (error) {
    issues.push(makeIssue(root, `无法读取目录：${formatError(error)}`, 'warning'))
    return [makeBlockedCandidate(category, root, homeDir, `无法读取该目录：${formatError(error)}`, ctx.scanId)]
  }

  const candidates: InternalCandidate[] = []

  await mapWithConcurrency(entries, TOP_LEVEL_MEASURE_CONCURRENCY, async (entry) => {
    throwIfAborted(ctx.signal)
    const entryPath = path.join(root, entry)
    if (isExcludedPath(entryPath, category, homeDir)) {
      return
    }

    let stats
    try {
      stats = await fs.lstat(entryPath)
    } catch (error) {
      issues.push(makeIssue(entryPath, `无法读取条目：${formatError(error)}`, 'warning'))
      return
    }

    if (stats.isSymbolicLink()) {
      issues.push(makeIssue(entryPath, '跳过符号链接。', 'info'))
      return
    }

    if (category.includeFile && !category.includeFile(entryPath, stats, now)) {
      return
    }

    if (!category.includeFile && !stats.isDirectory() && !stats.isFile()) {
      return
    }

    ctx.onProgress?.({
      scanId: ctx.scanId,
      stage: 'measuring',
      currentPath: compactPathForDisplay(entryPath, homeDir),
      message: `正在统计${entry}`,
      scannedEntries: ctx.progress.scannedEntries,
      measuredBytes: ctx.progress.measuredBytes
    })

    const candidateCtx = {
      ...ctx,
      deadlineMs: Date.now() + MAX_CANDIDATE_SCAN_MS
    }
    const measured = category.directChildrenOnly
      ? measureSingleStats(stats)
      : await measurePath(entryPath, candidateCtx)

    if (measured.sizeBytes <= 0 && measured.itemCount <= 0) {
      return
    }

    candidates.push(makeCandidate(category, entryPath, root, homeDir, measured, ctx.scanId))
  })

  return candidates.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

async function measurePath(targetPath: string, ctx: MeasureContext): Promise<MeasuredPath> {
  throwIfAborted(ctx.signal)
  if (Date.now() > ctx.deadlineMs) {
    ctx.issues.push(makeIssue(targetPath, '统计耗时过长，已使用部分估算并跳过剩余内容。', 'warning'))
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'partial-filesystem-walk', truncated: true }
  }

  let stats
  try {
    stats = await fs.lstat(targetPath)
  } catch (error) {
    ctx.issues.push(makeIssue(targetPath, `无法统计：${formatError(error)}`, 'warning'))
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'partial-filesystem-walk' }
  }

  if (stats.isSymbolicLink()) {
    ctx.issues.push(makeIssue(targetPath, '跳过符号链接。', 'info'))
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'partial-filesystem-walk' }
  }

  if (stats.isFile()) {
    ctx.progress.scannedEntries += 1
    ctx.progress.measuredBytes += Number(stats.size)
    return measureSingleStats(stats)
  }

  if (!stats.isDirectory()) {
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'filesystem-walk' }
  }

  let entries: string[]
  try {
    entries = await fs.readdir(targetPath)
  } catch (error) {
    ctx.issues.push(makeIssue(targetPath, `无法读取目录：${formatError(error)}`, 'warning'))
    return {
      sizeBytes: 0,
      itemCount: 0,
      pathCount: 1,
      lastModified: stats.mtime,
      pathLastModified: stats.mtime,
      estimateSource: 'partial-filesystem-walk'
    }
  }

  let sizeBytes = 0
  let itemCount = 0
  let pathCount = 1
  let lastModified = stats.mtime
  let truncated = false

  for (const entry of entries) {
    throwIfAborted(ctx.signal)
    const child = await measurePath(path.join(targetPath, entry), ctx)
    sizeBytes += child.sizeBytes
    itemCount += child.itemCount
    pathCount += child.pathCount
    truncated = truncated || Boolean(child.truncated) || child.estimateSource === 'partial-filesystem-walk'
    if (child.lastModified && child.lastModified > lastModified) {
      lastModified = child.lastModified
    }
  }

  return {
    sizeBytes,
    itemCount,
    pathCount,
    lastModified,
    pathLastModified: stats.mtime,
    estimateSource: truncated ? 'partial-filesystem-walk' : 'filesystem-walk',
    truncated
  }
}

function measureSingleStats(stats: Awaited<ReturnType<typeof fs.lstat>>): MeasuredPath {
  return {
    sizeBytes: Number(stats.size),
    itemCount: 1,
    pathCount: 1,
    lastModified: stats.mtime,
    pathLastModified: stats.mtime,
    estimateSource: 'file-stat'
  }
}

async function scanTrash(homeDir: string, issues: ScanIssue[], ctx: MeasureContext): Promise<TrashSummary> {
  const trashPath = path.join(homeDir, '.Trash')
  try {
    throwIfAborted(ctx.signal)
    const stats = await fs.lstat(trashPath)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return { sizeBytes: 0, itemCount: 0 }
    }
    const measured = await measurePath(trashPath, ctx)
    return {
      sizeBytes: measured.sizeBytes,
      itemCount: measured.itemCount,
      pathToken: crypto.randomUUID()
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      issues.push(makeIssue(trashPath, `无法统计废纸篓：${formatError(error)}`, 'warning'))
    }
    return { sizeBytes: 0, itemCount: 0 }
  }
}

function makeCandidate(
  category: CategoryDefinition,
  entryPath: string,
  allowedRoot: string,
  homeDir: string,
  measured: MeasuredPath,
  scanId: string
): InternalCandidate {
  const title = path.basename(entryPath)
  const pathSnapshot: PathSnapshot = {
    path: entryPath,
    sizeBytes: measured.sizeBytes,
    itemCount: measured.itemCount,
    lastModified: measured.pathLastModified?.toISOString()
  }
  const pathSnapshotHash = hashPathSnapshots([pathSnapshot])
  return {
    id: stableId(category.id, entryPath),
    scanId,
    title,
    categoryId: category.id,
    categoryName: category.name,
    kind: category.kind,
    safety: category.safety,
    canClean: category.safety !== 'discouraged',
    sizeBytes: measured.sizeBytes,
    itemCount: measured.itemCount,
    pathCount: measured.pathCount,
    pathPreview: compactPathForDisplay(entryPath, homeDir),
    pathSamples: [compactPathForDisplay(entryPath, homeDir)],
    pathToken: crypto.randomUUID(),
    pathSnapshotHash,
    estimateSource: measured.estimateSource,
    reason: category.reason,
    impact: category.impact,
    actionLabel: category.actionLabel,
    lastModified: measured.lastModified?.toISOString(),
    paths: [entryPath],
    allowedRoot,
    pathSnapshots: [pathSnapshot]
  }
}

function makeBlockedCandidate(
  category: CategoryDefinition,
  root: string,
  homeDir: string,
  message: string,
  scanId: string
): InternalCandidate {
  const pathSnapshot = {
    path: root,
    sizeBytes: 0,
    itemCount: 0
  }
  return {
    id: stableId(`${category.id}:blocked`, root),
    scanId,
    title: `${category.name}不可访问`,
    categoryId: category.id,
    categoryName: category.name,
    kind: 'blocked',
    safety: 'discouraged',
    canClean: false,
    sizeBytes: 0,
    itemCount: 0,
    pathCount: 1,
    pathPreview: compactPathForDisplay(root, homeDir),
    pathSamples: [compactPathForDisplay(root, homeDir)],
    pathToken: crypto.randomUUID(),
    pathSnapshotHash: hashPathSnapshots([pathSnapshot]),
    estimateSource: 'blocked',
    reason: message,
    impact: '应用不会尝试绕过 macOS 权限，也不会清理无法确认安全性的路径。',
    actionLabel: '不可清理',
    blockedReason: message,
    paths: [root],
    allowedRoot: root,
    pathSnapshots: [pathSnapshot]
  }
}

function summarizeCategory(category: CategoryDefinition, candidates: InternalCandidate[]): CategorySummary {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    sizeBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
    candidateCount: candidates.length,
    safetyBreakdown: {
      safe: candidates.filter((candidate) => candidate.safety === 'safe').length,
      confirm: candidates.filter((candidate) => candidate.safety === 'confirm').length,
      discouraged: candidates.filter((candidate) => candidate.safety === 'discouraged').length
    }
  }
}

function stripInternalCandidate(candidate: InternalCandidate): CleanupCandidate {
  const { paths: _paths, allowedRoot: _allowedRoot, pathSnapshots: _pathSnapshots, ...publicCandidate } = candidate
  return publicCandidate
}

function hashPathSnapshots(snapshots: PathSnapshot[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(snapshots)).digest('hex')
}

function isExcludedPath(entryPath: string, category: CategoryDefinition, homeDir: string): boolean {
  return Boolean(
    category.excludedRelativePaths?.some((relativePath) => {
      const excludedRoot = path.join(homeDir, relativePath)
      const relative = path.relative(excludedRoot, entryPath)
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    })
  )
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  })
  await Promise.all(workers)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('扫描已取消。', 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function stableId(prefix: string, value: string): string {
  const hash = crypto.createHash('sha1').update(`${prefix}:${value}`).digest('hex').slice(0, 14)
  return `${prefix.replace(/[^a-z0-9-]/gi, '-')}-${hash}`
}

function makeIssue(pathName: string, message: string, severity: ScanIssue['severity']): ScanIssue {
  return {
    id: stableId('issue', `${pathName}:${message}`),
    path: pathName,
    message,
    severity
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
