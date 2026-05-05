export type SafetyLevel = 'safe' | 'confirm' | 'discouraged'

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
  title: string
  categoryId: string
  categoryName: string
  kind: CleanupKind
  safety: SafetyLevel
  canClean: boolean
  sizeBytes: number
  itemCount: number
  pathPreview: string
  pathToken: string
  reason: string
  impact: string
  actionLabel: string
  lastModified?: string
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
  stage: 'starting' | 'scanning' | 'measuring' | 'done'
  currentPath?: string
  message: string
}

export interface CleanupPreview {
  candidateId: string
  confirmationId: string
  title: string
  totalBytes: number
  pathCount: number
  pathSamples: string[]
  impact: string
  warning: string
  expiresAt: string
}

export interface CleanupFailure {
  path: string
  error: string
}

export interface CleanupResult {
  candidateId: string
  cleanedBytes: number
  successCount: number
  failed: CleanupFailure[]
  movedToTrash: boolean
}

export interface MacCleanerApi {
  scan(): Promise<ScanSummary>
  cleanupPreview(candidateId: string): Promise<CleanupPreview>
  moveToTrash(candidateId: string, confirmationId: string): Promise<CleanupResult>
  revealPath(pathToken: string): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}
