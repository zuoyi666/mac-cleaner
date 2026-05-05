export type SafetyLevel = 'safe' | 'confirm' | 'discouraged'

export type AppLanguage = 'zh-CN' | 'en-US'

export type I18nParams = Record<string, string | number>

export type EstimateSource = 'file-stat' | 'filesystem-walk' | 'partial-filesystem-walk' | 'blocked'

export type CleanupKind =
  | 'cache'
  | 'log'
  | 'diagnostic'
  | 'http-storage'
  | 'saved-state'
  | 'download-archive'
  | 'trash'
  | 'blocked'

export interface SafetyBreakdown {
  safe: number
  confirm: number
  discouraged: number
}

export interface CategorySummary {
  id: string
  name: string
  nameKey?: string
  description: string
  descriptionKey?: string
  sizeBytes: number
  candidateCount: number
  safetyBreakdown: SafetyBreakdown
}

export interface CleanupCandidate {
  id: string
  scanId: string
  title: string
  categoryId: string
  categoryName: string
  categoryNameKey?: string
  kind: CleanupKind
  safety: SafetyLevel
  canClean: boolean
  sizeBytes: number
  itemCount: number
  pathCount: number
  pathPreview: string
  pathSamples: string[]
  pathToken: string
  pathSnapshotHash: string
  estimateSource: EstimateSource
  reason: string
  reasonKey?: string
  impact: string
  impactKey?: string
  actionLabel: string
  actionLabelKey?: string
  lastModified?: string
  blockedReason?: string
  blockedReasonKey?: string
  blockedReasonParams?: I18nParams
}

export interface ScanIssue {
  id: string
  path: string
  message: string
  messageKey?: string
  messageParams?: I18nParams
  severity: 'info' | 'warning' | 'error'
}

export interface TrashSummary {
  sizeBytes: number
  itemCount: number
  pathToken?: string
}

export interface DiskSummary {
  mountPath: string
  totalBytes: number
  usedBytes: number
  availableBytes: number
}

export interface ScanSummary {
  scanId: string
  scannedAt: string
  homeDir: string
  disk: DiskSummary
  totalCleanableBytes: number
  categories: CategorySummary[]
  candidates: CleanupCandidate[]
  issues: ScanIssue[]
  trash: TrashSummary
}

export interface ScanProgress {
  scanId?: string
  stage: 'starting' | 'scanning' | 'measuring' | 'cancelled' | 'done'
  currentPath?: string
  message: string
  messageKey?: string
  messageParams?: I18nParams
  percent?: number
  scannedEntries?: number
  measuredBytes?: number
}

export interface CleanupPreview {
  candidateIds: string[]
  confirmationId: string
  scanId: string
  pathSnapshotHash: string
  title: string
  titleKey?: string
  titleParams?: I18nParams
  totalBytes: number
  pathCount: number
  pathSamples: string[]
  impact: string
  impactKey?: string
  warning: string
  warningKey?: string
  expiresAt: string
}

export interface CleanupFailure {
  candidateId?: string
  path: string
  error: string
  errorKey?: string
  errorParams?: I18nParams
}

export interface CleanupResult {
  candidateIds: string[]
  cleanedBytes: number
  successCount: number
  failed: CleanupFailure[]
  movedToTrash: boolean
  needsRescan: boolean
}

export interface MacCleanerApi {
  scan(language?: AppLanguage): Promise<ScanSummary>
  cancelScan(): Promise<void>
  cleanupPreview(candidateIds: string[], language?: AppLanguage): Promise<CleanupPreview>
  moveToTrash(candidateIds: string[], confirmationId: string, language?: AppLanguage): Promise<CleanupResult>
  revealPath(pathToken: string): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}
