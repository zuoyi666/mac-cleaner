import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  AppLanguage,
  CategorySummary,
  CleanupCandidate,
  CleanupKind,
  EstimateSource,
  FullDiskAccessStatus,
  HumanExplanation,
  IssueGroupKind,
  SafetyLevel,
  ScanCoverage,
  ScanIssue,
  ScanIssueGroup,
  ScanMode,
  ScanProgress,
  ScanSummary,
  StorageInsight,
  StorageInsightKind,
  StorageInsightRisk,
  TrashSummary
} from '../../shared/types'
import { t } from '../../shared/i18n'
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
const DEFAULT_STANDALONE_THRESHOLD_BYTES = 100 * 1024 * 1024
const DOWNLOAD_STANDALONE_THRESHOLD_BYTES = 50 * 1024 * 1024
const MAX_GROUP_PATH_SAMPLES = 8
const MAX_INSIGHT_SCAN_MS = 3_500
const MAX_INSIGHTS = 80
const INSIGHT_MIN_BYTES = 50 * 1024 * 1024
const INSIGHT_MEASURE_CONCURRENCY = 3

interface CategoryDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  relativePaths: string[]
  excludedRelativePaths?: string[]
  kind: CleanupKind
  safety: SafetyLevel
  reasonKey: string
  impactKey: string
  actionLabelKey: string
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
  language?: AppLanguage
  mode?: ScanMode
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
  language: AppLanguage
}

interface InsightScanResult {
  insights: StorageInsight[]
  roots: string[]
  scannedRootCount: number
  skippedRootCount: number
}

const makeCategories = (): CategoryDefinition[] => [
  {
    id: 'caches',
    nameKey: 'category.caches.name',
    descriptionKey: 'category.caches.description',
    relativePaths: ['Library/Caches'],
    kind: 'cache',
    safety: 'safe',
    reasonKey: 'candidate.cache.reason',
    impactKey: 'candidate.cache.impact',
    actionLabelKey: 'candidate.cache.action'
  },
  {
    id: 'logs',
    nameKey: 'category.logs.name',
    descriptionKey: 'category.logs.description',
    relativePaths: ['Library/Logs'],
    excludedRelativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'log',
    safety: 'safe',
    reasonKey: 'candidate.log.reason',
    impactKey: 'candidate.log.impact',
    actionLabelKey: 'candidate.log.action'
  },
  {
    id: 'diagnostics',
    nameKey: 'category.diagnostics.name',
    descriptionKey: 'category.diagnostics.description',
    relativePaths: ['Library/Logs/DiagnosticReports', 'Library/Logs/CrashReporter'],
    kind: 'diagnostic',
    safety: 'safe',
    reasonKey: 'candidate.diagnostic.reason',
    impactKey: 'candidate.diagnostic.impact',
    actionLabelKey: 'candidate.diagnostic.action'
  },
  {
    id: 'http-storage',
    nameKey: 'category.http-storage.name',
    descriptionKey: 'category.http-storage.description',
    relativePaths: ['Library/HTTPStorages'],
    kind: 'http-storage',
    safety: 'confirm',
    reasonKey: 'candidate.http-storage.reason',
    impactKey: 'candidate.http-storage.impact',
    actionLabelKey: 'candidate.http-storage.action'
  },
  {
    id: 'saved-state',
    nameKey: 'category.saved-state.name',
    descriptionKey: 'category.saved-state.description',
    relativePaths: ['Library/Saved Application State'],
    kind: 'saved-state',
    safety: 'confirm',
    reasonKey: 'candidate.saved-state.reason',
    impactKey: 'candidate.saved-state.impact',
    actionLabelKey: 'candidate.saved-state.action'
  },
  {
    id: 'downloads',
    nameKey: 'category.downloads.name',
    descriptionKey: 'category.downloads.description',
    relativePaths: ['Downloads'],
    kind: 'download-archive',
    safety: 'confirm',
    reasonKey: 'candidate.download-archive.reason',
    impactKey: 'candidate.download-archive.impact',
    actionLabelKey: 'candidate.download-archive.action',
    directChildrenOnly: true,
    includeFile: (entryPath, stats, now) => {
      if (!stats.isFile()) return false
      const extension = path.extname(entryPath).toLowerCase()
      const ageMs = now.getTime() - stats.mtime.getTime()
      return DOWNLOAD_EXTENSIONS.has(extension) && ageMs >= OLD_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000
    }
  },
  {
    id: 'developer-caches',
    nameKey: 'category.developer-caches.name',
    descriptionKey: 'category.developer-caches.description',
    relativePaths: [
      'Library/Developer/Xcode/DerivedData',
      'Library/Caches/Homebrew',
      'Library/Caches/pip',
      'Library/pnpm/store',
      '.npm',
      '.cache/yarn'
    ],
    kind: 'developer-cache',
    safety: 'safe',
    reasonKey: 'candidate.developer-cache.reason',
    impactKey: 'candidate.developer-cache.impact',
    actionLabelKey: 'candidate.developer-cache.action'
  }
]

export async function scanStorage(options: ScanOptions = {}): Promise<ScanRun> {
  const homeDir = options.homeDir ?? os.homedir()
  const now = options.now ?? new Date()
  const language = options.language ?? 'zh-CN'
  const mode = options.mode ?? 'comprehensive'
  const scanId = crypto.randomUUID()
  const issues: ScanIssue[] = []
  const candidates = new Map<string, InternalCandidate>()
  const pathTokens = new Map<string, string>()
  const categories: CategorySummary[] = []
  let insightScan: InsightScanResult = { insights: [], roots: [], scannedRootCount: 0, skippedRootCount: 0 }
  const progress = {
    scannedEntries: 0,
    measuredBytes: 0
  }

  options.onProgress?.({
    scanId,
    stage: 'starting',
    message: t(language, 'progress.starting'),
    messageKey: 'progress.starting',
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
        message: t(language, 'progress.scanningCategory', { categoryName: t(language, category.nameKey) }),
        messageKey: 'progress.scanningCategory',
        messageParams: { categoryName: t(language, category.nameKey) },
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
          homeDir,
          language
        }
      )
      categoryCandidates.push(...discovered)
    }

    const displayCandidates = aggregateSmallCandidates(category, categoryCandidates, homeDir, language)

    for (const candidate of displayCandidates) {
      candidates.set(candidate.id, candidate)
      pathTokens.set(candidate.pathToken, candidate.displayKind === 'group' ? candidate.allowedRoot : candidate.paths[0])
    }

    categories.push(summarizeCategory(category, displayCandidates, language))
  }

  const trash = await scanTrash(homeDir, issues, {
    signal: options.signal,
    deadlineMs: Date.now() + MAX_CANDIDATE_SCAN_MS,
    issues,
    progress,
    onProgress: options.onProgress,
    scanId,
    homeDir,
    language
  })
  if (trash.pathToken) {
    pathTokens.set(trash.pathToken, path.join(homeDir, '.Trash'))
  }

  if (mode === 'comprehensive') {
    insightScan = await scanUserSpaceInsights(homeDir, issues, {
      signal: options.signal,
      deadlineMs: Date.now() + MAX_INSIGHT_SCAN_MS,
      issues,
      progress,
      onProgress: options.onProgress,
      scanId,
      homeDir,
      language
    })
    for (const insight of insightScan.insights) {
      if (insight.pathToken && insight.canReveal) {
        pathTokens.set(insight.pathToken, expandDisplayPath(insight.pathPreview, homeDir))
      }
    }
  }

  const disk = await getDiskSummary(homeDir)
  const fullDiskAccessStatus = await detectFullDiskAccessStatus(homeDir)
  const publicCandidates = [...candidates.values()].map(stripInternalCandidate)
  const totalCleanableBytes = publicCandidates
    .filter((candidate) => candidate.canClean)
    .reduce((sum, candidate) => sum + candidate.sizeBytes, 0)

  options.onProgress?.({
    scanId,
    stage: 'done',
    message: t(language, 'progress.done'),
    messageKey: 'progress.done',
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
      insights: insightScan.insights,
      issueGroups: groupScanIssues(issues, homeDir, language),
      coverage: makeCoverage(mode, insightScan, progress, issues, fullDiskAccessStatus),
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
      issues.push(makeIssue(root, 'issue.cannotAccess', 'warning', ctx.language, { error: formatError(error) }))
      return [makeBlockedCandidate(category, root, homeDir, 'blocked.cannotAccessDir', { error: formatError(error) }, ctx)]
    }
    return []
  }

  if (rootStats.isSymbolicLink()) {
    issues.push(makeIssue(root, 'issue.skipSymlinkRoot', 'info', ctx.language))
    return []
  }

  if (!rootStats.isDirectory()) return []

  let entries: string[]
  try {
    entries = await fs.readdir(root)
  } catch (error) {
    issues.push(makeIssue(root, 'issue.cannotReadDir', 'warning', ctx.language, { error: formatError(error) }))
    return [makeBlockedCandidate(category, root, homeDir, 'blocked.cannotReadDir', { error: formatError(error) }, ctx)]
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
      issues.push(makeIssue(entryPath, 'issue.cannotReadEntry', 'warning', ctx.language, { error: formatError(error) }))
      return
    }

    if (stats.isSymbolicLink()) {
      issues.push(makeIssue(entryPath, 'issue.skipSymlink', 'info', ctx.language))
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
      message: t(ctx.language, 'progress.measuringEntry', { entryName: entry }),
      messageKey: 'progress.measuringEntry',
      messageParams: { entryName: entry },
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

    candidates.push(makeCandidate(category, entryPath, root, homeDir, measured, ctx))
  })

  return candidates.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

async function measurePath(targetPath: string, ctx: MeasureContext): Promise<MeasuredPath> {
  throwIfAborted(ctx.signal)
  if (Date.now() > ctx.deadlineMs) {
    ctx.issues.push(makeIssue(targetPath, 'issue.measureTimeout', 'warning', ctx.language))
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'partial-filesystem-walk', truncated: true }
  }

  let stats
  try {
    stats = await fs.lstat(targetPath)
  } catch (error) {
    ctx.issues.push(makeIssue(targetPath, 'issue.cannotMeasure', 'warning', ctx.language, { error: formatError(error) }))
    return { sizeBytes: 0, itemCount: 0, pathCount: 0, estimateSource: 'partial-filesystem-walk' }
  }

  if (stats.isSymbolicLink()) {
    ctx.issues.push(makeIssue(targetPath, 'issue.skipSymlink', 'info', ctx.language))
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
    ctx.issues.push(makeIssue(targetPath, 'issue.cannotReadDir', 'warning', ctx.language, { error: formatError(error) }))
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
      issues.push(makeIssue(trashPath, 'issue.cannotStatTrash', 'warning', ctx.language, { error: formatError(error) }))
    }
    return { sizeBytes: 0, itemCount: 0 }
  }
}

async function scanUserSpaceInsights(
  homeDir: string,
  issues: ScanIssue[],
  ctx: MeasureContext
): Promise<InsightScanResult> {
  const roots = getUserSpaceInsightRoots(homeDir)
  const insights: StorageInsight[] = []
  let scannedRootCount = 0
  let skippedRootCount = 0

  for (const root of roots) {
    throwIfAborted(ctx.signal)
    ctx.onProgress?.({
      scanId: ctx.scanId,
      stage: 'scanning',
      currentPath: compactPathForDisplay(root, homeDir),
      message: t(ctx.language, 'progress.scanningSpaceMap'),
      messageKey: 'progress.scanningSpaceMap',
      scannedEntries: ctx.progress.scannedEntries,
      measuredBytes: ctx.progress.measuredBytes
    })

    const rootInsights = await discoverInsightsForRoot(root, homeDir, issues, ctx)
    if (rootInsights.length) scannedRootCount += 1
    else skippedRootCount += 1
    insights.push(...rootInsights)
  }

  const sortedInsights = insights
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, MAX_INSIGHTS)

  return { insights: sortedInsights, roots: roots.map((root) => compactPathForDisplay(root, homeDir)), scannedRootCount, skippedRootCount }
}

function getUserSpaceInsightRoots(homeDir: string): string[] {
  if (path.resolve(homeDir) !== path.resolve(os.homedir())) {
    return [homeDir]
  }
  return uniqueExistingRoots([
    homeDir,
    '/Users/Shared',
    '/Applications',
    '/Library',
    '/private/var/folders'
  ])
}

function uniqueExistingRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const root of roots) {
    const resolved = path.resolve(root)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    output.push(resolved)
  }
  return output
}

async function discoverInsightsForRoot(
  root: string,
  homeDir: string,
  issues: ScanIssue[],
  ctx: MeasureContext
): Promise<StorageInsight[]> {
  let rootStats
  try {
    rootStats = await fs.lstat(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      issues.push(makeIssue(root, 'issue.cannotAccess', 'warning', ctx.language, { error: formatError(error) }))
      return [makeBlockedInsight(root, homeDir, ctx, formatError(error))]
    }
    return []
  }

  if (rootStats.isSymbolicLink()) {
    issues.push(makeIssue(root, 'issue.skipSymlinkRoot', 'info', ctx.language))
    return []
  }

  if (rootStats.isFile()) {
    const measured = measureSingleStats(rootStats)
    return [makeStorageInsight(root, homeDir, measured, ctx, true)]
  }

  if (!rootStats.isDirectory()) return []

  let entries: string[]
  try {
    entries = await fs.readdir(root)
  } catch (error) {
    issues.push(makeIssue(root, 'issue.cannotReadDir', 'warning', ctx.language, { error: formatError(error) }))
    return [makeBlockedInsight(root, homeDir, ctx, formatError(error))]
  }

  const insights: StorageInsight[] = []
  await mapWithConcurrency(entries, INSIGHT_MEASURE_CONCURRENCY, async (entry) => {
    throwIfAborted(ctx.signal)
    const entryPath = path.join(root, entry)
    if (shouldSkipInsightPath(entryPath, homeDir)) {
      issues.push(makeIssue(entryPath, 'issue.skipProtectedPath', 'info', ctx.language))
      return
    }

    let stats
    try {
      stats = await fs.lstat(entryPath)
    } catch (error) {
      issues.push(makeIssue(entryPath, 'issue.cannotReadEntry', 'warning', ctx.language, { error: formatError(error) }))
      return
    }

    if (stats.isSymbolicLink()) {
      issues.push(makeIssue(entryPath, 'issue.skipSymlink', 'info', ctx.language))
      return
    }

    if (stats.dev !== rootStats.dev) {
      issues.push(makeIssue(entryPath, 'issue.skipDifferentVolume', 'info', ctx.language))
      return
    }

    const measured = stats.isDirectory()
      ? await measurePath(entryPath, { ...ctx, deadlineMs: Date.now() + MAX_INSIGHT_SCAN_MS })
      : measureSingleStats(stats)
    if (measured.sizeBytes <= 0) return
    if (measured.sizeBytes < INSIGHT_MIN_BYTES && measured.estimateSource !== 'partial-filesystem-walk') return

    insights.push(makeStorageInsight(entryPath, homeDir, measured, ctx, true))
  })

  return insights
}

function shouldSkipInsightPath(entryPath: string, homeDir: string): boolean {
  const resolved = path.resolve(entryPath)
  const protectedRoots = ['/System', '/bin', '/sbin', '/usr', '/dev', '/Volumes', '/cores']
  if (protectedRoots.some((root) => resolved === root || resolved.startsWith(`${root}/`))) return true
  if (resolved === path.join(homeDir, '.Trash')) return true
  return false
}

function makeBlockedInsight(root: string, homeDir: string, ctx: MeasureContext, error: string): StorageInsight {
  const title = path.basename(root) || root
  return {
    id: stableId('insight-blocked', root),
    scanId: ctx.scanId,
    title,
    kind: 'blocked',
    risk: 'not-recommended',
    sizeBytes: 0,
    itemCount: 0,
    pathCount: 1,
    pathPreview: compactPathForDisplay(root, homeDir),
    pathSamples: [compactPathForDisplay(root, homeDir)],
    canReveal: false,
    readable: false,
    estimateSource: 'blocked',
    reason: t(ctx.language, 'insight.blocked.reason', { error }),
    reasonKey: 'insight.blocked.reason',
    reasonParams: { error },
    recommendation: t(ctx.language, 'insight.blocked.recommendation'),
    recommendationKey: 'insight.blocked.recommendation',
    explanation: makeHumanExplanation(ctx.language, 'insight.blocked.explanation', { error })
  }
}

function makeStorageInsight(
  targetPath: string,
  homeDir: string,
  measured: MeasuredPath,
  ctx: MeasureContext,
  readable: boolean
): StorageInsight {
  const classification = classifyInsight(targetPath, homeDir)
  return {
    id: stableId('insight', targetPath),
    scanId: ctx.scanId,
    title: path.basename(targetPath) || targetPath,
    kind: classification.kind,
    risk: classification.risk,
    sizeBytes: measured.sizeBytes,
    itemCount: measured.itemCount,
    pathCount: measured.pathCount,
    pathPreview: compactPathForDisplay(targetPath, homeDir),
    pathSamples: [compactPathForDisplay(targetPath, homeDir)],
    pathToken: crypto.randomUUID(),
    canReveal: readable,
    readable,
    estimateSource: measured.estimateSource,
    reason: t(ctx.language, classification.reasonKey),
    reasonKey: classification.reasonKey,
    recommendation: t(ctx.language, classification.recommendationKey),
    recommendationKey: classification.recommendationKey,
    explanation: makeHumanExplanation(ctx.language, classification.explanationKeyBase),
    lastModified: measured.lastModified?.toISOString()
  }
}

function classifyInsight(targetPath: string, homeDir: string): {
  kind: StorageInsightKind
  risk: StorageInsightRisk
  reasonKey: string
  recommendationKey: string
  explanationKeyBase: string
} {
  const normalized = path.resolve(targetPath)
  const basename = path.basename(normalized)
  const relativeToHome = path.relative(homeDir, normalized)
  const isInHome = relativeToHome && !relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome)
  const homeParts = isInHome ? relativeToHome.split(path.sep) : []

  if (normalized.startsWith('/Applications') || basename.endsWith('.app')) {
    return {
      kind: 'application',
      risk: 'not-recommended',
      reasonKey: 'insight.application.reason',
      recommendationKey: 'insight.application.recommendation',
      explanationKeyBase: 'insight.application.explanation'
    }
  }

  if (isPrivacyOrImportantPath(normalized, homeDir)) {
    return {
      kind: 'privacy-data',
      risk: 'not-recommended',
      reasonKey: 'insight.privacy.reason',
      recommendationKey: 'insight.privacy.recommendation',
      explanationKeyBase: 'insight.privacy.explanation'
    }
  }

  if (normalized.includes('/Caches/') || normalized.endsWith('/Caches')) {
    return {
      kind: 'system-support',
      risk: 'safe-opportunity',
      reasonKey: 'insight.cache.reason',
      recommendationKey: 'insight.cache.recommendation',
      explanationKeyBase: 'insight.cache.explanation'
    }
  }

  if (homeParts[0] === 'Desktop' || homeParts[0] === 'Documents' || homeParts[0] === 'Downloads') {
    return {
      kind: homeParts[0] === 'Downloads' ? 'large-file' : 'user-content',
      risk: 'review',
      reasonKey: 'insight.userContent.reason',
      recommendationKey: 'insight.userContent.recommendation',
      explanationKeyBase: 'insight.userContent.explanation'
    }
  }

  if (normalized.includes('/Developer/') || normalized.includes('/.npm') || normalized.includes('/.cache/')) {
    return {
      kind: 'developer-data',
      risk: 'review',
      reasonKey: 'insight.developerData.reason',
      recommendationKey: 'insight.developerData.recommendation',
      explanationKeyBase: 'insight.developerData.explanation'
    }
  }

  if (normalized.startsWith('/Library') || normalized.startsWith('/private/var') || homeParts[0] === 'Library') {
    return {
      kind: 'system-support',
      risk: 'not-recommended',
      reasonKey: 'insight.systemSupport.reason',
      recommendationKey: 'insight.systemSupport.recommendation',
      explanationKeyBase: 'insight.systemSupport.explanation'
    }
  }

  return {
    kind: 'directory',
    risk: 'review',
    reasonKey: 'insight.directory.reason',
    recommendationKey: 'insight.directory.recommendation',
    explanationKeyBase: 'insight.directory.explanation'
  }
}

function makeHumanExplanation(
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

function candidateExplanationKeyBase(kind: CleanupKind): string {
  if (kind === 'cache') return 'candidate.cache.explanation'
  if (kind === 'log') return 'candidate.log.explanation'
  if (kind === 'diagnostic') return 'candidate.diagnostic.explanation'
  if (kind === 'http-storage') return 'candidate.http-storage.explanation'
  if (kind === 'saved-state') return 'candidate.saved-state.explanation'
  if (kind === 'download-archive') return 'candidate.download-archive.explanation'
  if (kind === 'developer-cache') return 'candidate.developer-cache.explanation'
  return 'candidate.blocked.explanation'
}

function isPrivacyOrImportantPath(targetPath: string, homeDir: string): boolean {
  const importantFragments = [
    '/Pictures',
    '/Movies',
    '/Music',
    '/Library/Mail',
    '/Library/Messages',
    '/Library/Safari',
    '/Library/Photos',
    '/Library/Containers/com.docker',
    '/Library/Developer/Xcode/Archives'
  ]
  const relative = path.relative(homeDir, targetPath)
  const homeRelative = relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? `/${relative}` : targetPath
  return importantFragments.some((fragment) => homeRelative === fragment || homeRelative.startsWith(`${fragment}/`))
}

function makeCandidate(
  category: CategoryDefinition,
  entryPath: string,
  allowedRoot: string,
  homeDir: string,
  measured: MeasuredPath,
  ctx: MeasureContext
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
    scanId: ctx.scanId,
    title,
    categoryId: category.id,
    categoryName: t(ctx.language, category.nameKey),
    categoryNameKey: category.nameKey,
    kind: category.kind,
    displayKind: 'single',
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
    reason: t(ctx.language, category.reasonKey),
    reasonKey: category.reasonKey,
    impact: t(ctx.language, category.impactKey),
    impactKey: category.impactKey,
    explanation: makeHumanExplanation(ctx.language, candidateExplanationKeyBase(category.kind)),
    actionLabel: t(ctx.language, category.actionLabelKey),
    actionLabelKey: category.actionLabelKey,
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
  messageKey: string,
  messageParams: Record<string, string | number>,
  ctx: MeasureContext
): InternalCandidate {
  const categoryName = t(ctx.language, category.nameKey)
  const message = t(ctx.language, messageKey, messageParams)
  const pathSnapshot = {
    path: root,
    sizeBytes: 0,
    itemCount: 0
  }
  return {
    id: stableId(`${category.id}:blocked`, root),
    scanId: ctx.scanId,
    title: t(ctx.language, 'blocked.title', { categoryName }),
    categoryId: category.id,
    categoryName,
    categoryNameKey: category.nameKey,
    kind: 'blocked',
    displayKind: 'single',
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
    reasonKey: messageKey,
    impact: t(ctx.language, 'candidate.blocked.impact'),
    impactKey: 'candidate.blocked.impact',
    explanation: makeHumanExplanation(ctx.language, 'candidate.blocked.explanation', {
      categoryName,
      reason: message
    }),
    actionLabel: t(ctx.language, 'candidate.blocked.action'),
    actionLabelKey: 'candidate.blocked.action',
    blockedReason: message,
    blockedReasonKey: messageKey,
    blockedReasonParams: messageParams,
    paths: [root],
    allowedRoot: root,
    pathSnapshots: [pathSnapshot]
  }
}

function aggregateSmallCandidates(
  category: CategoryDefinition,
  candidates: InternalCandidate[],
  homeDir: string,
  language: AppLanguage
): InternalCandidate[] {
  const standalone: InternalCandidate[] = []
  const buckets = new Map<string, InternalCandidate[]>()

  for (const candidate of candidates) {
    if (!shouldGroupCandidate(category, candidate)) {
      standalone.push(candidate)
      continue
    }
    const bucketKey = [
      candidate.allowedRoot,
      candidate.safety,
      candidate.reasonKey ?? candidate.reason,
      candidate.impactKey ?? candidate.impact,
      candidate.actionLabelKey ?? candidate.actionLabel
    ].join('::')
    buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), candidate])
  }

  const grouped: InternalCandidate[] = []
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) {
      standalone.push(...bucket)
      continue
    }
    grouped.push(makeGroupedCandidate(category, bucket, homeDir, language))
  }

  return [...standalone, ...grouped].sort((left, right) => bignessScore(right) - bignessScore(left))
}

function shouldGroupCandidate(category: CategoryDefinition, candidate: InternalCandidate): boolean {
  if (!candidate.canClean || candidate.safety === 'discouraged') return false
  const threshold = category.id === 'downloads' ? DOWNLOAD_STANDALONE_THRESHOLD_BYTES : DEFAULT_STANDALONE_THRESHOLD_BYTES
  return candidate.sizeBytes < threshold
}

function makeGroupedCandidate(
  category: CategoryDefinition,
  items: InternalCandidate[],
  homeDir: string,
  language: AppLanguage
): InternalCandidate {
  const sortedItems = [...items].sort((left, right) => right.sizeBytes - left.sizeBytes)
  const first = sortedItems[0]
  const pathSnapshots = sortedItems.flatMap((candidate) => candidate.pathSnapshots)
  const paths = sortedItems.flatMap((candidate) => candidate.paths)
  const pathSamples = sortedItems
    .flatMap((candidate) => candidate.pathSamples)
    .slice(0, MAX_GROUP_PATH_SAMPLES)
  const titleKey = groupTitleKey(category.id)
  const titleParams = { count: sortedItems.length }
  const sizeBytes = sortedItems.reduce((sum, candidate) => sum + candidate.sizeBytes, 0)
  const itemCount = sortedItems.reduce((sum, candidate) => sum + candidate.itemCount, 0)
  const pathCount = sortedItems.reduce((sum, candidate) => sum + candidate.pathCount, 0)
  const largestItemBytes = sortedItems.reduce((largest, candidate) => Math.max(largest, candidate.sizeBytes), 0)
  const lastModified = maxIsoDate(sortedItems.map((candidate) => candidate.lastModified))
  const pathSnapshotHash = hashPathSnapshots(pathSnapshots)

  return {
    id: stableId(`${category.id}:group:${first.safety}:${first.allowedRoot}`, paths.join('|')),
    scanId: first.scanId,
    title: t(language, titleKey, titleParams),
    titleKey,
    titleParams,
    categoryId: category.id,
    categoryName: t(language, category.nameKey),
    categoryNameKey: category.nameKey,
    kind: category.kind,
    displayKind: 'group',
    groupCount: sortedItems.length,
    groupSummaryKey: 'candidate.group.summary',
    groupSummaryParams: { count: sortedItems.length, largest: formatBytesForMessage(largestItemBytes) },
    largestItemBytes,
    safety: first.safety,
    canClean: first.canClean,
    sizeBytes,
    itemCount,
    pathCount,
    pathPreview: t(language, 'candidate.group.preview', {
      count: sortedItems.length,
      path: compactPathForDisplay(first.paths[0], homeDir)
    }),
    pathSamples,
    pathToken: crypto.randomUUID(),
    pathSnapshotHash,
    estimateSource: sortedItems.some((candidate) => candidate.estimateSource === 'partial-filesystem-walk')
      ? 'partial-filesystem-walk'
      : 'filesystem-walk',
    reason: t(language, first.reasonKey),
    reasonKey: first.reasonKey,
    impact: t(language, first.impactKey),
    impactKey: first.impactKey,
    explanation: makeHumanExplanation(language, 'candidate.group.explanation', {
      count: sortedItems.length,
      largest: formatBytesForMessage(largestItemBytes),
      categoryName: t(language, category.nameKey)
    }),
    actionLabel: t(language, first.actionLabelKey),
    actionLabelKey: first.actionLabelKey,
    lastModified,
    paths,
    allowedRoot: first.allowedRoot,
    pathSnapshots
  }
}

function groupTitleKey(categoryId: string): string {
  if (categoryId === 'caches') return 'candidate.group.caches.title'
  if (categoryId === 'logs') return 'candidate.group.logs.title'
  if (categoryId === 'diagnostics') return 'candidate.group.diagnostics.title'
  if (categoryId === 'http-storage') return 'candidate.group.http-storage.title'
  if (categoryId === 'saved-state') return 'candidate.group.saved-state.title'
  if (categoryId === 'downloads') return 'candidate.group.downloads.title'
  if (categoryId === 'developer-caches') return 'candidate.group.developer-caches.title'
  return 'candidate.group.generic.title'
}

function bignessScore(candidate: InternalCandidate): number {
  return candidate.sizeBytes + (candidate.displayKind === 'group' ? 1 : 0)
}

function maxIsoDate(values: Array<string | undefined>): string | undefined {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
  if (!dates.length) return undefined
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
}

function formatBytesForMessage(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

function summarizeCategory(category: CategoryDefinition, candidates: InternalCandidate[], language: AppLanguage): CategorySummary {
  return {
    id: category.id,
    name: t(language, category.nameKey),
    nameKey: category.nameKey,
    description: t(language, category.descriptionKey),
    descriptionKey: category.descriptionKey,
    sizeBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
    candidateCount: candidates.length,
    safetyBreakdown: {
      safe: candidates.filter((candidate) => candidate.safety === 'safe').length,
      confirm: candidates.filter((candidate) => candidate.safety === 'confirm').length,
      discouraged: candidates.filter((candidate) => candidate.safety === 'discouraged').length
    }
  }
}

function groupScanIssues(issues: ScanIssue[], homeDir: string, language: AppLanguage): ScanIssueGroup[] {
  const groups = new Map<IssueGroupKind, ScanIssue[]>()
  for (const issue of issues) {
    const kind = classifyIssue(issue)
    groups.set(kind, [...(groups.get(kind) ?? []), issue])
  }

  return [...groups.entries()].map(([kind, groupIssues]) => {
    const messageParams = { count: groupIssues.length }
    return {
      id: `issue-group-${kind}`,
      kind,
      title: t(language, issueGroupTitleKey(kind), messageParams),
      titleKey: issueGroupTitleKey(kind),
      message: t(language, issueGroupMessageKey(kind), messageParams),
      messageKey: issueGroupMessageKey(kind),
      messageParams,
      severity: groupIssues.some((issue) => issue.severity === 'error') ? 'error' : groupIssues.some((issue) => issue.severity === 'warning') ? 'warning' : 'info',
      count: groupIssues.length,
      pathSamples: groupIssues.slice(0, 6).map((issue) => compactPathForDisplay(issue.path, homeDir))
    }
  })
}

function classifyIssue(issue: ScanIssue): IssueGroupKind {
  const haystack = `${issue.messageKey ?? ''} ${issue.message}`.toLowerCase()
  if (haystack.includes('eperm') || haystack.includes('eacces') || haystack.includes('permission') || haystack.includes('operation not permitted')) {
    return 'permission'
  }
  if (issue.messageKey === 'issue.measureTimeout') return 'timeout'
  if (issue.messageKey === 'issue.skipSymlink' || issue.messageKey === 'issue.skipSymlinkRoot') return 'symlink'
  if (issue.messageKey === 'issue.skipProtectedPath' || issue.messageKey === 'issue.skipDifferentVolume') return 'protected'
  return 'other'
}

function issueGroupTitleKey(kind: IssueGroupKind): string {
  return `issueGroup.${kind}.title`
}

function issueGroupMessageKey(kind: IssueGroupKind): string {
  return `issueGroup.${kind}.message`
}

function makeCoverage(
  mode: ScanMode,
  insightScan: InsightScanResult,
  progress: MeasureContext['progress'],
  issues: ScanIssue[],
  fullDiskAccessStatus: FullDiskAccessStatus
): ScanCoverage {
  return {
    mode,
    fullDiskAccessStatus,
    roots: insightScan.roots,
    scannedRootCount: insightScan.scannedRootCount,
    skippedRootCount: insightScan.skippedRootCount,
    scannedEntries: progress.scannedEntries,
    measuredBytes: progress.measuredBytes,
    inaccessibleCount: issues.filter((issue) => classifyIssue(issue) === 'permission').length,
    timeoutCount: issues.filter((issue) => classifyIssue(issue) === 'timeout').length,
    symlinkCount: issues.filter((issue) => classifyIssue(issue) === 'symlink').length,
    protectedCount: issues.filter((issue) => classifyIssue(issue) === 'protected').length,
    insightCount: insightScan.insights.length
  }
}

async function detectFullDiskAccessStatus(homeDir: string): Promise<FullDiskAccessStatus> {
  if (path.resolve(homeDir) !== path.resolve(os.homedir())) return 'unknown'
  const probePaths = [
    path.join(homeDir, 'Library', 'Mail'),
    path.join(homeDir, 'Library', 'Messages'),
    path.join(homeDir, 'Library', 'Safari'),
    path.join(homeDir, 'Library', 'Calendars'),
    path.join(homeDir, 'Library', 'Application Support', 'AddressBook')
  ]

  let denied = false
  for (const probePath of probePaths) {
    try {
      const stats = await fs.lstat(probePath)
      if (!stats.isDirectory()) continue
      await fs.readdir(probePath)
      return 'likely-granted'
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') denied = true
    }
  }

  return denied ? 'likely-missing' : 'unknown'
}

function stripInternalCandidate(candidate: InternalCandidate): CleanupCandidate {
  const { paths: _paths, allowedRoot: _allowedRoot, pathSnapshots: _pathSnapshots, ...publicCandidate } = candidate
  return publicCandidate
}

function expandDisplayPath(displayPath: string, homeDir: string): string {
  if (displayPath === '~') return homeDir
  if (displayPath.startsWith(`~${path.sep}`)) return path.join(homeDir, displayPath.slice(2))
  return displayPath
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
    throw new DOMException(t('zh-CN', 'progress.cancelled'), 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function stableId(prefix: string, value: string): string {
  const hash = crypto.createHash('sha1').update(`${prefix}:${value}`).digest('hex').slice(0, 14)
  return `${prefix.replace(/[^a-z0-9-]/gi, '-')}-${hash}`
}

function makeIssue(
  pathName: string,
  messageKey: string,
  severity: ScanIssue['severity'],
  language: AppLanguage,
  messageParams: Record<string, string | number> = {}
): ScanIssue {
  const message = t(language, messageKey, messageParams)
  return {
    id: stableId('issue', `${pathName}:${message}`),
    path: pathName,
    message,
    messageKey,
    messageParams,
    severity
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
