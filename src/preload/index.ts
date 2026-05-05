import { contextBridge, ipcRenderer } from 'electron'
import type { MacCleanerApi, ScanProgress } from '../shared/types'

const api: MacCleanerApi = {
  scan: () => ipcRenderer.invoke('mac-cleaner:scan'),
  cleanupPreview: (candidateId: string) => ipcRenderer.invoke('mac-cleaner:cleanup-preview', candidateId),
  moveToTrash: (candidateId: string, confirmationId: string) =>
    ipcRenderer.invoke('mac-cleaner:move-to-trash', candidateId, confirmationId),
  revealPath: (pathToken: string) => ipcRenderer.invoke('mac-cleaner:reveal-path', pathToken),
  onScanProgress: (listener: (progress: ScanProgress) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => listener(progress)
    ipcRenderer.on('mac-cleaner:scan-progress', wrapped)
    return () => ipcRenderer.removeListener('mac-cleaner:scan-progress', wrapped)
  }
}

contextBridge.exposeInMainWorld('macCleaner', api)
