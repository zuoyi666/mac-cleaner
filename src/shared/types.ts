export type SafetyLevel = 'safe' | 'confirm' | 'discouraged'

export type AppLanguage = 'zh-CN' | 'en-US'
export type AppTheme = 'hacker-dark' | 'aurora-light' | 'neon-night' | 'solar-minimal'
export type ThemePreference = AppTheme

export type I18nParams = Record<string, string | number>

export type ScanMode = 'standard' | 'comprehensive'
export type EstimateSource = 'file-stat' | 'filesystem-walk' | 'partial-filesystem-walk' | 'blocked'
export type CandidateDisplayKind = 'single' | 'group'
export type RevealTargetKind = 'file' | 'directory' | 'missing' | 'unknown'
export type RevealMethod = 'finder-reveal' | 'open-path' | 'none'
export type StorageInsightRisk = 'safe-opportunity' | 'review' | 'not-recommended'
export type StorageRecommendationKind =
  | 'git-garbage'
  | 'xcode-simulator-cache'
  | 'homebrew-temp'
  | 'codex-history'
  | 'codex-worktree'
  | 'claude-vm'
  | 'large-app'
  | 'manual-review'
export type StorageRecommendationRisk = 'safe' | 'confirm' | 'manual-only'
export type RecommendationAction = 'move-to-trash' | 'run-safe-tool' | 'open-owner-app' | 'reveal-only'
export type RecommendationConfidence = 'high' | 'medium' | 'low'
export type RecommendationDecision = 'recommended-cleanup' | 'review-first' | 'manual-tool' | 'do-not-delete'
export type ScanUrgency = 'healthy' | 'low-space' | 'critical'
export type ScanBriefBucketKind = 'recommended-cleanup' | 'review-first' | 'manual-tool' | 'do-not-delete'
export type FullDiskAccessStatus = 'unknown' | 'likely-granted' | 'likely-missing'
export type StorageInsightKind =
  | 'directory'
  | 'application'
  | 'large-file'
  | 'user-content'
  | 'developer-data'
  | 'system-support'
  | 'privacy-data'
  | 'blocked'
export type IssueGroupKind = 'permission' | 'timeout' | 'symlink' | 'protected' | 'other'

export type CleanupKind =
  | 'cache'
  | 'log'
  | 'diagnostic'
  | 'http-storage'
  | 'saved-state'
  | 'download-archive'
  | 'developer-cache'
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

export interface HumanExplanation {
  summary: string
  summaryKey?: string
  summaryParams?: I18nParams
  what: string
  whatKey?: string
  whatParams?: I18nParams
  cleanability: string
  cleanabilityKey?: string
  cleanabilityParams?: I18nParams
  afterAction: string
  afterActionKey?: string
  afterActionParams?: I18nParams
  keepAdvice: string
  keepAdviceKey?: string
  keepAdviceParams?: I18nParams
  nextStep: string
  nextStepKey?: string
  nextStepParams?: I18nParams
}

export type TrustEvidenceTone = 'safe' | 'confirm' | 'blocked' | 'info'

export interface TrustEvidenceItem {
  label: string
  labelKey?: string
  labelParams?: I18nParams
  detail: string
  detailKey?: string
  detailParams?: I18nParams
  tone: TrustEvidenceTone
}

export interface CleanupTrustReport {
  summary: string
  summaryKey?: string
  summaryParams?: I18nParams
  evidence: TrustEvidenceItem[]
  guarantees: TrustEvidenceItem[]
  exclusions: TrustEvidenceItem[]
  recovery: string
  recoveryKey?: string
  recoveryParams?: I18nParams
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
  explanation: HumanExplanation
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

export interface ScanIssueGroup {
  id: string
  kind: IssueGroupKind
  title: string
  titleKey?: string
  message: string
  messageKey?: string
  messageParams?: I18nParams
  severity: 'info' | 'warning' | 'error'
  count: number
  pathSamples: string[]
}

export interface ScanCoverage {
  mode: ScanMode
  fullDiskAccessStatus: FullDiskAccessStatus
  roots: string[]
  scannedRootCount: number
  skippedRootCount: number
  scannedEntries: number
  measuredBytes: number
  inaccessibleCount: number
  timeoutCount: number
  symlinkCount: number
  protectedCount: number
  insightCount: number
}

export interface StorageInsight {
  id: string
  scanId: string
  title: string
  titleKey?: string
  titleParams?: I18nParams
  kind: StorageInsightKind
  risk: StorageInsightRisk
  sizeBytes: number
  itemCount: number
  pathCount: number
  pathPreview: string
  pathSamples: string[]
  pathToken?: string
  canReveal: boolean
  readable: boolean
  estimateSource: EstimateSource
  reason: string
  reasonKey?: string
  reasonParams?: I18nParams
  recommendation: string
  recommendationKey?: string
  recommendationParams?: I18nParams
  explanation: HumanExplanation
  lastModified?: string
}

export interface StorageRecommendation {
  id: string
  scanId: string
  kind: StorageRecommendationKind
  risk: StorageRecommendationRisk
  recommendedAction: RecommendationAction
  canExecute: boolean
  title: string
  titleKey?: string
  titleParams?: I18nParams
  sizeBytes: number
  itemCount: number
  pathCount: number
  pathPreview: string
  pathSamples: string[]
  pathToken?: string
  candidateIds?: string[]
  priorityScore: number
  confidence: RecommendationConfidence
  decision: RecommendationDecision
  evidence: TrustEvidenceItem[]
  doNotTouch: TrustEvidenceItem[]
  advisorSummary: string
  advisorSummaryKey?: string
  advisorSummaryParams?: I18nParams
  estimateSource: EstimateSource
  reason: string
  reasonKey?: string
  reasonParams?: I18nParams
  recommendation: string
  recommendationKey?: string
  recommendationParams?: I18nParams
  actionLabel: string
  actionLabelKey?: string
  actionLabelParams?: I18nParams
  explanation: HumanExplanation
  lastModified?: string
}

export interface ScanBriefBucket {
  kind: ScanBriefBucketKind
  title: string
  titleKey?: string
  description: string
  descriptionKey?: string
  count: number
  totalBytes: number
  recommendationIds: string[]
}

export interface ScanBrief {
  urgency: ScanUrgency
  summary: string
  summaryKey?: string
  summaryParams?: I18nParams
  nextStep: string
  nextStepKey?: string
  nextStepParams?: I18nParams
  topRecommendationIds: string[]
  safeBytes: number
  confirmBytes: number
  manualBytes: number
  blockedBytes: number
  buckets: ScanBriefBucket[]
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
  brief: ScanBrief
  categories: CategorySummary[]
  candidates: CleanupCandidate[]
  recommendations: StorageRecommendation[]
  insights: StorageInsight[]
  issueGroups: ScanIssueGroup[]
  coverage: ScanCoverage
  issues: ScanIssue[]
  trash: TrashSummary
}

export interface RecommendationActionPreview {
  recommendationId: string
  confirmationId: string
  scanId: string
  title: string
  titleKey?: string
  titleParams?: I18nParams
  action: RecommendationAction
  canExecute: boolean
  totalBytes: number
  pathCount: number
  pathSamples: string[]
  operationPaths?: string[]
  trustReport?: CleanupTrustReport
  actionLabel: string
  actionLabelKey?: string
  actionLabelParams?: I18nParams
  explanation: HumanExplanation
  warning: string
  warningKey?: string
  expiresAt: string
}

export interface RecommendationActionResult {
  recommendationId: string
  action: RecommendationAction
  executed: boolean
  message: string
  messageKey?: string
  messageParams?: I18nParams
  revealResult?: RevealResult
  cleanupResult?: CleanupResult
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

export interface ScanRequest {
  language?: AppLanguage
  mode?: ScanMode
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
  operationPaths?: string[]
  trustReport?: CleanupTrustReport
  impact: string
  impactKey?: string
  explanation?: HumanExplanation
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
  scan(request?: AppLanguage | ScanRequest): Promise<ScanSummary>
  cancelScan(): Promise<void>
  cleanupPreview(candidateIds: string[], language?: AppLanguage): Promise<CleanupPreview>
  moveToTrash(candidateIds: string[], confirmationId: string, language?: AppLanguage): Promise<CleanupResult>
  previewRecommendationAction(recommendationId: string, language?: AppLanguage): Promise<RecommendationActionPreview>
  runRecommendationAction(recommendationId: string, confirmationId: string, language?: AppLanguage): Promise<RecommendationActionResult>
  revealPath(pathToken: string): Promise<RevealResult>
  openFullDiskAccessSettings(): Promise<RevealResult>
  checkForLocalUpdate(language?: AppLanguage): Promise<LocalUpdateStatus>
  runLocalSourceUpdate(language?: AppLanguage): Promise<LocalUpdateResult>
  configureLocalUpdate(config: Partial<LocalUpdateConfig>): Promise<LocalUpdateConfig>
  getLanguagePreference(): Promise<AppLanguage | null>
  setLanguagePreference(language: AppLanguage): Promise<AppLanguage>
  getThemePreference(): Promise<ThemePreference | null>
  setThemePreference(themePreference: ThemePreference): Promise<ThemePreference>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onLocalUpdateProgress(listener: (progress: LocalUpdateProgress) => void): () => void
}
