import { contextBridge, ipcRenderer } from 'electron'
import type { MacCleanerApi, ScanProgress } from '../shared/types'

const api: MacCleanerApi = {
  scan: () => ipcRenderer.invoke('mac-cleaner:scan'),
  cancelScan: () => ipcRenderer.invoke('mac-cleaner:cancel-scan'),
  cleanupPreview: (candidateIds: string[]) => ipcRenderer.invoke('mac-cleaner:cleanup-preview', validateCandidateIds(candidateIds)),
  moveToTrash: (candidateIds: string[], confirmationId: string) =>
    ipcRenderer.invoke('mac-cleaner:move-to-trash', validateCandidateIds(candidateIds), validateString(confirmationId)),
  revealPath: (pathToken: string) => ipcRenderer.invoke('mac-cleaner:reveal-path', validateString(pathToken)),
  onScanProgress: (listener: (progress: ScanProgress) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => listener(progress)
    ipcRenderer.on('mac-cleaner:scan-progress', wrapped)
    return () => ipcRenderer.removeListener('mac-cleaner:scan-progress', wrapped)
  }
}

contextBridge.exposeInMainWorld('macCleaner', api)

function validateString(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error('Invalid string argument')
  }
  return value
}

function validateCandidateIds(candidateIds: string[]): string[] {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0 || candidateIds.length > 100) {
    throw new Error('Invalid candidate id list')
  }
  return [...new Set(candidateIds.map(validateString))]
}
