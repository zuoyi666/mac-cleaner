import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScanProgress } from '../shared/types'
import { createCleanupManager } from './services/cleanup'
import type { ScanRun } from './services/scanner'
import { scanStorage } from './services/scanner'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let currentScanRun: ScanRun | null = null
let activeScanAbortController: AbortController | null = null

const cleanupManager = createCleanupManager(
  {
    getCandidate(candidateId) {
      return currentScanRun?.candidates.get(candidateId)
    },
    removeCandidate(candidateId) {
      currentScanRun?.candidates.delete(candidateId)
      if (currentScanRun) {
        currentScanRun.summary.candidates = currentScanRun.summary.candidates.filter(
          (candidate) => candidate.id !== candidateId
        )
      }
    }
  },
  shell.trashItem
)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Mac Cleaner',
    backgroundColor: '#f5f7fb',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  if (process.env.MAC_CLEANER_SMOKE_TEST === '1') {
    app.exit(0)
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers(): void {
  ipcMain.handle('mac-cleaner:scan', async (event) => {
    if (activeScanAbortController) {
      throw new Error('已有扫描正在进行，请先取消或等待完成。')
    }
    const abortController = new AbortController()
    activeScanAbortController = abortController

    const emitProgress = (progress: ScanProgress): void => {
      event.sender.send('mac-cleaner:scan-progress', progress)
    }

    try {
      currentScanRun = await scanStorage({ signal: abortController.signal, onProgress: emitProgress })
      return currentScanRun.summary
    } catch (error) {
      if (isAbortError(error)) {
        emitProgress({ stage: 'cancelled', message: '扫描已取消' })
        throw new Error('扫描已取消。')
      }
      throw error
    } finally {
      if (activeScanAbortController === abortController) {
        activeScanAbortController = null
      }
    }
  })

  ipcMain.handle('mac-cleaner:cancel-scan', async () => {
    activeScanAbortController?.abort()
  })

  ipcMain.handle('mac-cleaner:cleanup-preview', (_event, candidateIds: unknown) => {
    return cleanupManager.cleanupPreview(validateCandidateIds(candidateIds))
  })

  ipcMain.handle('mac-cleaner:move-to-trash', (_event, candidateIds: unknown, confirmationId: unknown) => {
    return cleanupManager.moveToTrash(validateCandidateIds(candidateIds), validateString(confirmationId, 'confirmationId'))
  })

  ipcMain.handle('mac-cleaner:reveal-path', async (_event, pathTokenInput: unknown) => {
    const pathToken = validateString(pathTokenInput, 'pathToken')
    const targetPath = currentScanRun?.pathTokens.get(pathToken)
    if (!targetPath) {
      throw new Error('路径令牌已失效，请重新扫描。')
    }
    shell.showItemInFolder(targetPath)
  })
}

function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error(`无效的 ${fieldName} 参数。`)
  }
  return value
}

function validateCandidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('无效的 candidateIds 参数。')
  }
  const candidateIds = [...new Set(value.map((candidateId) => validateString(candidateId, 'candidateId')))]
  if (!candidateIds.length || candidateIds.length > 100) {
    throw new Error('清理项目数量无效。')
  }
  return candidateIds
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
