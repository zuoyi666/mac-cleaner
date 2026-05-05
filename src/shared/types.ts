export type SafetyLevel = 'safe' | 'confirm' | 'discouraged'

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
  description: string
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
  impact: string
  actionLabel: string
  lastModified?: string
  blockedReason?: string
}

export interface ScanIssue {
  id: string
  path: string
  message: string
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
  totalBytes: number
  pathCount: number
  pathSamples: string[]
  impact: string
  warning: string
  expiresAt: string
}

export interface CleanupFailure {
  candidateId?: string
  path: string
  error: string
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
  scan(): Promise<ScanSummary>
  cancelScan(): Promise<void>
  cleanupPreview(candidateIds: string[]): Promise<CleanupPreview>
  moveToTrash(candidateIds: string[], confirmationId: string): Promise<CleanupResult>
  revealPath(pathToken: string): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}
