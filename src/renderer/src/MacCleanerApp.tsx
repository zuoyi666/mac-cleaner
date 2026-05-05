import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
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
  CategorySummary,
  CleanupCandidate,
  CleanupPreview,
  CleanupResult,
  MacCleanerApi,
  SafetyLevel,
  ScanProgress,
  ScanSummary
} from '../../shared/types'
import { createDemoApi, demoSummary } from './demoApi'

interface MacCleanerAppProps {
  api?: MacCleanerApi
  initialSummary?: ScanSummary | null
}

const safetyMeta: Record<
  SafetyLevel,
  { label: string; className: string; icon: typeof ShieldCheck; description: string }
> = {
  safe: {
    label: '安全可清理',
    className: 'safe',
    icon: ShieldCheck,
    description: '通常不会影响核心功能，最多重新生成缓存或丢失历史日志。'
  },
  confirm: {
    label: '需确认',
    className: 'confirm',
    icon: AlertTriangle,
    description: '可能仍有使用价值，执行前需要你明确确认。'
  },
  discouraged: {
    label: '不建议清理',
    className: 'discouraged',
    icon: Ban,
    description: '风险或权限状态不明确，工具不会自动处理。'
  }
}

const categoryIcons: Record<string, typeof Archive> = {
  caches: Sparkles,
  logs: FileArchive,
  diagnostics: AlertTriangle,
  'http-storage': Gauge,
  'saved-state': Clock3,
  downloads: FolderOpen
}

export function MacCleanerApp({ api, initialSummary }: MacCleanerAppProps): JSX.Element {
  const isBrowserPreview = !api && !window.macCleaner
  const macCleaner = useMemo(() => api ?? window.macCleaner ?? createDemoApi(), [api])
  const [summary, setSummary] = useState<ScanSummary | null>(
    initialSummary === undefined ? (isBrowserPreview ? demoSummary : null) : initialSummary
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'size-desc' | 'risk-desc' | 'name-asc'>('size-desc')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cleanupHistory, setCleanupHistory] = useState<Array<{ id: string; at: string; count: number; bytes: number }>>(() =>
    readCleanupHistory()
  )

  useEffect(() => macCleaner.onScanProgress(setProgress), [macCleaner])

  const categories = summary?.categories ?? []
  const candidates = summary?.candidates ?? []

  const filteredCandidates = useMemo(() => {
    const filtered = candidates.filter((candidate) => {
      const matchesCategory = selectedCategoryId === 'all' || candidate.categoryId === selectedCategoryId
      const lowerQuery = query.trim().toLowerCase()
      const matchesQuery =
        !lowerQuery ||
        candidate.title.toLowerCase().includes(lowerQuery) ||
        candidate.pathPreview.toLowerCase().includes(lowerQuery) ||
        candidate.categoryName.toLowerCase().includes(lowerQuery)
      return matchesCategory && matchesQuery
    })
    return sortCandidates(filtered, sortMode)
  }, [candidates, selectedCategoryId, query, sortMode])

  const selectedCandidate = useMemo(() => {
    if (selectedCandidateId) {
      const selected = candidates.find((candidate) => candidate.id === selectedCandidateId)
      if (selected) return selected
    }
    return filteredCandidates[0] ?? null
  }, [candidates, filteredCandidates, selectedCandidateId])

  useEffect(() => {
    if (!selectedCandidateId && filteredCandidates[0]) {
      setSelectedCandidateId(filteredCandidates[0].id)
    }
    if (selectedCandidateId && !candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredCandidates[0]?.id ?? null)
    }
  }, [candidates, filteredCandidates, selectedCandidateId])

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
    setResult(null)
    setProgress({ stage: 'starting', message: '准备扫描' })

    try {
      const nextSummary = await macCleaner.scan()
      setSummary(nextSummary)
      setSelectedCategoryId('all')
      setSelectedCandidateId(nextSummary.candidates[0]?.id ?? null)
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
    setResult(null)
    try {
      setPreview(await macCleaner.cleanupPreview(candidateIds))
    } catch (previewError) {
      setError(formatError(previewError))
    }
  }

  async function confirmCleanup(): Promise<void> {
    if (!preview) return
    setIsCleaning(true)
    setError(null)
    try {
      const cleanupResult = await macCleaner.moveToTrash(preview.candidateIds, preview.confirmationId)
      setResult(cleanupResult)
      setPreview(null)
      recordCleanupHistory(cleanupResult, setCleanupHistory)
      if (!isBrowserPreview) {
        const nextSummary = await macCleaner.scan()
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
      const visibleCleanableIds = filteredCandidates.filter((candidate) => candidate.canClean).map((candidate) => candidate.id)
      const allSelected = visibleCleanableIds.every((candidateId) => current.has(candidateId))
      const next = new Set(current)
      for (const candidateId of visibleCleanableIds) {
        if (allSelected) next.delete(candidateId)
        else next.add(candidateId)
      }
      return next
    })
  }

  async function reveal(candidate: CleanupCandidate): Promise<void> {
    try {
      await macCleaner.revealPath(candidate.pathToken)
    } catch (revealError) {
      setError(formatError(revealError))
    }
  }

  async function revealTrash(): Promise<void> {
    const trashToken = summary?.trash.pathToken
    if (!trashToken) return
    try {
      await macCleaner.revealPath(trashToken)
    } catch (revealError) {
      setError(formatError(revealError))
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
            <span>本地存储清理</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="清理分类">
          <button
            className={selectedCategoryId === 'all' ? 'nav-item active' : 'nav-item'}
            onClick={() => setSelectedCategoryId('all')}
          >
            <Archive size={17} />
            <span>全部候选项</span>
            <strong>{totalCandidates}</strong>
          </button>
          {categories.map((category) => (
            <CategoryNavItem
              key={category.id}
              category={category}
              active={selectedCategoryId === category.id}
              onSelect={() => setSelectedCategoryId(category.id)}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="trash-card">
            <Trash2 size={17} />
            <div>
              <span>废纸篓已占用</span>
              <strong>{formatBytes(summary?.trash.sizeBytes ?? 0)}</strong>
            </div>
            <button
              className="icon-button trash-open-button"
              title="在 Finder 中打开废纸篓"
              disabled={!summary?.trash.pathToken}
              onClick={revealTrash}
            >
              <ExternalLink size={14} />
            </button>
          </div>
          <p>工具只会把确认的条目移到废纸篓，不会清空废纸篓或永久删除。</p>
          <div className="settings-card">
            <strong>本地设置</strong>
            <span>免费 · 无遥测 · 无后台清理</span>
          </div>
          <div className="history-card">
            <strong>清理历史</strong>
            {cleanupHistory.length ? (
              cleanupHistory.slice(0, 3).map((entry) => (
                <span key={entry.id}>{entry.count} 项 · {formatBytes(entry.bytes)} · {new Date(entry.at).toLocaleDateString('zh-CN')}</span>
              ))
            ) : (
              <span>暂无清理记录</span>
            )}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="caption">本地扫描 · 无后台任务 · 无自动删除</p>
            <h1>存储空间清理控制台</h1>
          </div>
          <div className="topbar-actions">
            <div className="disk-selector">
              <HardDrive size={16} />
              <span>{summary?.disk.mountPath ?? 'Macintosh HD'}</span>
            </div>
            <button className="primary-button" onClick={runScan} disabled={isScanning}>
              {isScanning ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              {isScanning ? '扫描中' : '扫描存储空间'}
            </button>
            {isScanning && (
              <button className="secondary-button" onClick={cancelScan}>
                取消扫描
              </button>
            )}
          </div>
        </header>

        {isBrowserPreview && (
          <div className="preview-banner">
            浏览器预览模式正在使用示例数据；在 Electron 应用内运行时会调用真实本地扫描。
          </div>
        )}

        <section className="overview-grid" aria-label="存储概览">
          <div className="overview-panel disk-panel">
            <div
              className="donut"
              style={{ '--used-percent': `${usedPercent}%` } as CSSProperties}
              aria-label={`磁盘已使用 ${usedPercent}%`}
            >
              <span>{usedPercent}%</span>
              <small>已使用</small>
            </div>
            <div className="disk-copy">
              <span>可确认释放</span>
              <strong>{formatBytes(summary?.totalCleanableBytes ?? 0)}</strong>
              <p>
                当前磁盘可用 {formatBytes(summary?.disk.availableBytes ?? 0)}，扫描结果只包含用户级低风险位置。
              </p>
            </div>
          </div>

          <div className="overview-panel progress-panel">
            <div className="panel-heading">
              <span>扫描状态</span>
              <strong>{summary ? new Date(summary.scannedAt).toLocaleString('zh-CN') : '尚未扫描'}</strong>
            </div>
            <div className="scan-status">
              <div className={isScanning ? 'pulse-dot active' : 'pulse-dot'} />
              <div>
                <strong>{progress?.message ?? '点击扫描后开始读取文件大小'}</strong>
                <span>
                  {progress?.currentPath ?? '不会移动、删除或修改任何文件'}
                  {progress?.percent !== undefined ? ` · ${progress.percent}%` : ''}
                </span>
              </div>
            </div>
            {summary?.issues.length ? (
              <details className="issue-details">
                <summary>
                  <Info size={15} />
                  <span>{summary.issues.length} 个目录因权限、超时或符号链接被跳过</span>
                </summary>
                {summary.issues.slice(0, 6).map((issue) => (
                  <p key={issue.id}>{issue.message} · {issue.path}</p>
                ))}
              </details>
            ) : (
              <div className="issue-line muted">
                <CheckCircle2 size={15} />
                <span>暂无权限错误或风险阻断项</span>
              </div>
            )}
          </div>
        </section>

        <section className="content-grid">
          <div className="candidate-panel">
            <div className="table-toolbar">
              <div>
                <span>清理候选项</span>
                <strong>{filteredCandidates.length} 项</strong>
              </div>
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径或分类" />
              </label>
              <select className="sort-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                <option value="size-desc">按大小排序</option>
                <option value="risk-desc">按风险排序</option>
                <option value="name-asc">按名称排序</option>
              </select>
              <button className="secondary-button" onClick={toggleAllVisible} disabled={!filteredCandidates.some((candidate) => candidate.canClean)}>
                {selectedCleanableIds.length ? '取消选择' : '选择可清理项'}
              </button>
              <button
                className="primary-button danger"
                onClick={() => openCleanupPreview(selectedCleanableIds)}
                disabled={!selectedCleanableIds.length}
              >
                <Trash2 size={16} />
                批量确认 {selectedCleanableIds.length}
              </button>
            </div>

            {error && (
              <div className="message error-message">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="message success-message">
                <CheckCircle2 size={16} />
                <span>
                  已移动 {result.successCount} 项到废纸篓，估算空间 {formatBytes(result.cleanedBytes)}
                  {result.failed.length ? `；${result.failed.length} 项失败` : ''}
                </span>
              </div>
            )}

            <div className="candidate-table" role="table" aria-label="清理候选项列表">
              <div className="table-row table-head" role="row">
                <span>条目</span>
                <span>可删除性</span>
                <span>大小</span>
                <span>影响</span>
                <span>操作</span>
              </div>
              {filteredCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
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
                <strong>{summary ? '当前筛选下没有候选项' : '尚未扫描存储空间'}</strong>
                <span>{summary ? '切换分类或清空搜索条件查看其他条目。' : '点击右上角按钮开始本地扫描。'}</span>
              </div>
            )}
          </div>

          <CandidateInspector
            candidate={selectedCandidate}
            onReveal={selectedCandidate ? () => reveal(selectedCandidate) : undefined}
            onCleanup={selectedCandidate ? () => openCleanupPreview([selectedCandidate.id]) : undefined}
          />
        </section>
      </main>

      {preview && (
        <ConfirmationModal
          preview={preview}
          isCleaning={isCleaning}
          onCancel={() => setPreview(null)}
          onConfirm={confirmCleanup}
        />
      )}
    </div>
  )
}

function CategoryNavItem({
  category,
  active,
  onSelect
}: {
  category: CategorySummary
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const Icon = categoryIcons[category.id] ?? Archive
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onSelect}>
      <Icon size={17} />
      <span>{category.name}</span>
      <strong>{formatBytes(category.sizeBytes)}</strong>
    </button>
  )
}

function CandidateRow({
  candidate,
  selected,
  checked,
  onSelect,
  onToggleSelect,
  onReveal,
  onCleanup
}: {
  candidate: CleanupCandidate
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
            aria-label={`选择 ${candidate.title}`}
            onChange={(event) => {
              event.stopPropagation()
              onToggleSelect()
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <strong>{candidate.title}</strong>
        </span>
        <small>{candidate.pathPreview}</small>
      </span>
      <SafetyBadge safety={candidate.safety} />
      <span className="size-cell">{formatBytes(candidate.sizeBytes)}</span>
      <span className="impact-cell">{candidate.reason}</span>
      <span className="row-actions">
        <button
          className="icon-button"
          title="在 Finder 中显示"
          onClick={(event) => {
            event.stopPropagation()
            onReveal()
          }}
        >
          <ExternalLink size={15} />
        </button>
        <button
          className="cleanup-button row-cleanup-button"
          title={candidate.canClean ? candidate.actionLabel : '该项目不可清理'}
          aria-label={candidate.canClean ? `${candidate.actionLabel}: ${candidate.title}` : `该项目不可清理: ${candidate.title}`}
          disabled={!candidate.canClean}
          onClick={(event) => {
            event.stopPropagation()
            onCleanup()
          }}
        >
          <Trash2 size={15} />
          <span className="sr-only">{candidate.safety === 'safe' ? '清理' : candidate.canClean ? '确认' : '禁用'}</span>
        </button>
      </span>
    </div>
  )
}

function SafetyBadge({ safety }: { safety: SafetyLevel }): JSX.Element {
  const meta = safetyMeta[safety]
  const Icon = meta.icon
  return (
    <span className={`safety-badge ${meta.className}`}>
      <Icon size={14} />
      {meta.label}
    </span>
  )
}

function CandidateInspector({
  candidate,
  onReveal,
  onCleanup
}: {
  candidate: CleanupCandidate | null
  onReveal?: () => void
  onCleanup?: () => void
}): JSX.Element {
  if (!candidate) {
    return (
      <aside className="inspector empty-inspector">
        <ShieldCheck size={30} />
        <strong>等待选择条目</strong>
        <span>扫描完成后，这里会显示可删除性、影响说明和清理确认入口。</span>
      </aside>
    )
  }

  const meta = safetyMeta[candidate.safety]
  const RiskIcon = meta.icon

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>{candidate.categoryName}</span>
        <SafetyBadge safety={candidate.safety} />
      </div>
      <h2>{candidate.title}</h2>
      <p className="path-line">{candidate.pathPreview}</p>

      <div className="detail-stack">
        <div className="detail-item">
          <span>估算大小</span>
          <strong>{formatBytes(candidate.sizeBytes)}</strong>
        </div>
        <div className="detail-item">
          <span>路径数量</span>
          <strong>{candidate.pathCount.toLocaleString('zh-CN')}</strong>
        </div>
        <div className="detail-item">
          <span>最近修改</span>
          <strong>{candidate.lastModified ? new Date(candidate.lastModified).toLocaleDateString('zh-CN') : '未知'}</strong>
        </div>
      </div>

      <section className={`risk-box ${meta.className}`}>
        <div>
          <RiskIcon size={18} />
          <strong>{meta.label}</strong>
        </div>
        <p>{meta.description}</p>
      </section>

      <section className="impact-box">
        <span>为什么可以处理</span>
        <p>{candidate.reason}</p>
        <span>可能影响</span>
        <p>{candidate.impact}</p>
        <span>估算来源</span>
        <p>{formatEstimateSource(candidate.estimateSource)} · 快照 {candidate.pathSnapshotHash.slice(0, 8)}</p>
        {candidate.blockedReason && (
          <>
            <span>为什么不建议清理</span>
            <p>{candidate.blockedReason}</p>
          </>
        )}
      </section>

      <div className="inspector-actions">
        <button className="secondary-button" onClick={onReveal}>
          <FolderOpen size={16} />
          显示位置
        </button>
        <button className="primary-button danger" disabled={!candidate.canClean} onClick={onCleanup}>
          <Trash2 size={16} />
          {candidate.actionLabel}
        </button>
      </div>
    </aside>
  )
}

function ConfirmationModal({
  preview,
  isCleaning,
  onCancel,
  onConfirm
}: {
  preview: CleanupPreview
  isCleaning: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="modal-close icon-button" onClick={onCancel} aria-label="关闭确认框">
          <X size={16} />
        </button>
        <div className="modal-icon">
          <Trash2 size={22} />
        </div>
        <h2 id="confirm-title">再次确认移到废纸篓</h2>
        <p>
          你将处理 <strong>{preview.title}</strong>，估算大小 {formatBytes(preview.totalBytes)}。此操作不会永久删除文件。
        </p>
        <div className="preview-list">
          {preview.pathSamples.map((sample) => (
            <span key={sample}>{sample}</span>
          ))}
        </div>
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{preview.impact}</span>
        </div>
        <p className="modal-footnote">{preview.warning}</p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} disabled={isCleaning}>
            取消
          </button>
          <button className="primary-button danger" onClick={onConfirm} disabled={isCleaning}>
            {isCleaning ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            确认移到废纸篓
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

function sortCandidates(
  candidates: CleanupCandidate[],
  sortMode: 'size-desc' | 'risk-desc' | 'name-asc'
): CleanupCandidate[] {
  const riskScore: Record<SafetyLevel, number> = { discouraged: 3, confirm: 2, safe: 1 }
  return [...candidates].sort((left, right) => {
    if (sortMode === 'name-asc') return left.title.localeCompare(right.title)
    if (sortMode === 'risk-desc') return riskScore[right.safety] - riskScore[left.safety] || right.sizeBytes - left.sizeBytes
    return right.sizeBytes - left.sizeBytes
  })
}

function formatEstimateSource(source: CleanupCandidate['estimateSource']): string {
  if (source === 'file-stat') return '文件大小'
  if (source === 'filesystem-walk') return '完整目录统计'
  if (source === 'partial-filesystem-walk') return '部分目录估算'
  return '已阻断'
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

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
