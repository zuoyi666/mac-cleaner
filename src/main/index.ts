import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppLanguage, ScanProgress } from '../shared/types'
import { t } from '../shared/i18n'
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
  ipcMain.handle('mac-cleaner:scan', async (event, languageInput: unknown) => {
    const language = validateLanguage(languageInput)
    if (activeScanAbortController) {
      throw new Error(t(language, 'main.scanAlreadyRunning'))
    }
    const abortController = new AbortController()
    activeScanAbortController = abortController

    const emitProgress = (progress: ScanProgress): void => {
      event.sender.send('mac-cleaner:scan-progress', progress)
    }

    try {
      currentScanRun = await scanStorage({ language, signal: abortController.signal, onProgress: emitProgress })
      return currentScanRun.summary
    } catch (error) {
      if (isAbortError(error)) {
        emitProgress({ stage: 'cancelled', message: t(language, 'progress.cancelled'), messageKey: 'progress.cancelled' })
        throw new Error(t(language, 'progress.cancelled'))
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

  ipcMain.handle('mac-cleaner:cleanup-preview', (_event, candidateIds: unknown, languageInput: unknown) => {
    const language = validateLanguage(languageInput)
    return cleanupManager.cleanupPreview(validateCandidateIds(candidateIds, language), language)
  })

  ipcMain.handle('mac-cleaner:move-to-trash', (_event, candidateIds: unknown, confirmationId: unknown, languageInput: unknown) => {
    const language = validateLanguage(languageInput)
    return cleanupManager.moveToTrash(validateCandidateIds(candidateIds, language), validateString(confirmationId, 'confirmationId', language), language)
  })

  ipcMain.handle('mac-cleaner:reveal-path', async (_event, pathTokenInput: unknown) => {
    const pathToken = validateString(pathTokenInput, 'pathToken')
    const targetPath = currentScanRun?.pathTokens.get(pathToken)
    if (!targetPath) {
      throw new Error(t('zh-CN', 'main.pathTokenExpired'))
    }
    shell.showItemInFolder(targetPath)
  })
}

function validateString(value: unknown, fieldName: string, language: AppLanguage = 'zh-CN'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error(t(language, 'main.invalidParam', { fieldName }))
  }
  return value
}

function validateCandidateIds(value: unknown, language: AppLanguage = 'zh-CN'): string[] {
  if (!Array.isArray(value)) {
    throw new Error(t(language, 'main.invalidCandidateIds'))
  }
  const candidateIds = [...new Set(value.map((candidateId) => validateString(candidateId, 'candidateId', language)))]
  if (!candidateIds.length || candidateIds.length > 100) {
    throw new Error(t(language, 'main.invalidCandidateCount'))
  }
  return candidateIds
}

function validateLanguage(value: unknown): AppLanguage {
  if (value === undefined || value === 'zh-CN' || value === 'en-US') {
    return value ?? 'zh-CN'
  }
  throw new Error('Invalid language parameter.')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
