import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  DownloadCloud,
  FileArchive,
  FolderOpen,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import type {
  AppLanguage,
  CleanupCandidate,
  CleanupFailure,
  CleanupPreview,
  CleanupResult,
  FullDiskAccessStatus,
  HumanExplanation,
  LocalUpdateProgress,
  LocalUpdateStatus,
  MacCleanerApi,
  RevealResult,
  SafetyLevel,
  ScanProgress,
  ScanIssueGroup,
  ScanIssue,
  ScanSummary,
  StorageInsight,
  StorageInsightRisk,
  StorageRecommendation,
  StorageRecommendationRisk,
  TrustEvidenceItem,
  AppTheme,
  ThemePreference
} from '../../shared/types'
import { resolveLanguage, t } from '../../shared/i18n'
import { createDemoApi, demoSummary } from './demoApi'

interface MacCleanerAppProps {
  api?: MacCleanerApi
  initialSummary?: ScanSummary | null
}

const safetyMeta: Record<
  SafetyLevel,
  { labelKey: string; className: string; icon: LucideIcon; descriptionKey: string }
> = {
  safe: {
    labelKey: 'safety.safe.label',
    className: 'safe',
    icon: ShieldCheck,
    descriptionKey: 'safety.safe.description'
  },
  confirm: {
    labelKey: 'safety.confirm.label',
    className: 'confirm',
    icon: AlertTriangle,
    descriptionKey: 'safety.confirm.description'
  },
  discouraged: {
    labelKey: 'safety.discouraged.label',
    className: 'discouraged',
    icon: Ban,
    descriptionKey: 'safety.discouraged.description'
  }
}

const LANGUAGE_STORAGE_KEY = 'mac-cleaner-language'
const THEME_STORAGE_KEY = 'mac-cleaner-theme-preference'

const themeOptions: Array<{ value: ThemePreference; labelKey: string; swatchClass: string }> = [
  { value: 'aurora-light', labelKey: 'theme.auroraLight', swatchClass: 'aurora' },
  { value: 'hacker-dark', labelKey: 'theme.hackerDark', swatchClass: 'hacker' },
  { value: 'neon-night', labelKey: 'theme.neonNight', swatchClass: 'neon' },
  { value: 'solar-minimal', labelKey: 'theme.solarMinimal', swatchClass: 'solar' }
]

const categoryIcons: Record<string, LucideIcon> = {
  caches: Sparkles,
  logs: FileArchive,
  diagnostics: AlertTriangle,
  'http-storage': Gauge,
  'saved-state': Clock3,
  downloads: FolderOpen,
  'developer-caches': Gauge
}

const insightRiskClass: Record<StorageInsightRisk, string> = {
  'safe-opportunity': 'safe',
  review: 'confirm',
  'not-recommended': 'discouraged'
}

const recommendationRiskClass: Record<StorageRecommendationRisk, string> = {
  safe: 'safe',
  confirm: 'confirm',
  'manual-only': 'discouraged'
}

type ChecklistSectionKind = 'recommended-cleanup' | 'review-first' | 'manual-tool' | 'do-not-delete'

type ChecklistItem =
  | {
      id: string
      source: 'candidate'
      section: ChecklistSectionKind
      candidate: CleanupCandidate
    }
  | {
      id: string
      source: 'recommendation'
      section: ChecklistSectionKind
      recommendation: StorageRecommendation
    }

interface ChecklistSection {
  kind: ChecklistSectionKind
  titleKey: string
  descriptionKey: string
  items: ChecklistItem[]
  totalBytes: number
}

export function MacCleanerApp({ api, initialSummary }: MacCleanerAppProps): JSX.Element {
  const isBrowserPreview = !api && !window.macCleaner && shouldUseDemoPreview()
  const nativeBridgeMissing = !api && !window.macCleaner && !isBrowserPreview
  const macCleaner = useMemo(
    () => api ?? window.macCleaner ?? (isBrowserPreview ? createDemoApi() : createUnavailableApi()),
    [api, isBrowserPreview]
  )
  const [summary, setSummary] = useState<ScanSummary | null>(
    initialSummary === undefined ? (isBrowserPreview ? demoSummary : null) : initialSummary
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null)
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null)
  const [resultView, setResultView] = useState<'recommendations' | 'cleanup' | 'map'>('recommendations')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [language, setLanguage] = useState<AppLanguage>(() => readStoredLanguage())
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference())
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'recommended' | 'size-desc' | 'risk-desc' | 'name-asc'>('recommended')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [localUpdateStatus, setLocalUpdateStatus] = useState<LocalUpdateStatus | null>(null)
  const [localUpdateProgress, setLocalUpdateProgress] = useState<LocalUpdateProgress | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [cleanupHistory, setCleanupHistory] = useState<Array<{ id: string; at: string; count: number; bytes: number }>>(() =>
    readCleanupHistory()
  )

  useEffect(() => macCleaner.onScanProgress(setProgress), [macCleaner])
  useEffect(() => macCleaner.onLocalUpdateProgress(setLocalUpdateProgress), [macCleaner])

  const activeTheme = 'aurora-light'

  useEffect(() => {
    if (hasInitialThemePreference()) return undefined
    let cancelled = false
    async function loadThemePreference(): Promise<void> {
      try {
        const savedThemePreference = await macCleaner.getThemePreference()
        if (!cancelled && savedThemePreference) {
          setThemePreference(savedThemePreference)
          localStorage.setItem(THEME_STORAGE_KEY, savedThemePreference)
        }
      } catch {
        // Keep the local/browser fallback when the native preference is unavailable.
      }
    }
    void loadThemePreference()
    return () => {
      cancelled = true
    }
  }, [macCleaner])

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme
    document.documentElement.style.colorScheme = 'light'
  }, [activeTheme])

  useEffect(() => {
    if (nativeBridgeMissing) {
      setError(t(language, 'ui.nativeBridgeMissing'))
    }
  }, [language, nativeBridgeMissing])

  useEffect(() => {
    let cancelled = false
    async function initialUpdateCheck(): Promise<void> {
      try {
        const status = await macCleaner.checkForLocalUpdate(language)
        if (!cancelled) {
          setLocalUpdateStatus(status)
          setLocalUpdateProgress(createLocalUpdateCheckCompletion(status, language))
        }
      } catch (updateError) {
        if (!cancelled) {
          setLocalUpdateStatus(null)
          setLocalUpdateProgress(createLocalUpdateFailureProgress(updateError, language))
        }
      }
    }
    void initialUpdateCheck()
    return () => {
      cancelled = true
    }
  }, [macCleaner, language])

  const categories = summary?.categories ?? []
  const candidates = summary?.candidates ?? []
  const recommendations = summary?.recommendations ?? []
  const insights = summary?.insights ?? []

  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter((candidate) => {
      const matchesCategory = selectedCategoryId === 'all' || candidate.categoryId === selectedCategoryId
      const lowerQuery = query.trim().toLowerCase()
      const matchesQuery =
        !lowerQuery ||
        candidate.title.toLowerCase().includes(lowerQuery) ||
        candidate.pathPreview.toLowerCase().includes(lowerQuery) ||
        localizeCandidateCategoryName(candidate, language).toLowerCase().includes(lowerQuery) ||
        localizeCandidateReason(candidate, language).toLowerCase().includes(lowerQuery) ||
        localizeCandidateExplanationText(candidate, language).toLowerCase().includes(lowerQuery)
      return matchesCategory && matchesQuery
    })
    return sortCandidates(filtered, sortMode)
  }, [candidates, selectedCategoryId, query, sortMode, language])

  const selectedCandidate = useMemo(() => {
    if (selectedCandidateId) {
      const selected = candidates.find((candidate) => candidate.id === selectedCandidateId)
      if (selected) return selected
    }
    return filteredCandidates[0] ?? null
  }, [candidates, filteredCandidates, selectedCandidateId])

  const filteredInsights = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    return insights.filter((insight) => {
      return (
        !lowerQuery ||
        insight.title.toLowerCase().includes(lowerQuery) ||
        insight.pathPreview.toLowerCase().includes(lowerQuery) ||
        localizeInsightReason(insight, language).toLowerCase().includes(lowerQuery) ||
        localizeInsightRecommendation(insight, language).toLowerCase().includes(lowerQuery) ||
        localizeInsightExplanationText(insight, language).toLowerCase().includes(lowerQuery)
      )
    })
  }, [insights, query, language])

  const selectedInsight = useMemo(() => {
    if (selectedInsightId) {
      const selected = insights.find((insight) => insight.id === selectedInsightId)
      if (selected) return selected
    }
    return filteredInsights[0] ?? null
  }, [insights, filteredInsights, selectedInsightId])

  const filteredRecommendations = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    const filtered = recommendations.filter((recommendation) => {
      return (
        !lowerQuery ||
        localizeRecommendationTitle(recommendation, language).toLowerCase().includes(lowerQuery) ||
        recommendation.pathPreview.toLowerCase().includes(lowerQuery) ||
        localizeRecommendationReason(recommendation, language).toLowerCase().includes(lowerQuery) ||
        localizeRecommendationAdvisorSummary(recommendation, language).toLowerCase().includes(lowerQuery) ||
        localizeRecommendationText(recommendation, language).toLowerCase().includes(lowerQuery)
      )
    })
    return sortRecommendations(filtered, sortMode)
  }, [recommendations, query, language, sortMode])

  const selectedRecommendation = useMemo(() => {
    if (selectedRecommendationId) {
      const selected = recommendations.find((recommendation) => recommendation.id === selectedRecommendationId)
      if (selected) return selected
    }
    return filteredRecommendations[0] ?? null
  }, [recommendations, filteredRecommendations, selectedRecommendationId])

  const checklistSections = useMemo(
    () => buildChecklistSections(candidates, recommendations, query, sortMode, language),
    [candidates, recommendations, query, sortMode, language]
  )
  const checklistItems = useMemo(() => checklistSections.flatMap((section) => section.items), [checklistSections])
  const [selectedChecklistItemId, setSelectedChecklistItemId] = useState<string | null>(null)
  const selectedChecklistItem = useMemo(() => {
    if (selectedChecklistItemId) {
      const selected = checklistItems.find((item) => item.id === selectedChecklistItemId)
      if (selected) return selected
    }
    return checklistItems[0] ?? null
  }, [checklistItems, selectedChecklistItemId])

  useEffect(() => {
    if (!selectedChecklistItemId && checklistItems[0]) {
      setSelectedChecklistItemId(checklistItems[0].id)
    }
    if (selectedChecklistItemId && !checklistItems.some((item) => item.id === selectedChecklistItemId)) {
      setSelectedChecklistItemId(checklistItems[0]?.id ?? null)
    }
  }, [checklistItems, selectedChecklistItemId])

  useEffect(() => {
    if (!selectedCandidateId && filteredCandidates[0]) {
      setSelectedCandidateId(filteredCandidates[0].id)
    }
    if (selectedCandidateId && !candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredCandidates[0]?.id ?? null)
    }
  }, [candidates, filteredCandidates, selectedCandidateId])

  useEffect(() => {
    if (!selectedInsightId && filteredInsights[0]) {
      setSelectedInsightId(filteredInsights[0].id)
    }
    if (selectedInsightId && !insights.some((insight) => insight.id === selectedInsightId)) {
      setSelectedInsightId(filteredInsights[0]?.id ?? null)
    }
  }, [insights, filteredInsights, selectedInsightId])

  useEffect(() => {
    if (!selectedRecommendationId && filteredRecommendations[0]) {
      setSelectedRecommendationId(filteredRecommendations[0].id)
    }
    if (selectedRecommendationId && !recommendations.some((recommendation) => recommendation.id === selectedRecommendationId)) {
      setSelectedRecommendationId(filteredRecommendations[0]?.id ?? null)
    }
  }, [recommendations, filteredRecommendations, selectedRecommendationId])

  const totalCandidates = candidates.length
  const visibleSafeCandidateIds = useMemo(
    () =>
      checklistItems.flatMap((item) =>
        item.source === 'candidate' && item.candidate.canClean && item.candidate.safety === 'safe'
          ? [item.candidate.id]
          : []
      ),
    [checklistItems]
  )
  const selectedCleanableIds = useMemo(
    () => visibleSafeCandidateIds.filter((candidateId) => selectedIds.has(candidateId)),
    [visibleSafeCandidateIds, selectedIds]
  )
  const usedPercent = summary?.disk.totalBytes
    ? Math.round((summary.disk.usedBytes / summary.disk.totalBytes) * 100)
    : 0
  const cleanableStats = useMemo(() => calculateCleanableStats(candidates), [candidates])
  const safeCleanablePercent = cleanableStats.cleanableBytes ? Math.round((cleanableStats.safeBytes / cleanableStats.cleanableBytes) * 100) : 0
  const confirmCleanablePercent = cleanableStats.cleanableBytes ? 100 - safeCleanablePercent : 0

  async function runScan(): Promise<void> {
    setIsScanning(true)
    setError(null)
    setNotice(null)
    setResult(null)
    setProgress({ stage: 'starting', message: t(language, 'progress.prepare'), messageKey: 'progress.prepare' })

    try {
      const nextSummary = await macCleaner.scan({ language, mode: 'comprehensive' })
      setSummary(nextSummary)
      setSelectedCategoryId('all')
      setResultView('cleanup')
      setSelectedRecommendationId(nextSummary.recommendations[0]?.id ?? null)
      setSelectedCandidateId(nextSummary.candidates[0]?.id ?? null)
      setSelectedInsightId(nextSummary.insights[0]?.id ?? null)
      setSelectedChecklistItemId(null)
      setSelectedIds(new Set())
    } catch (scanError) {
      setError(formatError(scanError))
    } finally {
      setIsScanning(false)
    }
  }

  async function cancelScan(): Promise<void> {
    try {
      await macCleaner.cancelScan()
    } catch (cancelError) {
      setError(formatError(cancelError))
    }
  }

  async function openCleanupPreview(candidateIds: string[]): Promise<void> {
    setError(null)
    setNotice(null)
    setResult(null)
    try {
      setPreview(await macCleaner.cleanupPreview(candidateIds, language))
    } catch (previewError) {
      setError(formatError(previewError))
    }
  }

  async function confirmCleanup(): Promise<void> {
    if (!preview) return
    setIsCleaning(true)
    setError(null)
    try {
      const cleanupResult = await macCleaner.moveToTrash(preview.candidateIds, preview.confirmationId, language)
      setResult(cleanupResult)
      setPreview(null)
      recordCleanupHistory(cleanupResult, setCleanupHistory)
      if (!isBrowserPreview) {
        const nextSummary = await macCleaner.scan({ language, mode: 'comprehensive' })
        setSummary(nextSummary)
        setSelectedIds(new Set())
      } else {
        setSummary((current) =>
          current
            ? {
                ...current,
                candidates: current.candidates.filter((candidate) => !preview.candidateIds.includes(candidate.id))
              }
            : current
        )
        setSelectedIds(new Set())
      }
    } catch (cleanupError) {
      setError(formatError(cleanupError))
    } finally {
      setIsCleaning(false)
    }
  }

  async function copyCleanupReviewReport(): Promise<void> {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(buildCodexReviewReport(preview, language))
      setError(null)
      setNotice(t(language, 'ui.codexReportCopied'))
    } catch {
      setNotice(null)
      setError(t(language, 'ui.codexReportCopyFailed'))
    }
  }

  function toggleCandidate(candidateId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(candidateId)) next.delete(candidateId)
      else next.add(candidateId)
      return next
    })
  }

  function toggleAllVisible(): void {
    setSelectedIds((current) => {
      const allSelected = visibleSafeCandidateIds.every((candidateId) => current.has(candidateId))
      const next = new Set(current)
      for (const candidateId of visibleSafeCandidateIds) {
        if (allSelected) next.delete(candidateId)
        else next.add(candidateId)
      }
      return next
    })
  }

  async function changeLanguage(nextLanguage: AppLanguage): Promise<void> {
    setLanguage(nextLanguage)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage)
    try {
      await macCleaner.setLanguagePreference(nextLanguage)
    } catch (preferenceError) {
      setError(formatError(preferenceError))
    }
  }

  async function changeThemePreference(nextThemePreference: ThemePreference): Promise<void> {
    setThemePreference(nextThemePreference)
    localStorage.setItem(THEME_STORAGE_KEY, nextThemePreference)
    try {
      await macCleaner.setThemePreference(nextThemePreference)
    } catch (preferenceError) {
      setError(formatError(preferenceError))
    }
  }

  async function reveal(candidate: CleanupCandidate): Promise<void> {
    try {
      const revealResult = await macCleaner.revealPath(candidate.pathToken)
      handleRevealResult(revealResult)
    } catch (revealError) {
      setNotice(null)
      setError(formatError(revealError))
    }
  }

  async function revealInsight(insight: StorageInsight): Promise<void> {
    if (!insight.pathToken) {
      setNotice(t(language, 'ui.revealUnavailable'))
      return
    }
    try {
      const revealResult = await macCleaner.revealPath(insight.pathToken)
      handleRevealResult(revealResult)
    } catch (revealError) {
      setNotice(null)
      setError(formatError(revealError))
    }
  }

  async function revealRecommendation(recommendation: StorageRecommendation): Promise<void> {
    if (!recommendation.pathToken) {
      setNotice(t(language, 'ui.revealUnavailable'))
      return
    }
    try {
      const revealResult = await macCleaner.revealPath(recommendation.pathToken)
      handleRevealResult(revealResult)
    } catch (revealError) {
      setNotice(null)
      setError(formatError(revealError))
    }
  }

  async function handleRecommendationAction(recommendation: StorageRecommendation): Promise<void> {
    if (recommendation.canExecute && recommendation.recommendedAction === 'move-to-trash' && recommendation.candidateIds?.length) {
      await openCleanupPreview(recommendation.candidateIds)
      return
    }
    await revealRecommendation(recommendation)
  }

  async function openFullDiskAccessSettings(): Promise<void> {
    setError(null)
    try {
      const result = await macCleaner.openFullDiskAccessSettings()
      handleRevealResult(result)
    } catch (settingsError) {
      setError(formatError(settingsError))
    }
  }

  async function revealTrash(): Promise<void> {
    const trashToken = summary?.trash.pathToken
    if (!trashToken) {
      setNotice(t(language, 'ui.revealUnavailable'))
      return
    }
    try {
      const revealResult = await macCleaner.revealPath(trashToken)
      handleRevealResult(revealResult)
    } catch (revealError) {
      setNotice(null)
      setError(formatError(revealError))
    }
  }

  function handleRevealResult(revealResult: RevealResult): void {
    if (revealResult.ok) {
      setError(null)
      setNotice(localizeRevealResult(revealResult, language))
      return
    }
    setNotice(null)
    setError(localizeRevealResult(revealResult, language))
  }

  async function checkLocalUpdate(): Promise<void> {
    setIsCheckingUpdate(true)
    setError(null)
    try {
      const status = await macCleaner.checkForLocalUpdate(language)
      setLocalUpdateStatus(status)
      setLocalUpdateProgress(createLocalUpdateCheckCompletion(status, language))
    } catch (updateError) {
      setError(formatError(updateError))
      setLocalUpdateProgress(createLocalUpdateFailureProgress(updateError, language))
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  async function runLocalUpdate(): Promise<void> {
    setIsUpdating(true)
    setError(null)
    setShowUpdateConfirm(false)
    try {
      const updateResult = await macCleaner.runLocalSourceUpdate(language)
      setLocalUpdateProgress({
        stage: updateResult.needsRelaunch ? 'relaunching' : 'done',
        message: updateResult.message,
        messageKey: updateResult.messageKey,
        messageParams: updateResult.messageParams
      })
      if (!updateResult.needsRelaunch) {
        setLocalUpdateStatus(await macCleaner.checkForLocalUpdate(language))
      }
    } catch (updateError) {
      setError(formatError(updateError))
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="window-drag-zone" />
        <div className="brand">
          <div className="brand-mark">
            <HardDrive size={19} />
          </div>
          <div>
            <strong>Mac Cleaner</strong>
            <span>{t(language, 'ui.brandSubtitle')}</span>
          </div>
        </div>

        <nav className="nav-list plain-nav" aria-label={t(language, 'ui.mainNavigation')}>
          <button
            className={resultView !== 'map' ? 'nav-item active' : 'nav-item'}
            onClick={() => setResultView('cleanup')}
          >
            <CheckCircle2 size={17} />
            <span>{t(language, 'ui.navScanCleanup')}</span>
            <strong>{checklistItems.length}</strong>
          </button>
          <button
            className={resultView === 'map' ? 'nav-item active' : 'nav-item'}
            onClick={() => setResultView('map')}
          >
            <FolderOpen size={17} />
            <span>{t(language, 'ui.navSpaceMap')}</span>
            <strong>{filteredInsights.length}</strong>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="local-promise-card">
            <strong>{t(language, 'ui.localPromiseTitle')}</strong>
            <span><CheckCircle2 size={14} />{t(language, 'ui.localPromiseReadOnly')}</span>
            <span><CheckCircle2 size={14} />{t(language, 'ui.localPromiseNoUpload')}</span>
            <span><CheckCircle2 size={14} />{t(language, 'ui.localPromiseTrashOnly')}</span>
            <span><CheckCircle2 size={14} />{t(language, 'ui.localPromiseNoAuto')}</span>
          </div>
          <div className="trash-card">
            <Trash2 size={17} />
            <div>
              <span>{t(language, 'ui.trashUsed')}</span>
              <strong>{formatBytes(summary?.trash.sizeBytes ?? 0)}</strong>
            </div>
            <button
              className="icon-button trash-open-button"
              title={t(language, 'ui.openTrashTitle')}
              aria-label={t(language, 'ui.openTrashTitle')}
              disabled={!summary?.trash.pathToken}
              onClick={revealTrash}
            >
              <FolderOpen size={14} />
            </button>
          </div>
          <p>{t(language, 'ui.trashPolicy')}</p>
          <div className="settings-card">
            <strong>{t(language, 'ui.settingsTitle')}</strong>
            <span>{t(language, 'ui.settingsSubtitle')}</span>
            <div className="settings-group">
              <span>{t(language, 'ui.settingsLanguage')}</span>
              <div className="language-toggle" aria-label={t(language, 'ui.languageLabel')}>
                <button className={language === 'zh-CN' ? 'active' : ''} onClick={() => void changeLanguage('zh-CN')}>
                  {t(language, 'language.zh')}
                </button>
                <button className={language === 'en-US' ? 'active' : ''} onClick={() => void changeLanguage('en-US')}>
                  {t(language, 'language.en')}
                </button>
              </div>
            </div>
            <div className="local-update-box">
              <div className="local-update-heading">
                <strong>{t(language, 'ui.localUpdateTitle')}</strong>
                <span className={`update-state ${localUpdateStatus?.state ?? 'unknown'}`}>
                  {formatLocalUpdateState(localUpdateStatus, language)}
                </span>
              </div>
              <span>{formatLocalUpdateVersion(localUpdateStatus, language)}</span>
              <span>{formatLocalUpdateBranch(localUpdateStatus, language)}</span>
              <span>{formatLocalUpdateTarget(localUpdateStatus, language)}</span>
              {localUpdateProgress && (
                <span className="update-progress-line">
                  {t(language, 'ui.localUpdateProgress')}: {localizeLocalUpdateProgress(localUpdateProgress, language)}
                </span>
              )}
              <div className="local-update-actions">
                <button className="secondary-button mini" onClick={checkLocalUpdate} disabled={isCheckingUpdate || isUpdating}>
                  {isCheckingUpdate ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                  {t(language, 'ui.localUpdateCheck')}
                </button>
                <button
                  className="primary-button mini"
                  onClick={() => setShowUpdateConfirm(true)}
                  disabled={!localUpdateStatus?.updateAvailable || isUpdating}
                >
                  {isUpdating ? <Loader2 className="spin" size={14} /> : <DownloadCloud size={14} />}
                  {t(language, 'ui.localUpdateSync')}
                </button>
              </div>
            </div>
          </div>
          <div className="history-card">
            <strong>{t(language, 'ui.historyTitle')}</strong>
            {cleanupHistory.length ? (
              cleanupHistory.slice(0, 3).map((entry) => (
                <span key={entry.id}>
                  {t(language, 'ui.historyEntry', {
                    count: entry.count.toLocaleString(language),
                    bytes: formatBytes(entry.bytes),
                    date: formatDate(entry.at, language)
                  })}
                </span>
              ))
            ) : (
              <span>{t(language, 'ui.historyEmpty')}</span>
            )}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="caption">{t(language, 'ui.caption')}</p>
            <h1>{t(language, 'ui.title')}</h1>
          </div>
          <div className="topbar-actions">
            <div className="disk-selector">
              <HardDrive size={16} />
              <span>{summary?.disk.mountPath ?? 'Macintosh HD'}</span>
            </div>
            <button className="primary-button" onClick={runScan} disabled={isScanning || nativeBridgeMissing}>
              {isScanning ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              {isScanning ? t(language, 'ui.scanning') : t(language, 'ui.scanStorage')}
            </button>
            {isScanning && (
              <button className="secondary-button" onClick={cancelScan}>
                {t(language, 'ui.cancelScan')}
              </button>
            )}
          </div>
        </header>

        {isBrowserPreview && (
          <div className="preview-banner">
            {t(language, 'ui.previewBanner')}
          </div>
        )}

        {localUpdateStatus?.updateAvailable && (
          <div className="update-banner">
            <div>
              <DownloadCloud size={17} />
              <span>{t(language, 'ui.localUpdateBannerText')}</span>
            </div>
            <button className="primary-button" onClick={() => setShowUpdateConfirm(true)} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="spin" size={16} /> : <DownloadCloud size={16} />}
              {t(language, 'ui.localUpdateSync')}
            </button>
          </div>
        )}

        <section className="plain-summary" aria-label={t(language, 'ui.storageOverview')}>
          <div>
            <span>{t(language, 'ui.summaryDisk')}</span>
            <strong>{summary?.disk.mountPath ?? 'Macintosh HD'}</strong>
            <p>
              {summary
                ? t(language, 'ui.summaryDiskUsage', {
                    total: formatBytes(summary.disk.totalBytes),
                    used: formatBytes(summary.disk.usedBytes),
                    usedPercent,
                    available: formatBytes(summary.disk.availableBytes)
                  })
                : t(language, 'ui.notScanned')}
            </p>
          </div>
          <div>
            <span>{t(language, 'ui.summaryCanMove')}</span>
            <strong>{formatBytes(cleanableStats.safeBytes)}</strong>
            <p>{t(language, 'ui.summaryCanMoveHint')}</p>
          </div>
          <div>
            <span>{t(language, 'ui.summaryReview')}</span>
            <strong>{formatBytes(cleanableStats.confirmBytes)}</strong>
            <p>{t(language, 'ui.summaryReviewHint')}</p>
          </div>
          <div>
            <span>{t(language, 'ui.summaryLastScan')}</span>
            <strong>{summary ? formatDateTime(summary.scannedAt, language) : t(language, 'ui.notScanned')}</strong>
            <p>{localizeProgress(progress, language) ?? t(language, 'ui.noMutationHint')}</p>
          </div>
        </section>

        {summary?.brief && (
          <section className="plain-scan-note" aria-label={t(language, 'ui.scanBriefTitle')}>
            <div>
              <strong>{t(language, 'ui.scanBriefTitle')}</strong>
              <p>{localizeScanBriefSummary(summary.brief, language)}</p>
            </div>
            <span>{localizeScanBriefNextStep(summary.brief, language)}</span>
          </section>
        )}

        {summary?.issueGroups?.length ? (
          <details className="issue-details plain-issues">
            <summary>
              <Info size={15} />
              <span>{t(language, 'ui.issueSummary', { count: summary.issues.length.toLocaleString(language) })}</span>
            </summary>
            <div
              className="issue-details-body"
              role="region"
              tabIndex={0}
              aria-label={t(language, 'ui.issueDetailsBodyAria')}
            >
              {summary.issueGroups.length > 1 && (
                <div className="issue-scroll-hint">{t(language, 'ui.issueScrollHint')}</div>
              )}
              {summary.issueGroups.map((group) => (
                <div className="issue-group-row" key={group.id}>
                  <strong>{localizeIssueGroupTitle(group, language)}</strong>
                  <p>{localizeIssueGroupMessage(group, language)}</p>
                  {group.pathSamples.slice(0, 4).map((sample) => (
                    <code key={sample}>{sample}</code>
                  ))}
                </div>
              ))}
              <div className="permission-note">
                <ShieldCheck size={15} />
                <span>{t(language, 'ui.permissionIssueNote')}</span>
              </div>
              {summary.issueGroups.some((group) => group.kind === 'permission') && (
                <div className="permission-cta">
                  {summary.coverage.fullDiskAccessStatus === 'likely-granted' ? (
                    <>
                      <p>{t(language, 'ui.fullDiskAccessGrantedHint')}</p>
                      <span className="permission-status-pill granted">
                        <CheckCircle2 size={14} />
                        {t(language, 'ui.insightReadableYes')}
                      </span>
                    </>
                  ) : (
                    <>
                      <p>
                        {summary.coverage.fullDiskAccessStatus === 'unknown'
                          ? t(language, 'ui.fullDiskAccessUnknownHint')
                          : t(language, 'ui.fullDiskAccessHint')}
                      </p>
                      <button className="secondary-button mini" onClick={() => void openFullDiskAccessSettings()}>
                        <ShieldCheck size={14} />
                        {t(language, 'ui.fullDiskAccessCta')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </details>
        ) : (
          <div className="issue-line muted">
            <CheckCircle2 size={15} />
            <span>{t(language, 'ui.noIssues')}</span>
          </div>
        )}

        <section className="content-grid">
          <div className="candidate-panel plain-panel">
            <div className="table-toolbar plain-toolbar">
              <div className="toolbar-summary">
                <span>{resultView === 'map' ? t(language, 'ui.spaceMapTitle') : t(language, 'ui.checklistTitle')}</span>
                <strong>
                  {resultView === 'map'
                    ? t(language, 'ui.spaceMapCount', { count: filteredInsights.length.toLocaleString(language) })
                    : t(language, 'ui.itemCount', { count: checklistItems.length.toLocaleString(language) })}
                </strong>
              </div>
              <div className="toolbar-controls">
                <label className="search-box">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(language, 'ui.searchPlaceholder')} />
                </label>
                <select className="sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                  <option value="recommended">{t(language, 'ui.sortRecommended')}</option>
                  <option value="size-desc">{t(language, 'ui.sortSize')}</option>
                  <option value="risk-desc">{t(language, 'ui.sortRisk')}</option>
                  <option value="name-asc">{t(language, 'ui.sortName')}</option>
                </select>
                {resultView !== 'map' && (
                  <div className="toolbar-actions">
                    <button
                      className="secondary-button compact-action"
                      onClick={toggleAllVisible}
                      disabled={!visibleSafeCandidateIds.length}
                    >
                      <CheckCircle2 size={15} />
                      <span>{selectedCleanableIds.length ? t(language, 'ui.clearSelection') : t(language, 'ui.selectCleanable')}</span>
                    </button>
                    <button
                      className="primary-button danger compact-action batch-action"
                      onClick={() => openCleanupPreview(selectedCleanableIds)}
                      disabled={!selectedCleanableIds.length}
                    >
                      <Trash2 size={15} />
                      <span>{t(language, 'ui.batchConfirmAction')}</span>
                      <strong className="batch-count-pill">
                        {t(language, 'ui.selectedCountBadge', { count: selectedCleanableIds.length.toLocaleString(language) })}
                      </strong>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="message error-message">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="message info-message">
                <Info size={16} />
                <span>{notice}</span>
              </div>
            )}

            {result && (
              <div className="message success-message cleanup-result-message">
                <div>
                  <CheckCircle2 size={16} />
                  <span>
                    {t(language, 'ui.cleanupResult', {
                      verifiedCount: result.verifiedRemovedCount.toLocaleString(language),
                      successCount: result.successCount.toLocaleString(language),
                      bytes: formatBytes(result.cleanedBytes),
                      trashText:
                        result.trashDeltaBytes !== undefined
                          ? t(language, 'ui.cleanupTrashDelta', { bytes: formatBytes(result.trashDeltaBytes) })
                          : '',
                      failedText: result.failed.length
                        ? t(language, 'ui.cleanupResultFailures', { count: result.failed.length.toLocaleString(language) })
                        : ''
                    })}
                  </span>
                </div>
                <button className="secondary-button mini" onClick={revealTrash}>
                  <FolderOpen size={14} />
                  {t(language, 'ui.openTrash')}
                </button>
                {result.failed.length > 0 && (
                  <details className="failure-details">
                    <summary>{t(language, 'ui.failureDetails')}</summary>
                    {result.failed.slice(0, 8).map((failure) => (
                      <p key={`${failure.candidateId ?? 'unknown'}:${failure.path}`}>
                        {localizeCleanupFailure(failure, language)} · {failure.path}
                      </p>
                    ))}
                  </details>
                )}
              </div>
            )}

            {resultView === 'map' ? (
              <StorageMapPanel
                insights={filteredInsights}
                selectedInsight={selectedInsight}
                language={language}
                onSelect={(insight) => setSelectedInsightId(insight.id)}
                onReveal={(insight) => revealInsight(insight)}
                hasSummary={Boolean(summary)}
              />
            ) : (
              <ChecklistPanel
                sections={checklistSections}
                selectedItem={selectedChecklistItem}
                selectedIds={selectedIds}
                language={language}
                hasSummary={Boolean(summary)}
                onSelect={(item) => {
                  setSelectedChecklistItemId(item.id)
                  if (item.source === 'candidate') setSelectedCandidateId(item.candidate.id)
                  else setSelectedRecommendationId(item.recommendation.id)
                }}
                onToggleCandidate={toggleCandidate}
                onReveal={(item) => {
                  if (item.source === 'candidate') void reveal(item.candidate)
                  else void revealRecommendation(item.recommendation)
                }}
                onCleanup={(candidate) => openCleanupPreview([candidate.id])}
                onRecommendationAction={(recommendation) => void handleRecommendationAction(recommendation)}
              />
            )}
          </div>

          {resultView === 'map' ? (
            <InsightInspector
              insight={selectedInsight}
              language={language}
              onReveal={selectedInsight ? () => revealInsight(selectedInsight) : undefined}
            />
          ) : (
            <ChecklistInspector
              item={selectedChecklistItem}
              language={language}
              onReveal={selectedChecklistItem ? () => selectedChecklistItem.source === 'candidate' ? reveal(selectedChecklistItem.candidate) : revealRecommendation(selectedChecklistItem.recommendation) : undefined}
              onPrimary={selectedChecklistItem ? () => selectedChecklistItem.source === 'candidate' ? openCleanupPreview([selectedChecklistItem.candidate.id]) : void handleRecommendationAction(selectedChecklistItem.recommendation) : undefined}
            />
          )}
        </section>
      </main>

      {preview && (
        <ConfirmationModal
          preview={preview}
          language={language}
          isCleaning={isCleaning}
          onCancel={() => setPreview(null)}
          onCopyReport={copyCleanupReviewReport}
          onConfirm={confirmCleanup}
        />
      )}
      {showUpdateConfirm && localUpdateStatus && (
        <LocalUpdateConfirmationModal
          status={localUpdateStatus}
          language={language}
          isUpdating={isUpdating}
          onCancel={() => setShowUpdateConfirm(false)}
          onConfirm={runLocalUpdate}
        />
      )}
    </div>
  )
}

function ChecklistPanel({
  sections,
  selectedItem,
  selectedIds,
  language,
  hasSummary,
  onSelect,
  onToggleCandidate,
  onReveal,
  onCleanup,
  onRecommendationAction
}: {
  sections: ChecklistSection[]
  selectedItem: ChecklistItem | null
  selectedIds: Set<string>
  language: AppLanguage
  hasSummary: boolean
  onSelect: (item: ChecklistItem) => void
  onToggleCandidate: (candidateId: string) => void
  onReveal: (item: ChecklistItem) => void
  onCleanup: (candidate: CleanupCandidate) => void
  onRecommendationAction: (recommendation: StorageRecommendation) => void
}): JSX.Element {
  const itemCount = sections.reduce((count, section) => count + section.items.length, 0)
  if (!itemCount) {
    return (
      <div className="empty-state plain-empty">
        <ShieldCheck size={28} />
        <strong>{hasSummary ? t(language, 'ui.emptyFilteredTitle') : t(language, 'ui.emptyInitialTitle')}</strong>
        <span>{hasSummary ? t(language, 'ui.emptyFilteredText') : t(language, 'ui.emptyInitialText')}</span>
      </div>
    )
  }

  return (
    <div className="checklist-sections" aria-label={t(language, 'ui.checklistTitle')}>
      {sections.map((section, index) => (
        <section className={`checklist-section ${section.kind}`} key={section.kind}>
          <header className="checklist-section-header">
            <div>
              <span className="checklist-section-number">{index + 1}</span>
              <strong>{t(language, section.titleKey)}</strong>
              <span>{t(language, section.descriptionKey, { count: section.items.length.toLocaleString(language), bytes: formatBytes(section.totalBytes) })}</span>
            </div>
            <em>{t(language, 'ui.sectionTotal', { count: section.items.length.toLocaleString(language), bytes: formatBytes(section.totalBytes) })}</em>
          </header>
          {section.items.length ? (
            <div className="plain-table" role="table" aria-label={t(language, section.titleKey)}>
              <div className="plain-table-head" role="row">
                <span>{t(language, 'ui.tableItem')}</span>
                <span>{t(language, 'ui.tableSize')}</span>
                <span>{t(language, 'ui.whatThisIs')}</span>
                <span>{t(language, 'ui.canDelete')}</span>
                <span>{t(language, 'ui.afterCleanup')}</span>
                <span>{t(language, 'ui.tableActions')}</span>
              </div>
              {section.items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  language={language}
                  selected={selectedItem?.id === item.id}
                  checked={item.source === 'candidate' && selectedIds.has(item.candidate.id)}
                  onSelect={() => onSelect(item)}
                  onToggleCandidate={() => item.source === 'candidate' && onToggleCandidate(item.candidate.id)}
                  onReveal={() => onReveal(item)}
                  onCleanup={() => item.source === 'candidate' && onCleanup(item.candidate)}
                  onRecommendationAction={() => item.source === 'recommendation' && onRecommendationAction(item.recommendation)}
                />
              ))}
            </div>
          ) : (
            <p className="checklist-section-empty">{t(language, 'ui.sectionEmpty')}</p>
          )}
        </section>
      ))}
    </div>
  )
}

function ChecklistRow({
  item,
  language,
  selected,
  checked,
  onSelect,
  onToggleCandidate,
  onReveal,
  onCleanup,
  onRecommendationAction
}: {
  item: ChecklistItem
  language: AppLanguage
  selected: boolean
  checked: boolean
  onSelect: () => void
  onToggleCandidate: () => void
  onReveal: () => void
  onCleanup: () => void
  onRecommendationAction: () => void
}): JSX.Element {
  const handleKeyboardSelect = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }
  const canClean = item.source === 'candidate' && item.candidate.canClean
  const canShowPath = item.source === 'candidate' || Boolean(item.recommendation.pathToken)
  const title = checklistItemTitle(item, language)
  const actionLabel = checklistItemAction(item, language)
  const Icon = checklistItemIcon(item)

  return (
    <div
      className={selected ? `plain-row selected ${item.section}` : `plain-row ${item.section}`}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="plain-item-title">
        {item.source === 'candidate' ? (
          <input
            type="checkbox"
            checked={checked}
            disabled={!canClean || item.candidate.safety !== 'safe'}
            aria-label={t(language, 'ui.selectCandidateAria', { title })}
            onChange={(event) => {
              event.stopPropagation()
              onToggleCandidate()
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="plain-row-spacer" aria-hidden="true" />
        )}
        <span className={`candidate-kind-mark ${checklistItemTone(item)}`}>
          <Icon size={15} />
        </span>
        <span className="candidate-title-copy">
          <strong>{title}</strong>
          <small>{checklistItemPath(item)}</small>
        </span>
      </span>
      <span className="size-cell">{formatBytes(checklistItemSize(item))}</span>
      <span className="plain-copy-cell">{checklistItemExplanation(item, 'what', language)}</span>
      <span className="plain-copy-cell">{checklistItemExplanation(item, 'cleanability', language)}</span>
      <span className="plain-copy-cell">{checklistItemExplanation(item, 'afterAction', language)}</span>
      <span className="row-actions">
        <button
          className="icon-button"
          title={t(language, 'ui.revealInFinder')}
          aria-label={`${t(language, 'ui.revealInFinder')}: ${title}`}
          disabled={!canShowPath}
          onClick={(event) => {
            event.stopPropagation()
            onReveal()
          }}
        >
          <FolderOpen size={15} />
        </button>
        {item.source === 'candidate' ? (
          <button
            className="cleanup-button row-cleanup-button"
            title={canClean ? actionLabel : t(language, 'ui.cannotClean')}
            aria-label={canClean ? `${actionLabel}: ${title}` : `${t(language, 'ui.cannotClean')}: ${title}`}
            disabled={!canClean}
            onClick={(event) => {
              event.stopPropagation()
              onCleanup()
            }}
          >
            <Trash2 size={15} />
            <span className="sr-only">{actionLabel}</span>
          </button>
        ) : (
          <button
            className="icon-button"
            title={actionLabel}
            aria-label={`${actionLabel}: ${title}`}
            onClick={(event) => {
              event.stopPropagation()
              onRecommendationAction()
            }}
          >
            <ChevronRight size={15} />
          </button>
        )}
      </span>
    </div>
  )
}

function ChecklistInspector({
  item,
  language,
  onReveal,
  onPrimary
}: {
  item: ChecklistItem | null
  language: AppLanguage
  onReveal?: () => void
  onPrimary?: () => void
}): JSX.Element {
  if (!item) {
    return (
      <aside className="inspector empty-inspector">
        <ShieldCheck size={30} />
        <strong>{t(language, 'ui.emptyInspectorTitle')}</strong>
        <span>{t(language, 'ui.emptyInspectorText')}</span>
      </aside>
    )
  }

  const title = checklistItemTitle(item, language)
  const tone = checklistItemTone(item)
  const Icon = checklistItemIcon(item)
  const canPrimary = item.source === 'candidate' ? item.candidate.canClean : true

  return (
    <aside className="inspector plain-inspector">
      <div className="inspector-heading">
        <span>{t(language, `ui.checklistSection.${item.section}.short`)}</span>
        <span className={`safety-badge ${tone}`}>
          <Icon size={14} />
          {checklistItemBadge(item, language)}
        </span>
      </div>
      <h2>{title}</h2>
      <p className="path-line">{checklistItemPath(item)}</p>

      <div className="detail-stack plain-detail-stack">
        <div className="detail-item">
          <span>{t(language, 'ui.estimatedSize')}</span>
          <strong>{formatBytes(checklistItemSize(item))}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.pathCount')}</span>
          <strong>{checklistItemPathCount(item).toLocaleString(language)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.lastModified')}</span>
          <strong>{checklistItemLastModified(item, language)}</strong>
        </div>
      </div>

      <section className={`recommendation-card ${tone}`}>
        <div>
          <Icon size={17} />
          <span>{t(language, 'ui.recommendedAction')}</span>
        </div>
        <strong>{checklistItemAction(item, language)}</strong>
        <p>{checklistItemExplanation(item, 'nextStep', language)}</p>
      </section>

      <section className="impact-box plain-note-box">
        <span>{t(language, 'ui.whatThisIs')}</span>
        <p>{checklistItemExplanation(item, 'what', language)}</p>
        <span>{t(language, 'ui.canDelete')}</span>
        <p>{checklistItemExplanation(item, 'cleanability', language)}</p>
        <span>{t(language, 'ui.afterCleanup')}</span>
        <p>{checklistItemExplanation(item, 'afterAction', language)}</p>
        <span>{t(language, 'ui.whenToKeep')}</span>
        <p>{checklistItemExplanation(item, 'keepAdvice', language)}</p>
      </section>

      {item.source === 'candidate' && item.candidate.safety === 'discouraged' && (
        <section className="permission-policy-box">
          <div>
            <ShieldCheck size={17} />
            <strong>{t(language, 'ui.permissionPolicyTitle')}</strong>
          </div>
          <p>{t(language, 'ui.permissionPolicyText')}</p>
        </section>
      )}

      {item.source === 'candidate' ? (
        <>
          <TrustEvidenceSection title={t(language, 'ui.advisorEvidence')} items={candidateTrustEvidence(item.candidate, language)} language={language} />
          <TrustEvidenceSection title={t(language, 'ui.doNotTouch')} items={candidateDoNotTouch(item.candidate, language)} language={language} />
        </>
      ) : (
        <>
          <TrustEvidenceSection title={t(language, 'ui.advisorEvidence')} items={item.recommendation.evidence} language={language} />
          <TrustEvidenceSection title={t(language, 'ui.doNotTouch')} items={item.recommendation.doNotTouch} language={language} />
        </>
      )}

      {item.source === 'candidate' && item.candidate.displayKind === 'group' && (
        <section className="impact-box group-detail-box">
          <span>{t(language, 'ui.pathSamples')}</span>
          <div className="sample-path-list">
            {item.candidate.pathSamples.slice(0, 8).map((sample) => (
              <code key={sample}>{sample}</code>
            ))}
          </div>
        </section>
      )}

      <div className="inspector-actions">
        <button className="secondary-button" onClick={onReveal}>
          <FolderOpen size={16} />
          {t(language, 'ui.revealLocation')}
        </button>
        <button className={item.source === 'candidate' ? 'primary-button danger' : 'secondary-button'} disabled={!canPrimary} onClick={onPrimary}>
          {item.source === 'candidate' ? <Trash2 size={16} /> : <ChevronRight size={16} />}
          {checklistItemAction(item, language)}
        </button>
      </div>
    </aside>
  )
}

function StorageMapPanel({
  insights,
  selectedInsight,
  language,
  onSelect,
  onReveal,
  hasSummary
}: {
  insights: StorageInsight[]
  selectedInsight: StorageInsight | null
  language: AppLanguage
  onSelect: (insight: StorageInsight) => void
  onReveal: (insight: StorageInsight) => void
  hasSummary: boolean
}): JSX.Element {
  if (!insights.length) {
    return (
      <div className="empty-state plain-empty">
        <HardDrive size={28} />
        <strong>{hasSummary ? t(language, 'ui.spaceMapEmptyTitle') : t(language, 'ui.emptyInitialTitle')}</strong>
        <span>{hasSummary ? t(language, 'ui.spaceMapEmptyText') : t(language, 'ui.emptyInitialText')}</span>
      </div>
    )
  }

  return (
    <div className="plain-table map-table" role="table" aria-label={t(language, 'ui.spaceMapTitle')}>
      <div className="plain-table-head" role="row">
        <span>{t(language, 'ui.tableItem')}</span>
        <span>{t(language, 'ui.tableSize')}</span>
        <span>{t(language, 'ui.whatThisIs')}</span>
        <span>{t(language, 'ui.canDelete')}</span>
        <span>{t(language, 'ui.afterCleanup')}</span>
        <span>{t(language, 'ui.tableActions')}</span>
      </div>
      {insights.map((insight) => (
        <InsightRow
          key={insight.id}
          insight={insight}
          language={language}
          selected={selectedInsight?.id === insight.id}
          onSelect={() => onSelect(insight)}
          onReveal={() => onReveal(insight)}
        />
      ))}
    </div>
  )
}

function ScanBriefPanel({
  brief,
  language,
  recommendations,
  onSelectRecommendation
}: {
  brief: ScanSummary['brief']
  language: AppLanguage
  recommendations: StorageRecommendation[]
  onSelectRecommendation: (recommendationId: string) => void
}): JSX.Element {
  const topRecommendations = brief.topRecommendationIds
    .map((recommendationId) => recommendations.find((recommendation) => recommendation.id === recommendationId))
    .filter((recommendation): recommendation is StorageRecommendation => Boolean(recommendation))
    .slice(0, 5)

  return (
    <section className={`scan-brief-panel ${brief.urgency}`} aria-label={t(language, 'ui.scanBriefTitle')}>
      <div className="scan-brief-main">
        <div className="scan-brief-heading">
          <div>
            <span>{t(language, 'ui.scanBriefTitle')}</span>
            <h2>{t(language, `ui.scanUrgency.${brief.urgency}`)}</h2>
          </div>
          <span className={`urgency-pill ${brief.urgency}`}>
            <Gauge size={14} />
            {t(language, `ui.scanUrgency.${brief.urgency}`)}
          </span>
        </div>
        <p>{localizeScanBriefSummary(brief, language)}</p>
        <div className="scan-brief-next-step">
          <ShieldCheck size={16} />
          <div>
            <strong>{t(language, 'ui.scanBriefNextStep')}</strong>
            <span>{localizeScanBriefNextStep(brief, language)}</span>
          </div>
        </div>
        <div className="scan-brief-metrics">
          <div>
            <span>{t(language, 'ui.scanBriefSafeBytes')}</span>
            <strong>{formatBytes(brief.safeBytes)}</strong>
          </div>
          <div>
            <span>{t(language, 'ui.scanBriefConfirmBytes')}</span>
            <strong>{formatBytes(brief.confirmBytes)}</strong>
          </div>
          <div>
            <span>{t(language, 'ui.scanBriefManualBytes')}</span>
            <strong>{formatBytes(brief.manualBytes)}</strong>
          </div>
          <div>
            <span>{t(language, 'ui.scanBriefBlockedBytes')}</span>
            <strong>{formatBytes(brief.blockedBytes)}</strong>
          </div>
        </div>
      </div>
      <div className="scan-brief-side">
        <div className="scan-brief-buckets">
          <span>{t(language, 'ui.scanBriefBuckets')}</span>
          {brief.buckets.map((bucket) => (
            <div className={`scan-brief-bucket ${bucket.kind}`} key={bucket.kind}>
              <strong>{localizeScanBriefBucketTitle(bucket, language)}</strong>
              <span>{localizeScanBriefBucketDescription(bucket, language)}</span>
            </div>
          ))}
        </div>
        <div className="scan-brief-topfinds">
          <span>{t(language, 'ui.scanBriefTopFinds')}</span>
          {topRecommendations.map((recommendation) => (
            <button key={recommendation.id} type="button" onClick={() => onSelectRecommendation(recommendation.id)}>
              <strong>{localizeRecommendationTitle(recommendation, language)}</strong>
              <span>{formatBytes(recommendation.sizeBytes)} · {t(language, `ui.recommendationRisk.${recommendation.risk}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function CandidateRow({
  candidate,
  language,
  selected,
  checked,
  onSelect,
  onToggleSelect,
  onReveal,
  onCleanup
}: {
  candidate: CleanupCandidate
  language: AppLanguage
  selected: boolean
  checked: boolean
  onSelect: () => void
  onToggleSelect: () => void
  onReveal: () => void
  onCleanup: () => void
}): JSX.Element {
  const handleKeyboardSelect = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }
  const CategoryIcon = categoryIcons[candidate.categoryId] ?? Archive

  return (
    <div
      className={selected ? 'table-row candidate-row selected' : 'table-row candidate-row'}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="candidate-title">
        <span className="candidate-title-line candidate-title-line-with-icon">
          <input
            type="checkbox"
            checked={checked}
            disabled={!candidate.canClean}
            aria-label={t(language, 'ui.selectCandidateAria', { title: localizeCandidateTitle(candidate, language) })}
            onChange={(event) => {
              event.stopPropagation()
              onToggleSelect()
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <span className={`candidate-kind-mark ${candidate.safety}`}>
            <CategoryIcon size={15} />
          </span>
          <span className="candidate-title-copy">
            <strong>
              {localizeCandidateTitle(candidate, language)}
              {candidate.displayKind === 'group' && <em className="group-chip">{t(language, 'ui.groupBadge')}</em>}
            </strong>
            <small>{candidate.pathPreview}</small>
            {candidate.displayKind === 'group' && candidate.groupCount && (
              <small className="group-line">
                {localizeGroupSummary(candidate, language)}
              </small>
            )}
          </span>
        </span>
      </span>
      <SafetyBadge safety={candidate.safety} language={language} />
      <span className="size-cell">{formatBytes(candidate.sizeBytes)}</span>
      <span className="impact-cell">{localizeCandidateExplanation(candidate, 'summary', language, localizeCandidateReason(candidate, language))}</span>
      <span className="row-actions">
        <button
          className="icon-button"
          title={t(language, 'ui.revealInFinder')}
          aria-label={`${t(language, 'ui.revealInFinder')}: ${localizeCandidateTitle(candidate, language)}`}
          onClick={(event) => {
            event.stopPropagation()
            onReveal()
          }}
        >
          <FolderOpen size={15} />
        </button>
        <button
          className="cleanup-button row-cleanup-button"
          title={candidate.canClean ? localizeCandidateAction(candidate, language) : t(language, 'ui.cannotClean')}
          aria-label={
            candidate.canClean
              ? `${localizeCandidateAction(candidate, language)}: ${localizeCandidateTitle(candidate, language)}`
              : `${t(language, 'ui.cannotClean')}: ${localizeCandidateTitle(candidate, language)}`
          }
          disabled={!candidate.canClean}
          onClick={(event) => {
            event.stopPropagation()
            onCleanup()
          }}
        >
          <Trash2 size={15} />
          <span className="sr-only">
            {candidate.safety === 'safe' ? t(language, 'ui.cleanupSr') : candidate.canClean ? t(language, 'ui.confirmSr') : t(language, 'ui.disabledSr')}
          </span>
        </button>
      </span>
    </div>
  )
}

function InsightRow({
  insight,
  language,
  selected,
  onSelect,
  onReveal
}: {
  insight: StorageInsight
  language: AppLanguage
  selected: boolean
  onSelect: () => void
  onReveal: () => void
}): JSX.Element {
  const handleKeyboardSelect = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      className={selected ? 'table-row candidate-row selected' : 'table-row candidate-row'}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="candidate-title">
        <span className="candidate-title-line insight-title-line">
          <span className={`candidate-kind-mark ${insightRiskClass[insight.risk]}`}>
            <HardDrive size={15} />
          </span>
          <span className="candidate-title-copy">
            <strong>{localizeInsightTitle(insight, language)}</strong>
            <small>{insight.pathPreview}</small>
          </span>
        </span>
      </span>
      <span className={`safety-badge ${insightRiskClass[insight.risk]}`}>
        <Info size={14} />
        {t(language, `ui.mapRisk.${insight.risk}`)}
      </span>
      <span className="size-cell">{formatBytes(insight.sizeBytes)}</span>
      <span className="impact-cell">{localizeInsightExplanation(insight, 'summary', language, localizeInsightRecommendation(insight, language))}</span>
      <span className="row-actions">
        <button
          className="icon-button"
          title={t(language, 'ui.revealInFinder')}
          aria-label={`${t(language, 'ui.revealInFinder')}: ${localizeInsightTitle(insight, language)}`}
          disabled={!insight.canReveal}
          onClick={(event) => {
            event.stopPropagation()
            onReveal()
          }}
        >
          <FolderOpen size={15} />
        </button>
      </span>
    </div>
  )
}

function RecommendationRow({
  recommendation,
  language,
  selected,
  onSelect,
  onReveal,
  onAction
}: {
  recommendation: StorageRecommendation
  language: AppLanguage
  selected: boolean
  onSelect: () => void
  onReveal: () => void
  onAction: () => void
}): JSX.Element {
  const handleKeyboardSelect = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }
  const Icon = recommendationIcon(recommendation.kind)
  const riskClass = recommendationRiskClass[recommendation.risk]

  return (
    <div
      className={selected ? 'table-row candidate-row selected' : 'table-row candidate-row'}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="candidate-title">
        <span className="candidate-title-line insight-title-line">
          <span className={`candidate-kind-mark ${riskClass}`}>
            <Icon size={15} />
          </span>
          <span className="candidate-title-copy">
            <strong>{localizeRecommendationTitle(recommendation, language)}</strong>
            <small>{recommendation.pathPreview}</small>
          </span>
        </span>
      </span>
      <span className={`safety-badge ${riskClass}`}>
        <Info size={14} />
        {t(language, `ui.recommendationRisk.${recommendation.risk}`)}
      </span>
      <span className="size-cell">{formatBytes(recommendation.sizeBytes)}</span>
      <span className="impact-cell">
        {localizeRecommendationAdvisorSummary(recommendation, language)}
      </span>
      <span className="row-actions">
        <button
          className="icon-button"
          title={t(language, 'ui.revealInFinder')}
          aria-label={`${t(language, 'ui.revealInFinder')}: ${localizeRecommendationTitle(recommendation, language)}`}
          disabled={!recommendation.pathToken}
          onClick={(event) => {
            event.stopPropagation()
            onReveal()
          }}
        >
          <FolderOpen size={15} />
        </button>
        <button
          className={recommendation.canExecute ? 'cleanup-button row-cleanup-button' : 'icon-button'}
          title={localizeRecommendationAction(recommendation, language)}
          aria-label={`${localizeRecommendationAction(recommendation, language)}: ${localizeRecommendationTitle(recommendation, language)}`}
          onClick={(event) => {
            event.stopPropagation()
            onAction()
          }}
        >
          {recommendation.canExecute ? <Trash2 size={15} /> : <ChevronRight size={15} />}
        </button>
      </span>
    </div>
  )
}

function SafetyBadge({ safety, language }: { safety: SafetyLevel; language: AppLanguage }): JSX.Element {
  const meta = safetyMeta[safety]
  const Icon = meta.icon
  return (
    <span className={`safety-badge ${meta.className}`}>
      <Icon size={14} />
      {t(language, meta.labelKey)}
    </span>
  )
}

function CandidateInspector({
  candidate,
  language,
  onReveal,
  onCleanup
}: {
  candidate: CleanupCandidate | null
  language: AppLanguage
  onReveal?: () => void
  onCleanup?: () => void
}): JSX.Element {
  if (!candidate) {
    return (
      <aside className="inspector empty-inspector">
        <ShieldCheck size={30} />
        <strong>{t(language, 'ui.emptyInspectorTitle')}</strong>
        <span>{t(language, 'ui.emptyInspectorText')}</span>
      </aside>
    )
  }

  const meta = safetyMeta[candidate.safety]
  const RiskIcon = meta.icon

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>{localizeCandidateCategoryName(candidate, language)}</span>
        <SafetyBadge safety={candidate.safety} language={language} />
      </div>
      <h2>{localizeCandidateTitle(candidate, language)}</h2>
      <p className="path-line">{candidate.pathPreview}</p>

      <section className={`recommendation-card ${meta.className}`}>
        <div>
          <RiskIcon size={18} />
          <span>{t(language, 'ui.recommendedAction')}</span>
        </div>
        <strong>
          {localizeCandidateExplanation(
            candidate,
            'nextStep',
            language,
            candidate.canClean ? localizeCandidateAction(candidate, language) : t(language, 'ui.cannotClean')
          )}
        </strong>
        <p>{localizeCandidateExplanation(candidate, 'summary', language, localizeCandidateReason(candidate, language))}</p>
      </section>

      <div className="detail-stack">
        <div className="detail-item">
          <span>{t(language, 'ui.estimatedSize')}</span>
          <strong>{formatBytes(candidate.sizeBytes)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.pathCount')}</span>
          <strong>{candidate.pathCount.toLocaleString(language)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.lastModified')}</span>
          <strong>{candidate.lastModified ? formatDate(candidate.lastModified, language) : t(language, 'ui.unknown')}</strong>
        </div>
      </div>

      <section className={`risk-box ${meta.className}`}>
        <div>
          <RiskIcon size={18} />
          <strong>{t(language, meta.labelKey)}</strong>
        </div>
        <p>{t(language, meta.descriptionKey)}</p>
      </section>

      {candidate.safety === 'discouraged' && (
        <section className="permission-policy-box">
          <div>
            <ShieldCheck size={17} />
            <strong>{t(language, 'ui.permissionPolicyTitle')}</strong>
          </div>
          <p>{t(language, 'ui.permissionPolicyText')}</p>
        </section>
      )}

      {candidate.displayKind === 'group' && (
        <section className="impact-box group-detail-box">
          <span>{t(language, 'ui.groupSummary')}</span>
          <p>{localizeGroupSummary(candidate, language)}</p>
          <span>{t(language, 'ui.pathSamples')}</span>
          <div className="sample-path-list">
            {candidate.pathSamples.slice(0, 8).map((sample) => (
              <code key={sample}>{sample}</code>
            ))}
          </div>
        </section>
      )}

      <section className="impact-box">
        <span>{t(language, 'ui.whatThisIs')}</span>
        <p>{localizeCandidateExplanation(candidate, 'what', language, localizeCandidateReason(candidate, language))}</p>
        <span>{t(language, 'ui.canDelete')}</span>
        <p>{localizeCandidateExplanation(candidate, 'cleanability', language, t(language, meta.descriptionKey))}</p>
        <span>{t(language, 'ui.afterCleanup')}</span>
        <p>{localizeCandidateExplanation(candidate, 'afterAction', language, localizeCandidateImpact(candidate, language))}</p>
        <span>{t(language, 'ui.whenToKeep')}</span>
        <p>{localizeCandidateExplanation(candidate, 'keepAdvice', language, candidate.safety === 'safe' ? t(language, 'ui.whenToKeepSafe') : t(language, meta.descriptionKey))}</p>
        <span>{t(language, 'ui.estimateSource')}</span>
        <p>
          {formatEstimateSource(candidate.estimateSource, language)} · {t(language, 'ui.snapshot')} {candidate.pathSnapshotHash.slice(0, 8)}
        </p>
        {candidate.blockedReason && (
          <>
            <span>{t(language, 'ui.whyDiscouraged')}</span>
            <p>{localizeBlockedReason(candidate, language)}</p>
          </>
        )}
      </section>

      <div className="inspector-actions">
        <button className="secondary-button" onClick={onReveal}>
          <FolderOpen size={16} />
          {t(language, 'ui.revealLocation')}
        </button>
        <button className="primary-button danger" disabled={!candidate.canClean} onClick={onCleanup}>
          <Trash2 size={16} />
          {localizeCandidateAction(candidate, language)}
        </button>
      </div>
    </aside>
  )
}

function InsightInspector({
  insight,
  language,
  onReveal
}: {
  insight: StorageInsight | null
  language: AppLanguage
  onReveal?: () => void
}): JSX.Element {
  if (!insight) {
    return (
      <aside className="inspector empty-inspector">
        <HardDrive size={30} />
        <strong>{t(language, 'ui.spaceMapEmptyTitle')}</strong>
        <span>{t(language, 'ui.spaceMapEmptyText')}</span>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>{t(language, 'ui.spaceMapTitle')}</span>
        <span className={`safety-badge ${insightRiskClass[insight.risk]}`}>
          <Info size={14} />
          {t(language, `ui.mapRisk.${insight.risk}`)}
        </span>
      </div>
      <h2>{localizeInsightTitle(insight, language)}</h2>
      <p className="path-line">{insight.pathPreview}</p>

      <section className={`recommendation-card ${insightRiskClass[insight.risk]}`}>
        <div>
          <ShieldCheck size={18} />
          <span>{t(language, 'ui.recommendedAction')}</span>
        </div>
        <strong>{localizeInsightExplanation(insight, 'nextStep', language, t(language, 'ui.revealLocation'))}</strong>
        <p>{localizeInsightExplanation(insight, 'summary', language, localizeInsightRecommendation(insight, language))}</p>
      </section>

      <div className="detail-stack">
        <div className="detail-item">
          <span>{t(language, 'ui.estimatedSize')}</span>
          <strong>{formatBytes(insight.sizeBytes)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.pathCount')}</span>
          <strong>{insight.pathCount.toLocaleString(language)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.insightReadable')}</span>
          <strong>{insight.readable ? t(language, 'ui.insightReadableYes') : t(language, 'ui.insightReadableNo')}</strong>
        </div>
      </div>

      <section className={`risk-box ${insightRiskClass[insight.risk]}`}>
        <div>
          <ShieldCheck size={18} />
          <strong>{t(language, `ui.mapRisk.${insight.risk}`)}</strong>
        </div>
        <p>{t(language, 'ui.insightNotCleanable')}</p>
      </section>

      <section className="impact-box">
        <span>{t(language, 'ui.insightReason')}</span>
        <p>{localizeInsightExplanation(insight, 'what', language, localizeInsightReason(insight, language))}</p>
        <span>{t(language, 'ui.canDelete')}</span>
        <p>{localizeInsightExplanation(insight, 'cleanability', language, t(language, 'ui.insightNotCleanable'))}</p>
        <span>{t(language, 'ui.afterCleanup')}</span>
        <p>{localizeInsightExplanation(insight, 'afterAction', language, localizeInsightRecommendation(insight, language))}</p>
        <span>{t(language, 'ui.whenToKeep')}</span>
        <p>{localizeInsightExplanation(insight, 'keepAdvice', language, localizeInsightRecommendation(insight, language))}</p>
        <span>{t(language, 'ui.estimateSource')}</span>
        <p>{formatEstimateSource(insight.estimateSource, language)}</p>
      </section>

      <div className="inspector-actions">
        <button className="secondary-button" disabled={!insight.canReveal} onClick={onReveal}>
          <FolderOpen size={16} />
          {t(language, 'ui.revealLocation')}
        </button>
      </div>
    </aside>
  )
}

function RecommendationInspector({
  recommendation,
  language,
  onReveal,
  onAction
}: {
  recommendation: StorageRecommendation | null
  language: AppLanguage
  onReveal?: () => void
  onAction?: () => void
}): JSX.Element {
  if (!recommendation) {
    return (
      <aside className="inspector empty-inspector">
        <Sparkles size={30} />
        <strong>{t(language, 'ui.recommendationEmptyTitle')}</strong>
        <span>{t(language, 'ui.recommendationEmptyText')}</span>
      </aside>
    )
  }

  const Icon = recommendationIcon(recommendation.kind)
  const riskClass = recommendationRiskClass[recommendation.risk]

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>{t(language, 'ui.recommendationsTitle')}</span>
        <span className={`safety-badge ${riskClass}`}>
          <Info size={14} />
          {t(language, `ui.recommendationRisk.${recommendation.risk}`)}
        </span>
      </div>
      <h2>{localizeRecommendationTitle(recommendation, language)}</h2>
      <p className="path-line">{recommendation.pathPreview}</p>

      <section className={`recommendation-card ${riskClass}`}>
        <div>
          <Icon size={18} />
          <span>{t(language, 'ui.recommendationAction')}</span>
        </div>
        <strong>{localizeRecommendationExplanation(recommendation, 'nextStep', language, localizeRecommendationAction(recommendation, language))}</strong>
        <p>{localizeRecommendationAdvisorSummary(recommendation, language)}</p>
      </section>

      <div className="detail-stack">
        <div className="detail-item">
          <span>{t(language, 'ui.estimatedSize')}</span>
          <strong>{formatBytes(recommendation.sizeBytes)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.pathCount')}</span>
          <strong>{recommendation.pathCount.toLocaleString(language)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.recommendationAction')}</span>
          <strong>{localizeRecommendationAction(recommendation, language)}</strong>
        </div>
        <div className="detail-item">
          <span>{t(language, 'ui.confidence')}</span>
          <strong>{t(language, `ui.confidence.${recommendation.confidence}`)}</strong>
        </div>
      </div>

      <section className={`risk-box ${riskClass}`}>
        <div>
          <ShieldCheck size={18} />
          <strong>{t(language, `ui.recommendationRisk.${recommendation.risk}`)}</strong>
        </div>
        <p>{recommendation.canExecute ? localizeRecommendationRecommendation(recommendation, language) : t(language, 'ui.recommendationNotExecutable')}</p>
      </section>

      <TrustEvidenceSection title={t(language, 'ui.advisorEvidence')} items={recommendation.evidence} language={language} />
      <TrustEvidenceSection title={t(language, 'ui.doNotTouch')} items={recommendation.doNotTouch} language={language} />

      <section className="impact-box">
        <span>{t(language, 'ui.whatThisIs')}</span>
        <p>{localizeRecommendationExplanation(recommendation, 'what', language, localizeRecommendationReason(recommendation, language))}</p>
        <span>{t(language, 'ui.canDelete')}</span>
        <p>{localizeRecommendationExplanation(recommendation, 'cleanability', language, localizeRecommendationRecommendation(recommendation, language))}</p>
        <span>{t(language, 'ui.afterCleanup')}</span>
        <p>{localizeRecommendationExplanation(recommendation, 'afterAction', language, localizeRecommendationRecommendation(recommendation, language))}</p>
        <span>{t(language, 'ui.whenToKeep')}</span>
        <p>{localizeRecommendationExplanation(recommendation, 'keepAdvice', language, localizeRecommendationRecommendation(recommendation, language))}</p>
        <span>{t(language, 'ui.estimateSource')}</span>
        <p>{formatEstimateSource(recommendation.estimateSource, language)}</p>
      </section>

      <div className="inspector-actions">
        <button className="secondary-button" disabled={!recommendation.pathToken} onClick={onReveal}>
          <FolderOpen size={16} />
          {t(language, 'ui.revealLocation')}
        </button>
        <button className={recommendation.canExecute ? 'primary-button danger' : 'secondary-button'} onClick={onAction}>
          {recommendation.canExecute ? <Trash2 size={16} /> : <ChevronRight size={16} />}
          {localizeRecommendationAction(recommendation, language)}
        </button>
      </div>
    </aside>
  )
}

function ConfirmationModal({
  preview,
  language,
  isCleaning,
  onCancel,
  onCopyReport,
  onConfirm
}: {
  preview: CleanupPreview
  language: AppLanguage
  isCleaning: boolean
  onCancel: () => void
  onCopyReport: () => void
  onConfirm: () => void
}): JSX.Element {
  const operationPaths = preview.operationPaths?.length ? preview.operationPaths : preview.pathSamples
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal trust-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="modal-close icon-button" onClick={onCancel} aria-label={t(language, 'ui.closeModal')}>
          <X size={16} />
        </button>
        <div className="modal-icon">
          <Trash2 size={22} />
        </div>
        <h2 id="confirm-title">{t(language, 'ui.confirmModalTitle')}</h2>
        <p>
          {renderConfirmText(preview, language)}
        </p>
        {preview.trustReport && (
          <div className="trust-decision">
            <span>{t(language, 'ui.trustDecision')}</span>
            <strong>{localizeTrustSummary(preview.trustReport, language)}</strong>
          </div>
        )}
        <div className="modal-safety-promise">
          <ShieldCheck size={17} />
          <div>
            <strong>{t(language, 'ui.modalSafetyPromiseTitle')}</strong>
            <span>{t(language, 'ui.modalSafetyPromiseText')}</span>
          </div>
        </div>
        <div className="confirmation-summary">
          <div>
            <span>{t(language, 'ui.confirmEstimatedSize')}</span>
            <strong>{formatBytes(preview.totalBytes)}</strong>
          </div>
          <div>
            <span>{t(language, 'ui.confirmPathCount')}</span>
            <strong>{preview.pathCount.toLocaleString(language)}</strong>
          </div>
          <div>
            <span>{t(language, 'ui.confirmOperationPathCount')}</span>
            <strong>{operationPaths.length.toLocaleString(language)}</strong>
          </div>
        </div>
        {preview.trustReport && (
          <div className="trust-grid">
            <TrustEvidenceSection title={t(language, 'ui.trustEvidence')} items={preview.trustReport.evidence} language={language} />
            <TrustEvidenceSection title={t(language, 'ui.trustGuarantees')} items={preview.trustReport.guarantees} language={language} />
            <TrustEvidenceSection title={t(language, 'ui.trustExclusions')} items={preview.trustReport.exclusions} language={language} />
            <section className="trust-section">
              <h3>{t(language, 'ui.trustRecovery')}</h3>
              <p>{localizeTrustRecovery(preview.trustReport, language)}</p>
            </section>
          </div>
        )}
        <details className="operation-paths" open>
          <summary>{t(language, 'ui.operationPathList')}</summary>
          <p>{t(language, 'ui.operationPathListHelp')}</p>
          <div className="preview-list">
            {operationPaths.map((sample) => (
              <span key={sample}>{sample}</span>
            ))}
          </div>
        </details>
        {preview.explanation && (
          <div className="modal-explanation">
            <div>
              <strong>{t(language, 'ui.afterCleanup')}</strong>
              <span>{localizePreviewExplanation(preview, 'afterAction', language, localizePreviewImpact(preview, language))}</span>
            </div>
            <div>
              <strong>{t(language, 'ui.whenToKeep')}</strong>
              <span>{localizePreviewExplanation(preview, 'keepAdvice', language, localizePreviewWarning(preview, language))}</span>
            </div>
          </div>
        )}
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{localizePreviewExplanation(preview, 'summary', language, localizePreviewImpact(preview, language))}</span>
        </div>
        <p className="modal-footnote">{localizePreviewWarning(preview, language)}</p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCopyReport} disabled={isCleaning}>
            <Copy size={16} />
            {t(language, 'ui.copyCodexReview')}
          </button>
          <button className="secondary-button" onClick={onCancel} disabled={isCleaning}>
            {t(language, 'ui.cancel')}
          </button>
          <button className="primary-button danger" onClick={onConfirm} disabled={isCleaning}>
            {isCleaning ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {t(language, 'ui.confirmMoveToTrash')}
          </button>
        </div>
      </section>
    </div>
  )
}

function TrustEvidenceSection({
  title,
  items,
  language
}: {
  title: string
  items: TrustEvidenceItem[]
  language: AppLanguage
}): JSX.Element {
  return (
    <section className="trust-section">
      <h3>{title}</h3>
      <div className="trust-evidence-list">
        {items.map((item) => (
          <div className={`trust-evidence-item ${item.tone}`} key={`${item.labelKey ?? item.label}-${item.detailKey ?? item.detail}`}>
            <CheckCircle2 size={15} />
            <div>
              <strong>{localizeTrustItemLabel(item, language)}</strong>
              <span>{localizeTrustItemDetail(item, language)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LocalUpdateConfirmationModal({
  status,
  language,
  isUpdating,
  onCancel,
  onConfirm
}: {
  status: LocalUpdateStatus
  language: AppLanguage
  isUpdating: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="update-confirm-title">
        <button className="modal-close icon-button" onClick={onCancel} aria-label={t(language, 'ui.closeModal')}>
          <X size={16} />
        </button>
        <div className="modal-icon update-icon">
          <DownloadCloud size={22} />
        </div>
        <h2 id="update-confirm-title">{t(language, 'ui.localUpdateConfirmTitle')}</h2>
        <p>{t(language, 'ui.localUpdateConfirmText', { installTarget: status.installTarget })}</p>
        <div className="preview-list">
          <span>{formatLocalUpdateVersion(status, language)}</span>
          <span>{formatLocalUpdateBranch(status, language)}</span>
          <span>{formatLocalUpdateTarget(status, language)}</span>
        </div>
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{localizeLocalUpdateStatus(status, language)}</span>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} disabled={isUpdating}>
            {t(language, 'ui.localUpdateCancelButton')}
          </button>
          <button className="primary-button" onClick={onConfirm} disabled={isUpdating}>
            {isUpdating ? <Loader2 className="spin" size={16} /> : <DownloadCloud size={16} />}
            {t(language, 'ui.localUpdateConfirmButton')}
          </button>
        </div>
      </section>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

function readStoredLanguage(): AppLanguage {
  const initialLanguage = new URLSearchParams(window.location.search).get('initialLanguage')
  if (initialLanguage === 'zh-CN' || initialLanguage === 'en-US') return initialLanguage
  return resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? navigator.language)
}

function readStoredThemePreference(): ThemePreference {
  const initialThemePreference = new URLSearchParams(window.location.search).get('initialThemePreference')
  if (isThemePreference(initialThemePreference)) return initialThemePreference
  const storedThemePreference = localStorage.getItem(THEME_STORAGE_KEY)
  if (isThemePreference(storedThemePreference)) return storedThemePreference
  return 'aurora-light'
}

function hasInitialThemePreference(): boolean {
  return isThemePreference(new URLSearchParams(window.location.search).get('initialThemePreference'))
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'hacker-dark' || value === 'aurora-light' || value === 'neon-night' || value === 'solar-minimal'
}

function isLightTheme(theme: AppTheme): boolean {
  return theme === 'aurora-light' || theme === 'solar-minimal'
}

function localizeCandidateTitle(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.titleKey ? t(language, candidate.titleKey, candidate.titleParams) : candidate.title
}

function localizeCandidateCategoryName(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.categoryNameKey ? t(language, candidate.categoryNameKey) : candidate.categoryName
}

function localizeGroupSummary(candidate: CleanupCandidate, language: AppLanguage): string {
  if (!candidate.groupSummaryKey) return ''
  return t(language, candidate.groupSummaryKey, candidate.groupSummaryParams)
}

function localizeCandidateReason(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.reasonKey ? t(language, candidate.reasonKey, candidate.blockedReasonParams) : candidate.reason
}

function localizeCandidateImpact(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.impactKey ? t(language, candidate.impactKey) : candidate.impact
}

type HumanExplanationField = 'summary' | 'what' | 'cleanability' | 'afterAction' | 'keepAdvice' | 'nextStep'

function localizeCandidateExplanation(
  candidate: CleanupCandidate,
  field: HumanExplanationField,
  language: AppLanguage,
  fallback = ''
): string {
  return localizeHumanExplanation(candidate.explanation, field, language, fallback)
}

function localizeCandidateExplanationText(candidate: CleanupCandidate, language: AppLanguage): string {
  return localizeHumanExplanationText(candidate.explanation, language)
}

function localizeInsightExplanation(
  insight: StorageInsight,
  field: HumanExplanationField,
  language: AppLanguage,
  fallback = ''
): string {
  return localizeHumanExplanation(insight.explanation, field, language, fallback)
}

function localizeInsightExplanationText(insight: StorageInsight, language: AppLanguage): string {
  return localizeHumanExplanationText(insight.explanation, language)
}

function localizeRecommendationExplanation(
  recommendation: StorageRecommendation,
  field: HumanExplanationField,
  language: AppLanguage,
  fallback = ''
): string {
  return localizeHumanExplanation(recommendation.explanation, field, language, fallback)
}

function localizeRecommendationText(recommendation: StorageRecommendation, language: AppLanguage): string {
  return [
    localizeRecommendationTitle(recommendation, language),
    localizeRecommendationReason(recommendation, language),
    localizeRecommendationRecommendation(recommendation, language),
    localizeHumanExplanationText(recommendation.explanation, language)
  ].join(' ')
}

function localizePreviewExplanation(
  preview: CleanupPreview,
  field: HumanExplanationField,
  language: AppLanguage,
  fallback = ''
): string {
  return localizeHumanExplanation(preview.explanation, field, language, fallback)
}

function localizeHumanExplanation(
  explanation: HumanExplanation | undefined,
  field: HumanExplanationField,
  language: AppLanguage,
  fallback = ''
): string {
  if (!explanation) return fallback
  const key = explanation[`${field}Key` as keyof HumanExplanation] as string | undefined
  const params = explanation[`${field}Params` as keyof HumanExplanation] as Record<string, string | number> | undefined
  return key ? t(language, key, params) : explanation[field] || fallback
}

function localizeHumanExplanationText(explanation: HumanExplanation | undefined, language: AppLanguage): string {
  if (!explanation) return ''
  return (['summary', 'what', 'cleanability', 'afterAction', 'keepAdvice', 'nextStep'] as HumanExplanationField[])
    .map((field) => localizeHumanExplanation(explanation, field, language))
    .join(' ')
}

function localizeCandidateAction(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.actionLabelKey ? t(language, candidate.actionLabelKey) : candidate.actionLabel
}

function localizeBlockedReason(candidate: CleanupCandidate, language: AppLanguage): string {
  return candidate.blockedReasonKey ? t(language, candidate.blockedReasonKey, candidate.blockedReasonParams) : candidate.blockedReason ?? ''
}

function localizeIssue(issue: ScanIssue, language: AppLanguage): string {
  return issue.messageKey ? t(language, issue.messageKey, issue.messageParams) : issue.message
}

function localizeIssueGroupTitle(group: ScanIssueGroup, language: AppLanguage): string {
  return group.titleKey ? t(language, group.titleKey, group.messageParams) : group.title
}

function localizeIssueGroupMessage(group: ScanIssueGroup, language: AppLanguage): string {
  return group.messageKey ? t(language, group.messageKey, group.messageParams) : group.message
}

function localizeInsightTitle(insight: StorageInsight, language: AppLanguage): string {
  return insight.titleKey ? t(language, insight.titleKey, insight.titleParams) : insight.title
}

function localizeInsightReason(insight: StorageInsight, language: AppLanguage): string {
  return insight.reasonKey ? t(language, insight.reasonKey, insight.reasonParams) : insight.reason
}

function localizeInsightRecommendation(insight: StorageInsight, language: AppLanguage): string {
  return insight.recommendationKey ? t(language, insight.recommendationKey, insight.recommendationParams) : insight.recommendation
}

function localizeRecommendationTitle(recommendation: StorageRecommendation, language: AppLanguage): string {
  return recommendation.titleKey ? t(language, recommendation.titleKey, recommendation.titleParams) : recommendation.title
}

function localizeRecommendationReason(recommendation: StorageRecommendation, language: AppLanguage): string {
  return recommendation.reasonKey ? t(language, recommendation.reasonKey, recommendation.reasonParams) : recommendation.reason
}

function localizeRecommendationRecommendation(recommendation: StorageRecommendation, language: AppLanguage): string {
  return recommendation.recommendationKey ? t(language, recommendation.recommendationKey, recommendation.recommendationParams) : recommendation.recommendation
}

function localizeRecommendationAction(recommendation: StorageRecommendation, language: AppLanguage): string {
  return recommendation.actionLabelKey ? t(language, recommendation.actionLabelKey, recommendation.actionLabelParams) : recommendation.actionLabel
}

function localizeRecommendationAdvisorSummary(recommendation: StorageRecommendation, language: AppLanguage): string {
  return recommendation.advisorSummaryKey
    ? t(language, recommendation.advisorSummaryKey, recommendation.advisorSummaryParams)
    : recommendation.advisorSummary
}

function localizeScanBriefSummary(brief: ScanSummary['brief'], language: AppLanguage): string {
  return brief.summaryKey ? t(language, brief.summaryKey, brief.summaryParams) : brief.summary
}

function localizeScanBriefNextStep(brief: ScanSummary['brief'], language: AppLanguage): string {
  return brief.nextStepKey ? t(language, brief.nextStepKey, brief.nextStepParams) : brief.nextStep
}

function localizeScanBriefBucketTitle(bucket: ScanSummary['brief']['buckets'][number], language: AppLanguage): string {
  return bucket.titleKey ? t(language, bucket.titleKey, { count: bucket.count, bytes: formatBytes(bucket.totalBytes) }) : bucket.title
}

function localizeScanBriefBucketDescription(bucket: ScanSummary['brief']['buckets'][number], language: AppLanguage): string {
  return bucket.descriptionKey
    ? t(language, bucket.descriptionKey, { count: bucket.count.toLocaleString(language), bytes: formatBytes(bucket.totalBytes) })
    : bucket.description
}

function localizeCleanupFailure(failure: CleanupFailure, language: AppLanguage): string {
  return failure.errorKey ? t(language, failure.errorKey, failure.errorParams) : failure.error
}

function localizeRevealResult(result: RevealResult, language: AppLanguage): string {
  return result.messageKey ? t(language, result.messageKey, result.messageParams) : result.message
}

function localizeProgress(progress: ScanProgress | null, language: AppLanguage): string | null {
  if (!progress) return null
  return progress.messageKey ? t(language, progress.messageKey, progress.messageParams) : progress.message
}

function localizeLocalUpdateProgress(progress: LocalUpdateProgress, language: AppLanguage): string {
  return progress.messageKey ? t(language, progress.messageKey, progress.messageParams) : progress.message
}

function localizeLocalUpdateStatus(status: LocalUpdateStatus, language: AppLanguage): string {
  return status.messageKey ? t(language, status.messageKey, status.messageParams) : status.message
}

function createLocalUpdateCheckCompletion(status: LocalUpdateStatus, language: AppLanguage): LocalUpdateProgress {
  if (status.state === 'current') {
    return {
      stage: 'done',
      message: t(language, 'localUpdate.progress.checkedCurrent'),
      messageKey: 'localUpdate.progress.checkedCurrent'
    }
  }
  if (status.state === 'available') {
    return {
      stage: 'done',
      message: t(language, 'localUpdate.progress.checkedAvailable'),
      messageKey: 'localUpdate.progress.checkedAvailable'
    }
  }
  const message = localizeLocalUpdateStatus(status, language)
  return {
    stage: 'done',
    message: t(language, 'localUpdate.progress.checkedWithMessage', { message }),
    messageKey: 'localUpdate.progress.checkedWithMessage',
    messageParams: { message }
  }
}

function createLocalUpdateFailureProgress(error: unknown, language: AppLanguage): LocalUpdateProgress {
  const message = formatError(error)
  return {
    stage: 'failed',
    message: t(language, 'localUpdate.progress.failed', { error: message }),
    messageKey: 'localUpdate.progress.failed',
    messageParams: { error: message }
  }
}

function formatLocalUpdateState(status: LocalUpdateStatus | null, language: AppLanguage): string {
  if (!status) return t(language, 'ui.localUpdateUnknown')
  if (status.state === 'available') return t(language, 'ui.localUpdateAvailable')
  if (status.state === 'blocked') return t(language, 'ui.localUpdateBlocked')
  if (status.state === 'current') return t(language, 'ui.localUpdateCurrent')
  return t(language, 'ui.localUpdateUnknown')
}

function formatLocalUpdateVersion(status: LocalUpdateStatus | null, language: AppLanguage): string {
  const currentVersion = status?.currentVersion ?? 'unknown'
  const latestVersion = status?.latestVersion ?? currentVersion
  return t(language, 'ui.localUpdateVersion', { currentVersion, latestVersion })
}

function formatLocalUpdateBranch(status: LocalUpdateStatus | null, language: AppLanguage): string {
  return t(language, 'ui.localUpdateBranch', {
    branch: status?.currentBranch ?? 'unknown',
    upstream: status?.upstream ?? 'no upstream'
  })
}

function formatLocalUpdateTarget(status: LocalUpdateStatus | null, language: AppLanguage): string {
  return t(language, 'ui.localUpdateInstallTarget', {
    installTarget: status?.installTarget ?? '~/Desktop/Mac Cleaner.app'
  })
}

function localizePreviewTitle(preview: CleanupPreview, language: AppLanguage): string {
  return preview.titleKey ? t(language, preview.titleKey, preview.titleParams) : preview.title
}

function localizePreviewImpact(preview: CleanupPreview, language: AppLanguage): string {
  return preview.impactKey ? t(language, preview.impactKey) : preview.impact
}

function localizePreviewWarning(preview: CleanupPreview, language: AppLanguage): string {
  return preview.warningKey ? t(language, preview.warningKey) : preview.warning
}

function localizeTrustSummary(report: NonNullable<CleanupPreview['trustReport']>, language: AppLanguage): string {
  return report.summaryKey ? t(language, report.summaryKey, report.summaryParams) : report.summary
}

function localizeTrustRecovery(report: NonNullable<CleanupPreview['trustReport']>, language: AppLanguage): string {
  return report.recoveryKey ? t(language, report.recoveryKey, report.recoveryParams) : report.recovery
}

function localizeTrustItemLabel(item: TrustEvidenceItem, language: AppLanguage): string {
  return item.labelKey ? t(language, item.labelKey, item.labelParams) : item.label
}

function localizeTrustItemDetail(item: TrustEvidenceItem, language: AppLanguage): string {
  return item.detailKey ? t(language, item.detailKey, item.detailParams) : item.detail
}

function buildCodexReviewReport(preview: CleanupPreview, language: AppLanguage): string {
  const operationPaths = preview.operationPaths?.length ? preview.operationPaths : preview.pathSamples
  const lines = [
    language === 'zh-CN'
      ? '请帮我复核 Mac Cleaner 的这次清理预览。'
      : 'Please review this Mac Cleaner cleanup preview.',
    '',
    `${language === 'zh-CN' ? '项目' : 'Item'}: ${localizePreviewTitle(preview, language)}`,
    `${language === 'zh-CN' ? '估算大小' : 'Estimated size'}: ${formatBytes(preview.totalBytes)}`,
    `${language === 'zh-CN' ? '清理方式' : 'Cleanup method'}: ${language === 'zh-CN' ? '只移动到 macOS 废纸篓，不永久删除，不清空废纸篓。' : 'Move to macOS Trash only. No permanent deletion and no emptying Trash.'}`,
    `${language === 'zh-CN' ? '影响说明' : 'Impact'}: ${localizePreviewImpact(preview, language)}`,
    ''
  ]

  if (preview.trustReport) {
    lines.push(`${language === 'zh-CN' ? '我的判断' : 'My judgment'}: ${localizeTrustSummary(preview.trustReport, language)}`)
    lines.push('')
    lines.push(language === 'zh-CN' ? '证据链:' : 'Evidence:')
    for (const item of preview.trustReport.evidence) {
      lines.push(`- ${localizeTrustItemLabel(item, language)}: ${localizeTrustItemDetail(item, language)}`)
    }
    lines.push('')
    lines.push(language === 'zh-CN' ? '不会做的事:' : 'What it will not do:')
    for (const item of [...preview.trustReport.guarantees, ...preview.trustReport.exclusions]) {
      lines.push(`- ${localizeTrustItemLabel(item, language)}: ${localizeTrustItemDetail(item, language)}`)
    }
    lines.push('')
    lines.push(`${language === 'zh-CN' ? '恢复方式' : 'Recovery'}: ${localizeTrustRecovery(preview.trustReport, language)}`)
    lines.push('')
  }

  lines.push(language === 'zh-CN' ? '将移动到废纸篓的入口路径:' : 'Entry paths to move to Trash:')
  for (const operationPath of operationPaths) {
    lines.push(`- ${operationPath}`)
  }
  lines.push('')
  lines.push(language === 'zh-CN'
    ? '请判断这次清理是否合理，以及有没有我应该先保留的风险点。'
    : 'Please tell me whether this cleanup is reasonable and whether anything should be kept first.')
  return lines.join('\n')
}

function calculateCleanableStats(candidates: CleanupCandidate[]): {
  safeBytes: number
  confirmBytes: number
  discouragedBytes: number
  cleanableBytes: number
} {
  return candidates.reduce(
    (stats, candidate) => {
      if (candidate.safety === 'safe' && candidate.canClean) stats.safeBytes += candidate.sizeBytes
      if (candidate.safety === 'confirm' && candidate.canClean) stats.confirmBytes += candidate.sizeBytes
      if (candidate.safety === 'discouraged') stats.discouragedBytes += candidate.sizeBytes
      stats.cleanableBytes = stats.safeBytes + stats.confirmBytes
      return stats
    },
    { safeBytes: 0, confirmBytes: 0, discouragedBytes: 0, cleanableBytes: 0 }
  )
}

function buildChecklistSections(
  candidates: CleanupCandidate[],
  recommendations: StorageRecommendation[],
  query: string,
  sortMode: 'recommended' | 'size-desc' | 'risk-desc' | 'name-asc',
  language: AppLanguage
): ChecklistSection[] {
  const seenCandidateIds = new Set(candidates.map((candidate) => candidate.id))
  const sections: ChecklistSection[] = [
    {
      kind: 'recommended-cleanup',
      titleKey: 'ui.checklistSection.recommended-cleanup.title',
      descriptionKey: 'ui.checklistSection.recommended-cleanup.description',
      items: candidates
        .filter((candidate) => candidate.canClean && candidate.safety === 'safe')
        .map((candidate) => makeCandidateChecklistItem(candidate, 'recommended-cleanup')),
      totalBytes: 0
    },
    {
      kind: 'review-first',
      titleKey: 'ui.checklistSection.review-first.title',
      descriptionKey: 'ui.checklistSection.review-first.description',
      items: [
        ...candidates
          .filter((candidate) => candidate.canClean && candidate.safety === 'confirm')
          .map((candidate) => makeCandidateChecklistItem(candidate, 'review-first')),
        ...recommendations
          .filter((recommendation) => recommendation.decision === 'review-first' && !recommendationOverlapsCandidates(recommendation, seenCandidateIds))
          .map((recommendation) => makeRecommendationChecklistItem(recommendation, 'review-first'))
      ],
      totalBytes: 0
    },
    {
      kind: 'manual-tool',
      titleKey: 'ui.checklistSection.manual-tool.title',
      descriptionKey: 'ui.checklistSection.manual-tool.description',
      items: recommendations
        .filter((recommendation) => recommendation.decision === 'manual-tool' && !recommendationOverlapsCandidates(recommendation, seenCandidateIds))
        .map((recommendation) => makeRecommendationChecklistItem(recommendation, 'manual-tool')),
      totalBytes: 0
    },
    {
      kind: 'do-not-delete',
      titleKey: 'ui.checklistSection.do-not-delete.title',
      descriptionKey: 'ui.checklistSection.do-not-delete.description',
      items: [
        ...candidates
          .filter((candidate) => !candidate.canClean || candidate.safety === 'discouraged')
          .map((candidate) => makeCandidateChecklistItem(candidate, 'do-not-delete')),
        ...recommendations
          .filter((recommendation) => recommendation.decision === 'do-not-delete' && !recommendationOverlapsCandidates(recommendation, seenCandidateIds))
          .map((recommendation) => makeRecommendationChecklistItem(recommendation, 'do-not-delete'))
      ],
      totalBytes: 0
    }
  ]

  return sections.map((section) => {
    const filtered = sortChecklistItems(
      section.items.filter((item) => checklistItemMatchesQuery(item, query, language)),
      sortMode,
      language
    )
    return {
      ...section,
      items: filtered,
      totalBytes: filtered.reduce((sum, item) => sum + checklistItemSize(item), 0)
    }
  })
}

function recommendationOverlapsCandidates(recommendation: StorageRecommendation, candidateIds: Set<string>): boolean {
  return Boolean(recommendation.candidateIds?.some((candidateId) => candidateIds.has(candidateId)))
}

function makeCandidateChecklistItem(candidate: CleanupCandidate, section: ChecklistSectionKind): ChecklistItem {
  return {
    id: `candidate:${candidate.id}`,
    source: 'candidate',
    section,
    candidate
  }
}

function makeRecommendationChecklistItem(recommendation: StorageRecommendation, section: ChecklistSectionKind): ChecklistItem {
  return {
    id: `recommendation:${recommendation.id}`,
    source: 'recommendation',
    section,
    recommendation
  }
}

function checklistItemMatchesQuery(item: ChecklistItem, query: string, language: AppLanguage): boolean {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return true
  const haystack = [
    checklistItemTitle(item, language),
    checklistItemPath(item),
    checklistItemExplanation(item, 'what', language),
    checklistItemExplanation(item, 'cleanability', language),
    checklistItemExplanation(item, 'afterAction', language),
    checklistItemExplanation(item, 'keepAdvice', language),
    checklistItemAction(item, language)
  ].join(' ').toLowerCase()
  return haystack.includes(lowerQuery)
}

function sortChecklistItems(
  items: ChecklistItem[],
  sortMode: 'recommended' | 'size-desc' | 'risk-desc' | 'name-asc',
  language: AppLanguage
): ChecklistItem[] {
  return [...items].sort((left, right) => {
    if (sortMode === 'name-asc') return checklistItemTitle(left, language).localeCompare(checklistItemTitle(right, language))
    if (sortMode === 'size-desc') return checklistItemSize(right) - checklistItemSize(left)
    if (sortMode === 'risk-desc') return checklistItemRiskScore(right) - checklistItemRiskScore(left) || checklistItemSize(right) - checklistItemSize(left)
    return checklistItemPriority(right) - checklistItemPriority(left) || checklistItemSize(right) - checklistItemSize(left)
  })
}

function checklistItemPriority(item: ChecklistItem): number {
  if (item.source === 'recommendation') return item.recommendation.priorityScore
  if (item.candidate.safety === 'safe') return 3_000_000_000_000 + item.candidate.sizeBytes
  if (item.candidate.safety === 'confirm') return 2_000_000_000_000 + item.candidate.sizeBytes
  return item.candidate.sizeBytes
}

function checklistItemRiskScore(item: ChecklistItem): number {
  if (item.section === 'do-not-delete') return 4
  if (item.section === 'manual-tool') return 3
  if (item.section === 'review-first') return 2
  return 1
}

function checklistItemTitle(item: ChecklistItem, language: AppLanguage): string {
  return item.source === 'candidate'
    ? localizeCandidateTitle(item.candidate, language)
    : localizeRecommendationTitle(item.recommendation, language)
}

function checklistItemPath(item: ChecklistItem): string {
  return item.source === 'candidate' ? item.candidate.pathPreview : item.recommendation.pathPreview
}

function checklistItemSize(item: ChecklistItem): number {
  return item.source === 'candidate' ? item.candidate.sizeBytes : item.recommendation.sizeBytes
}

function checklistItemPathCount(item: ChecklistItem): number {
  return item.source === 'candidate' ? item.candidate.pathCount : item.recommendation.pathCount
}

function checklistItemTone(item: ChecklistItem): string {
  if (item.section === 'recommended-cleanup') return 'safe'
  if (item.section === 'do-not-delete') return 'discouraged'
  return 'confirm'
}

function checklistItemBadge(item: ChecklistItem, language: AppLanguage): string {
  if (item.source === 'candidate') return t(language, safetyMeta[item.candidate.safety].labelKey)
  return t(language, `ui.recommendationRisk.${item.recommendation.risk}`)
}

function checklistItemIcon(item: ChecklistItem): LucideIcon {
  if (item.source === 'candidate') return categoryIcons[item.candidate.categoryId] ?? Archive
  return recommendationIcon(item.recommendation.kind)
}

function checklistItemAction(item: ChecklistItem, language: AppLanguage): string {
  return item.source === 'candidate'
    ? localizeCandidateAction(item.candidate, language)
    : localizeRecommendationAction(item.recommendation, language)
}

function checklistItemExplanation(item: ChecklistItem, field: HumanExplanationField, language: AppLanguage): string {
  if (item.source === 'candidate') {
    const meta = safetyMeta[item.candidate.safety]
    const fallback =
      field === 'what'
        ? localizeCandidateReason(item.candidate, language)
        : field === 'afterAction'
          ? localizeCandidateImpact(item.candidate, language)
          : t(language, meta.descriptionKey)
    return localizeCandidateExplanation(item.candidate, field, language, fallback)
  }
  const fallback =
    field === 'what'
      ? localizeRecommendationReason(item.recommendation, language)
      : localizeRecommendationRecommendation(item.recommendation, language)
  return localizeRecommendationExplanation(item.recommendation, field, language, fallback)
}

function checklistItemLastModified(item: ChecklistItem, language: AppLanguage): string {
  const lastModified = item.source === 'candidate' ? item.candidate.lastModified : item.recommendation.lastModified
  return lastModified ? formatDate(lastModified, language) : t(language, 'ui.unknown')
}

function candidateTrustEvidence(candidate: CleanupCandidate, language: AppLanguage): TrustEvidenceItem[] {
  return [
    {
      label: t(language, 'trust.evidence.scan.label'),
      detail: t(language, 'trust.evidence.scan.detail', { count: candidate.pathCount.toLocaleString(language) }),
      tone: 'safe'
    },
    {
      label: t(language, 'advisor.evidence.size.label'),
      detail: t(language, 'advisor.evidence.size.detail', { size: formatBytes(candidate.sizeBytes), path: candidate.pathPreview }),
      tone: 'info'
    },
    {
      label: t(language, candidate.canClean ? 'advisor.evidence.safeCatalog.label' : 'advisor.evidence.manualOnly.label'),
      detail: candidate.canClean
        ? t(language, 'advisor.evidence.safeCatalog.detail')
        : t(language, 'advisor.evidence.manualOnly.detail'),
      tone: candidate.canClean ? 'safe' : 'blocked'
    }
  ]
}

function candidateDoNotTouch(candidate: CleanupCandidate, language: AppLanguage): TrustEvidenceItem[] {
  return [
    {
      label: t(language, 'trust.guarantee.trash.label'),
      detail: t(language, 'trust.guarantee.trash.detail'),
      tone: 'safe'
    },
    {
      label: t(language, 'trust.exclusion.system.label'),
      detail: t(language, 'trust.exclusion.system.detail'),
      tone: 'blocked'
    },
    {
      label: t(language, candidate.canClean ? 'trust.exclusion.outsideList.label' : 'advisor.exclusion.noAutoAction.label'),
      detail: candidate.canClean
        ? t(language, 'trust.exclusion.outsideList.detail')
        : t(language, 'advisor.exclusion.noAutoAction.detail'),
      tone: 'blocked'
    }
  ]
}

function formatFullDiskAccessStatus(status: FullDiskAccessStatus, language: AppLanguage): string {
  if (status === 'likely-granted') return t(language, 'ui.fullDiskAccessGrantedShort')
  if (status === 'likely-missing') return t(language, 'ui.fullDiskAccessMissingShort')
  return t(language, 'ui.fullDiskAccessUnknownShort')
}

function renderConfirmText(preview: CleanupPreview, language: AppLanguage): JSX.Element {
  const title = localizePreviewTitle(preview, language)
  const text = t(language, 'ui.confirmModalText', { title, size: formatBytes(preview.totalBytes) })
  const [beforeTitle, rest = ''] = text.split(title)
  return (
    <>
      {beforeTitle}
      <strong>{title}</strong>
      {rest}
    </>
  )
}

function formatDate(value: string, language: AppLanguage): string {
  return new Date(value).toLocaleDateString(language)
}

function formatDateTime(value: string, language: AppLanguage): string {
  return new Date(value).toLocaleString(language)
}

function sortCandidates(
  candidates: CleanupCandidate[],
  sortMode: 'recommended' | 'size-desc' | 'risk-desc' | 'name-asc'
): CleanupCandidate[] {
  const riskScore: Record<SafetyLevel, number> = { discouraged: 3, confirm: 2, safe: 1 }
  const recommendedSafetyScore: Record<SafetyLevel, number> = { safe: 0, confirm: 1, discouraged: 2 }
  return [...candidates].sort((left, right) => {
    if (sortMode === 'name-asc') return left.title.localeCompare(right.title)
    if (sortMode === 'risk-desc') return riskScore[right.safety] - riskScore[left.safety] || right.sizeBytes - left.sizeBytes
    if (sortMode === 'recommended') {
      return (
        recommendedSafetyScore[left.safety] - recommendedSafetyScore[right.safety] ||
        kindPriority(left) - kindPriority(right) ||
        right.sizeBytes - left.sizeBytes
      )
    }
    return right.sizeBytes - left.sizeBytes
  })
}

function sortRecommendations(
  recommendations: StorageRecommendation[],
  sortMode: 'recommended' | 'size-desc' | 'risk-desc' | 'name-asc'
): StorageRecommendation[] {
  const riskScore: Record<StorageRecommendationRisk, number> = { safe: 3, confirm: 2, 'manual-only': 1 }
  return [...recommendations].sort((left, right) => {
    if (sortMode === 'name-asc') return left.title.localeCompare(right.title)
    if (sortMode === 'risk-desc') return riskScore[right.risk] - riskScore[left.risk] || right.sizeBytes - left.sizeBytes
    if (sortMode === 'recommended') return right.priorityScore - left.priorityScore
    return right.sizeBytes - left.sizeBytes
  })
}

function kindPriority(candidate: CleanupCandidate): number {
  if (candidate.safety === 'discouraged') return 9
  if (candidate.kind === 'cache' || candidate.kind === 'log' || candidate.kind === 'diagnostic' || candidate.kind === 'developer-cache') return 0
  if (candidate.kind === 'download-archive') return 1
  return 2
}

function recommendationIcon(kind: StorageRecommendation['kind']): LucideIcon {
  if (kind === 'git-garbage') return FileArchive
  if (kind === 'xcode-simulator-cache') return Gauge
  if (kind === 'homebrew-temp') return Archive
  if (kind === 'codex-history' || kind === 'codex-worktree') return Sparkles
  if (kind === 'claude-vm') return HardDrive
  if (kind === 'large-app') return FolderOpen
  return Info
}

function formatEstimateSource(source: CleanupCandidate['estimateSource'], language: AppLanguage): string {
  return t(language, `estimate.${source}`)
}

function readCleanupHistory(): Array<{ id: string; at: string; count: number; bytes: number }> {
  try {
    const raw = localStorage.getItem('mac-cleaner-cleanup-history')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 10) : []
  } catch {
    return []
  }
}

function recordCleanupHistory(
  result: CleanupResult,
  setCleanupHistory: (updater: (current: Array<{ id: string; at: string; count: number; bytes: number }>) => Array<{ id: string; at: string; count: number; bytes: number }>) => void
): void {
  if (!result.movedToTrash) return
  setCleanupHistory((current) => {
    const next = [
      {
        id: `${Date.now()}`,
        at: new Date().toISOString(),
        count: result.successCount,
        bytes: result.cleanedBytes
      },
      ...current
    ].slice(0, 10)
    localStorage.setItem('mac-cleaner-cleanup-history', JSON.stringify(next))
    return next
  })
}

function shouldUseDemoPreview(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === '1'
}

function createUnavailableApi(): MacCleanerApi {
  const unavailable = async (): Promise<never> => {
    throw new Error(t(readStoredLanguage(), 'ui.nativeBridgeMissing'))
  }
  return {
    scan: unavailable,
    cancelScan: unavailable,
    cleanupPreview: unavailable,
    moveToTrash: unavailable,
    previewRecommendationAction: unavailable,
    runRecommendationAction: unavailable,
    revealPath: unavailable,
    openFullDiskAccessSettings: unavailable,
    checkForLocalUpdate: unavailable,
    runLocalSourceUpdate: unavailable,
    configureLocalUpdate: unavailable,
    getLanguagePreference: async () => null,
    setLanguagePreference: async (language) => language,
    getThemePreference: async () => null,
    setThemePreference: async (themePreference) => themePreference,
    onScanProgress: () => () => undefined,
    onLocalUpdateProgress: () => () => undefined
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
