import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
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
  X
} from 'lucide-react'
import type {
  AppLanguage,
  CategorySummary,
  CleanupCandidate,
  CleanupFailure,
  CleanupPreview,
  CleanupResult,
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
  { labelKey: string; className: string; icon: typeof ShieldCheck; descriptionKey: string }
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

const themeOptions: Array<{ value: ThemePreference; labelKey: string }> = [
  { value: 'system', labelKey: 'theme.system' },
  { value: 'hacker-dark', labelKey: 'theme.hackerDark' },
  { value: 'aurora-light', labelKey: 'theme.auroraLight' },
  { value: 'graphite-pro', labelKey: 'theme.graphitePro' },
  { value: 'solar-minimal', labelKey: 'theme.solarMinimal' }
]

const categoryIcons: Record<string, typeof Archive> = {
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
  const [resultView, setResultView] = useState<'cleanup' | 'map'>('cleanup')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [language, setLanguage] = useState<AppLanguage>(() => readStoredLanguage())
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => readSystemPrefersDark())
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

  const activeTheme = useMemo(() => resolveThemePreference(themePreference, systemPrefersDark), [themePreference, systemPrefersDark])

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
    document.documentElement.style.colorScheme = isLightTheme(activeTheme) ? 'light' : 'dark'
  }, [activeTheme])

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return undefined
    const updateSystemTheme = (): void => setSystemPrefersDark(mediaQuery.matches)
    updateSystemTheme()
    mediaQuery.addEventListener?.('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener?.('change', updateSystemTheme)
  }, [])

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
        if (!cancelled) setLocalUpdateStatus(status)
      } catch {
        if (!cancelled) setLocalUpdateStatus(null)
      }
    }
    void initialUpdateCheck()
    return () => {
      cancelled = true
    }
  }, [macCleaner, language])

  const categories = summary?.categories ?? []
  const candidates = summary?.candidates ?? []
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
        localizeCandidateReason(candidate, language).toLowerCase().includes(lowerQuery)
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
        localizeInsightRecommendation(insight, language).toLowerCase().includes(lowerQuery)
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

  const totalCandidates = candidates.length
  const selectedCleanableIds = useMemo(
    () => filteredCandidates.filter((candidate) => selectedIds.has(candidate.id) && candidate.canClean).map((candidate) => candidate.id),
    [filteredCandidates, selectedIds]
  )
  const usedPercent = summary?.disk.totalBytes
    ? Math.round((summary.disk.usedBytes / summary.disk.totalBytes) * 100)
    : 0

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
      setSelectedCandidateId(nextSummary.candidates[0]?.id ?? null)
      setSelectedInsightId(nextSummary.insights[0]?.id ?? null)
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
      const visibleCleanableIds = filteredCandidates
        .filter((candidate) => candidate.canClean && candidate.safety === 'safe')
        .map((candidate) => candidate.id)
      const allSelected = visibleCleanableIds.every((candidateId) => current.has(candidateId))
      const next = new Set(current)
      for (const candidateId of visibleCleanableIds) {
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
      setLocalUpdateStatus(await macCleaner.checkForLocalUpdate(language))
    } catch (updateError) {
      setError(formatError(updateError))
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

        <nav className="nav-list" aria-label={t(language, 'ui.cleanupCandidates')}>
          <button
            className={selectedCategoryId === 'all' ? 'nav-item active' : 'nav-item'}
            onClick={() => setSelectedCategoryId('all')}
          >
            <Archive size={17} />
            <span>{t(language, 'ui.navAllCandidates')}</span>
            <strong>{totalCandidates}</strong>
          </button>
          {categories.map((category) => (
            <CategoryNavItem
              key={category.id}
              category={category}
              language={language}
              active={selectedCategoryId === category.id}
              onSelect={() => setSelectedCategoryId(category.id)}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
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
            <div className="language-toggle" aria-label={t(language, 'ui.languageLabel')}>
              <button className={language === 'zh-CN' ? 'active' : ''} onClick={() => void changeLanguage('zh-CN')}>
                {t(language, 'language.zh')}
              </button>
              <button className={language === 'en-US' ? 'active' : ''} onClick={() => void changeLanguage('en-US')}>
                {t(language, 'language.en')}
              </button>
            </div>
            <label className="theme-picker">
              <span>{t(language, 'theme.label')}</span>
              <select
                className="theme-select"
                value={themePreference}
                aria-label={t(language, 'theme.label')}
                onChange={(event) => void changeThemePreference(event.target.value as ThemePreference)}
              >
                {themeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(language, option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
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

        <section className="overview-grid" aria-label={t(language, 'ui.storageOverview')}>
          <div className="overview-panel disk-panel">
            <div
              className="donut"
              style={{ '--used-percent': `${usedPercent}%` } as CSSProperties}
              aria-label={t(language, 'ui.diskUsedAria', { percent: usedPercent })}
            >
              <span>{usedPercent}%</span>
              <small>{t(language, 'ui.used')}</small>
            </div>
            <div className="disk-copy">
              <span>{t(language, 'ui.releasable')}</span>
              <strong>{formatBytes(summary?.totalCleanableBytes ?? 0)}</strong>
              <p>{t(language, 'ui.diskCopy', { available: formatBytes(summary?.disk.availableBytes ?? 0) })}</p>
            </div>
          </div>

          <div className="overview-panel progress-panel">
            <div className="panel-heading">
              <span>{t(language, 'ui.scanStatus')}</span>
              <strong>{summary ? formatDateTime(summary.scannedAt, language) : t(language, 'ui.notScanned')}</strong>
            </div>
            <div className="scan-status">
              <div className={isScanning ? 'pulse-dot active' : 'pulse-dot'} />
              <div>
                <strong>{localizeProgress(progress, language) ?? t(language, 'ui.startScanHint')}</strong>
                <span>
                  {progress?.currentPath ?? t(language, 'ui.noMutationHint')}
                  {progress?.percent !== undefined ? ` · ${progress.percent}%` : ''}
                </span>
              </div>
            </div>
            {summary?.coverage && (
              <div className="coverage-line">
                {t(language, 'ui.coverageLine', {
                  scanned: summary.coverage.scannedRootCount.toLocaleString(language),
                  skipped: summary.coverage.skippedRootCount.toLocaleString(language),
                  blocked: summary.coverage.inaccessibleCount.toLocaleString(language)
                })}
              </div>
            )}
            {summary?.issueGroups?.length ? (
              <details className="issue-details">
                <summary>
                  <Info size={15} />
                  <span>{t(language, 'ui.issueSummary', { count: summary.issues.length.toLocaleString(language) })}</span>
                </summary>
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
                    <p>{t(language, 'ui.fullDiskAccessHint')}</p>
                    <button className="secondary-button mini" onClick={() => void openFullDiskAccessSettings()}>
                      <ShieldCheck size={14} />
                      {t(language, 'ui.fullDiskAccessCta')}
                    </button>
                  </div>
                )}
              </details>
            ) : (
              <div className="issue-line muted">
                <CheckCircle2 size={15} />
                <span>{t(language, 'ui.noIssues')}</span>
              </div>
            )}
          </div>
        </section>

        <section className="content-grid">
          <div className="candidate-panel">
            <div className="result-tabs" role="tablist" aria-label={t(language, 'ui.storageOverview')}>
              <button className={resultView === 'cleanup' ? 'active' : ''} onClick={() => setResultView('cleanup')}>
                <ShieldCheck size={15} />
                {t(language, 'ui.viewCleanup')}
              </button>
              <button className={resultView === 'map' ? 'active' : ''} onClick={() => setResultView('map')}>
                <HardDrive size={15} />
                {t(language, 'ui.viewMap')}
              </button>
            </div>
            <div className="table-toolbar">
              <div className="toolbar-summary">
                <span>{resultView === 'cleanup' ? t(language, 'ui.cleanupCandidates') : t(language, 'ui.spaceMapTitle')}</span>
                <strong>
                  {resultView === 'cleanup'
                    ? t(language, 'ui.itemCount', { count: filteredCandidates.length.toLocaleString(language) })
                    : t(language, 'ui.spaceMapCount', { count: filteredInsights.length.toLocaleString(language) })}
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
                {resultView === 'cleanup' && (
                  <div className="toolbar-actions">
                  <button
                    className="secondary-button compact-action"
                    onClick={toggleAllVisible}
                    disabled={!filteredCandidates.some((candidate) => candidate.canClean && candidate.safety === 'safe')}
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

            {resultView === 'cleanup' ? (
              <>
                <div className="candidate-table" role="table" aria-label={t(language, 'ui.cleanupCandidates')}>
                  <div className="table-row table-head" role="row">
                    <span>{t(language, 'ui.tableItem')}</span>
                    <span>{t(language, 'ui.tableSafety')}</span>
                    <span>{t(language, 'ui.tableSize')}</span>
                    <span>{t(language, 'ui.tableImpact')}</span>
                    <span>{t(language, 'ui.tableActions')}</span>
                  </div>
                  {filteredCandidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      language={language}
                      selected={selectedCandidate?.id === candidate.id}
                      checked={selectedIds.has(candidate.id)}
                      onSelect={() => setSelectedCandidateId(candidate.id)}
                      onToggleSelect={() => toggleCandidate(candidate.id)}
                      onReveal={() => reveal(candidate)}
                      onCleanup={() => openCleanupPreview([candidate.id])}
                    />
                  ))}
                </div>

                {!filteredCandidates.length && (
                  <div className="empty-state">
                    <ShieldCheck size={28} />
                    <strong>{summary ? t(language, 'ui.emptyFilteredTitle') : t(language, 'ui.emptyInitialTitle')}</strong>
                    <span>{summary ? t(language, 'ui.emptyFilteredText') : t(language, 'ui.emptyInitialText')}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="candidate-table insight-table" role="table" aria-label={t(language, 'ui.spaceMapTitle')}>
                  <div className="table-row table-head" role="row">
                    <span>{t(language, 'ui.tableItem')}</span>
                    <span>{t(language, 'ui.tableSafety')}</span>
                    <span>{t(language, 'ui.tableSize')}</span>
                    <span>{t(language, 'ui.tableImpact')}</span>
                    <span>{t(language, 'ui.tableActions')}</span>
                  </div>
                  {filteredInsights.map((insight) => (
                    <InsightRow
                      key={insight.id}
                      insight={insight}
                      language={language}
                      selected={selectedInsight?.id === insight.id}
                      onSelect={() => setSelectedInsightId(insight.id)}
                      onReveal={() => revealInsight(insight)}
                    />
                  ))}
                </div>

                {!filteredInsights.length && (
                  <div className="empty-state">
                    <HardDrive size={28} />
                    <strong>{summary ? t(language, 'ui.spaceMapEmptyTitle') : t(language, 'ui.emptyInitialTitle')}</strong>
                    <span>{summary ? t(language, 'ui.spaceMapEmptyText') : t(language, 'ui.emptyInitialText')}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {resultView === 'cleanup' ? (
            <CandidateInspector
              candidate={selectedCandidate}
              language={language}
              onReveal={selectedCandidate ? () => reveal(selectedCandidate) : undefined}
              onCleanup={selectedCandidate ? () => openCleanupPreview([selectedCandidate.id]) : undefined}
            />
          ) : (
            <InsightInspector
              insight={selectedInsight}
              language={language}
              onReveal={selectedInsight ? () => revealInsight(selectedInsight) : undefined}
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

function CategoryNavItem({
  category,
  language,
  active,
  onSelect
}: {
  category: CategorySummary
  language: AppLanguage
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const Icon = categoryIcons[category.id] ?? Archive
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onSelect}>
      <Icon size={17} />
      <span>{localizeCategoryName(category, language)}</span>
      <strong>{formatBytes(category.sizeBytes)}</strong>
    </button>
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

  return (
    <div
      className={selected ? 'table-row candidate-row selected' : 'table-row candidate-row'}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <span className="candidate-title">
        <span className="candidate-title-line">
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
          <strong>
            {localizeCandidateTitle(candidate, language)}
            {candidate.displayKind === 'group' && <em className="group-chip">{t(language, 'ui.groupBadge')}</em>}
          </strong>
        </span>
        <small>{candidate.pathPreview}</small>
        {candidate.displayKind === 'group' && candidate.groupCount && (
          <small className="group-line">
            {localizeGroupSummary(candidate, language)}
          </small>
        )}
      </span>
      <SafetyBadge safety={candidate.safety} language={language} />
      <span className="size-cell">{formatBytes(candidate.sizeBytes)}</span>
      <span className="impact-cell">{localizeCandidateReason(candidate, language)}</span>
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
        <span className="candidate-title-line">
          <strong>{localizeInsightTitle(insight, language)}</strong>
        </span>
        <small>{insight.pathPreview}</small>
      </span>
      <span className={`safety-badge ${insightRiskClass[insight.risk]}`}>
        <Info size={14} />
        {t(language, `ui.mapRisk.${insight.risk}`)}
      </span>
      <span className="size-cell">{formatBytes(insight.sizeBytes)}</span>
      <span className="impact-cell">{localizeInsightRecommendation(insight, language)}</span>
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
        <span>{t(language, 'ui.whyCleanable')}</span>
        <p>{localizeCandidateReason(candidate, language)}</p>
        <span>{t(language, 'ui.possibleImpact')}</span>
        <p>{localizeCandidateImpact(candidate, language)}</p>
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
        <p>{localizeInsightReason(insight, language)}</p>
        <span>{t(language, 'ui.insightRecommendation')}</span>
        <p>{localizeInsightRecommendation(insight, language)}</p>
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

function ConfirmationModal({
  preview,
  language,
  isCleaning,
  onCancel,
  onConfirm
}: {
  preview: CleanupPreview
  language: AppLanguage
  isCleaning: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
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
        <div className="preview-list">
          {preview.pathSamples.map((sample) => (
            <span key={sample}>{sample}</span>
          ))}
        </div>
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{localizePreviewImpact(preview, language)}</span>
        </div>
        <p className="modal-footnote">{localizePreviewWarning(preview, language)}</p>
        <div className="modal-actions">
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
  return 'system'
}

function hasInitialThemePreference(): boolean {
  return isThemePreference(new URLSearchParams(window.location.search).get('initialThemePreference'))
}

function readSystemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function resolveThemePreference(themePreference: ThemePreference, systemPrefersDark: boolean): AppTheme {
  if (themePreference === 'system') return systemPrefersDark ? 'hacker-dark' : 'aurora-light'
  return themePreference
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'hacker-dark' || value === 'aurora-light' || value === 'graphite-pro' || value === 'solar-minimal'
}

function isLightTheme(theme: AppTheme): boolean {
  return theme === 'aurora-light' || theme === 'solar-minimal'
}

function localizeCategoryName(category: CategorySummary, language: AppLanguage): string {
  return category.nameKey ? t(language, category.nameKey) : category.name
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

function kindPriority(candidate: CleanupCandidate): number {
  if (candidate.safety === 'discouraged') return 9
  if (candidate.kind === 'cache' || candidate.kind === 'log' || candidate.kind === 'diagnostic' || candidate.kind === 'developer-cache') return 0
  if (candidate.kind === 'download-archive') return 1
  return 2
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
