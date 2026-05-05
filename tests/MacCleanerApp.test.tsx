// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MacCleanerApp } from '../src/renderer/src/MacCleanerApp'
import { demoSummary } from '../src/renderer/src/demoApi'
import type { CleanupPreview, MacCleanerApi } from '../src/shared/types'

describe('MacCleanerApp', () => {
  it('shows scan results and requires confirmation before cleanup', async () => {
    const user = userEvent.setup()
    const firstCandidate = demoSummary.candidates[0]
    const preview: CleanupPreview = {
      candidateIds: [firstCandidate.id],
      confirmationId: 'confirm-1',
      scanId: demoSummary.scanId,
      pathSnapshotHash: firstCandidate.pathSnapshotHash,
      title: firstCandidate.title,
      totalBytes: firstCandidate.sizeBytes,
      pathCount: 1,
      pathSamples: [firstCandidate.pathPreview],
      impact: firstCandidate.impact,
      warning: '确认后会将这些项目移到废纸篓，不会永久删除。',
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    }
    const api: MacCleanerApi = {
      scan: vi.fn().mockResolvedValue(demoSummary),
      cancelScan: vi.fn().mockResolvedValue(undefined),
      cleanupPreview: vi.fn().mockResolvedValue(preview),
      moveToTrash: vi.fn().mockResolvedValue({
        candidateIds: [firstCandidate.id],
        cleanedBytes: firstCandidate.sizeBytes,
        successCount: 1,
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }),
      revealPath: vi.fn().mockResolvedValue(undefined),
      onScanProgress: vi.fn(() => () => undefined)
    }

    render(<MacCleanerApp api={api} initialSummary={null} />)

    await user.click(screen.getByRole('button', { name: /扫描存储空间/ }))
    expect(await screen.findAllByText('安全可清理')).not.toHaveLength(0)
    expect(screen.getAllByText('需确认')).not.toHaveLength(0)

    await user.click(screen.getByRole('button', { name: `移到废纸篓: ${firstCandidate.title}` }))
    expect(api.cleanupPreview).toHaveBeenCalledWith([firstCandidate.id])
    expect(await screen.findByRole('dialog', { name: /再次确认移到废纸篓/ })).toBeInTheDocument()
    expect(api.moveToTrash).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /确认移到废纸篓/ }))

    await waitFor(() => {
      expect(api.moveToTrash).toHaveBeenCalledWith([firstCandidate.id], 'confirm-1')
    })
  })

  it('can select multiple cleanable rows before opening one confirmation', async () => {
    const user = userEvent.setup()
    const candidates = demoSummary.candidates.slice(0, 2)
    const api: MacCleanerApi = {
      scan: vi.fn().mockResolvedValue(demoSummary),
      cancelScan: vi.fn().mockResolvedValue(undefined),
      cleanupPreview: vi.fn().mockResolvedValue({
        candidateIds: candidates.map((candidate) => candidate.id),
        confirmationId: 'batch-confirm',
        scanId: demoSummary.scanId,
        pathSnapshotHash: 'batch-hash',
        title: '2 个清理项目',
        totalBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        pathCount: candidates.reduce((sum, candidate) => sum + candidate.pathCount, 0),
        pathSamples: candidates.map((candidate) => candidate.pathPreview),
        impact: '批量清理影响说明',
        warning: '确认后会将这些项目移到废纸篓，不会永久删除。',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      }),
      moveToTrash: vi.fn().mockResolvedValue({
        candidateIds: candidates.map((candidate) => candidate.id),
        cleanedBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
        successCount: 2,
        failed: [],
        movedToTrash: true,
        needsRescan: true
      }),
      revealPath: vi.fn().mockResolvedValue(undefined),
      onScanProgress: vi.fn(() => () => undefined)
    }

    render(<MacCleanerApp api={api} initialSummary={demoSummary} />)

    await user.click(screen.getByRole('button', { name: /选择可清理项/ }))
    await user.click(screen.getByRole('button', { name: /批量确认/ }))

    expect(api.cleanupPreview).toHaveBeenCalledWith(expect.arrayContaining(candidates.map((candidate) => candidate.id)))
    expect(await screen.findByRole('dialog', { name: /再次确认移到废纸篓/ })).toBeInTheDocument()
  })
})
