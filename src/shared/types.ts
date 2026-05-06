export type SafetyLevel = 'safe' | 'confirm' | 'discouraged'

export type AppLanguage = 'zh-CN' | 'en-US'

export type I18nParams = Record<string, string | number>

export type EstimateSource = 'file-stat' | 'filesystem-walk' | 'partial-filesystem-walk' | 'blocked'
export type CandidateDisplayKind = 'single' | 'group'
export type RevealTargetKind = 'file' | 'directory' | 'missing' | 'unknown'
export type RevealMethod = 'finder-reveal' | 'open-path' | 'none'

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
  titleKey?: string
  titleParams?: I18nParams
  categoryId: string
  categoryName: string
  categoryNameKey?: string
  kind: CleanupKind
  displayKind?: CandidateDisplayKind
  groupCount?: number
  groupSummaryKey?: string
  groupSummaryParams?: I18nParams
  largestItemBytes?: number
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
  verifiedRemovedCount: number
  trashBeforeBytes?: number
  trashAfterBytes?: number
  trashDeltaBytes?: number
  failed: CleanupFailure[]
  movedToTrash: boolean
  needsRescan: boolean
}

export interface RevealResult {
  ok: boolean
  targetKind: RevealTargetKind
  method: RevealMethod
  message: string
  messageKey?: string
  messageParams?: I18nParams
}

export type LocalUpdateStage =
  | 'idle'
  | 'checking'
  | 'fetching'
  | 'pulling'
  | 'installing-dependencies'
  | 'building'
  | 'installing'
  | 'relaunching'
  | 'done'
  | 'failed'

export type LocalUpdateState = 'current' | 'available' | 'blocked' | 'unknown'

export interface LocalUpdateConfig {
  repoPath: string
  installTarget: string
}

export interface LocalUpdateStatus {
  state: LocalUpdateState
  updateAvailable: boolean
  currentVersion: string
  latestVersion?: string
  repoPath: string
  installTarget: string
  currentBranch?: string
  upstream?: string
  localCommit?: string
  remoteCommit?: string
  remoteUrl?: string
  dirty: boolean
  message: string
  messageKey?: string
  messageParams?: I18nParams
  checkedAt: string
}

export interface LocalUpdateProgress {
  stage: LocalUpdateStage
  message: string
  messageKey?: string
  messageParams?: I18nParams
  detail?: string
}

export interface LocalUpdateResult {
  updated: boolean
  previousVersion: string
  currentVersion: string
  installedPath: string
  needsRelaunch: boolean
  message: string
  messageKey?: string
  messageParams?: I18nParams
}

export interface MacCleanerApi {
  scan(language?: AppLanguage): Promise<ScanSummary>
  cancelScan(): Promise<void>
  cleanupPreview(candidateIds: string[], language?: AppLanguage): Promise<CleanupPreview>
  moveToTrash(candidateIds: string[], confirmationId: string, language?: AppLanguage): Promise<CleanupResult>
  revealPath(pathToken: string): Promise<RevealResult>
  checkForLocalUpdate(language?: AppLanguage): Promise<LocalUpdateStatus>
  runLocalSourceUpdate(language?: AppLanguage): Promise<LocalUpdateResult>
  configureLocalUpdate(config: Partial<LocalUpdateConfig>): Promise<LocalUpdateConfig>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onLocalUpdateProgress(listener: (progress: LocalUpdateProgress) => void): () => void
}
