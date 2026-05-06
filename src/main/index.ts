import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppLanguage, LocalUpdateConfig, LocalUpdateProgress, ScanProgress } from '../shared/types'
import { t } from '../shared/i18n'
import { createCleanupManager } from './services/cleanup'
import { isAppLanguage, readLanguagePreference, writeInstallTarget, writeLanguagePreference } from './services/languagePreference'
import { createLocalUpdateService } from './services/localUpdate'
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
    },
    getTrashPath() {
      return currentScanRun ? path.join(currentScanRun.summary.homeDir, '.Trash') : undefined
    }
  },
  shell.trashItem
)
const localUpdateService = createLocalUpdateService()

async function createWindow(): Promise<void> {
  const initialLanguage = await readLanguagePreference()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Mac Cleaner',
    backgroundColor: '#05080d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL)
    if (initialLanguage) devServerUrl.searchParams.set('initialLanguage', initialLanguage)
    mainWindow.loadURL(devServerUrl.toString())
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: initialLanguage ? { initialLanguage } : undefined
    })
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  if (process.env.MAC_CLEANER_SMOKE_TEST === '1') {
    try {
      await fs.access(path.join(__dirname, '../preload/index.cjs'))
    } catch (error) {
      console.error('Smoke test failed: preload bridge bundle is missing.', error)
      app.exit(1)
      return
    }
    app.exit(0)
    return
  }

  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
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
      return {
        ok: false,
        targetKind: 'unknown',
        method: 'none',
        message: t('zh-CN', 'main.pathTokenExpired'),
        messageKey: 'main.pathTokenExpired'
      }
    }
    return revealPath(targetPath)
  })

  ipcMain.handle('mac-cleaner:check-local-update', async (event, languageInput: unknown) => {
    const language = validateLanguage(languageInput)
    return localUpdateService.checkForUpdate(language, (progress) => emitLocalUpdateProgress(event.sender, progress))
  })

  ipcMain.handle('mac-cleaner:run-local-update', async (event, languageInput: unknown) => {
    const language = validateLanguage(languageInput)
    const result = await localUpdateService.runSourceUpdate(language, (progress) => emitLocalUpdateProgress(event.sender, progress))
    if (result.needsRelaunch) {
      setTimeout(() => app.exit(0), 500)
    }
    return result
  })

  ipcMain.handle('mac-cleaner:configure-local-update', async (_event, configInput: unknown) => {
    const config = localUpdateService.configure(validateLocalUpdateConfig(configInput))
    await writeInstallTarget(config.installTarget)
    return config
  })

  ipcMain.handle('mac-cleaner:get-language-preference', async () => {
    return readLanguagePreference()
  })

  ipcMain.handle('mac-cleaner:set-language-preference', async (_event, languageInput: unknown) => {
    return writeLanguagePreference(validateRequiredLanguage(languageInput))
  })
}

function emitLocalUpdateProgress(sender: WebContents, progress: LocalUpdateProgress): void {
  sender.send('mac-cleaner:local-update-progress', progress)
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

function validateLocalUpdateConfig(value: unknown): Partial<LocalUpdateConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const config: Partial<LocalUpdateConfig> = {}
  if (input.repoPath !== undefined) {
    config.repoPath = validatePathString(input.repoPath, 'repoPath')
  }
  if (input.installTarget !== undefined) {
    config.installTarget = validatePathString(input.installTarget, 'installTarget')
  }
  return config
}

function validatePathString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500 || !path.isAbsolute(value)) {
    throw new Error(t('zh-CN', 'main.invalidParam', { fieldName }))
  }
  return value
}

function validateLanguage(value: unknown): AppLanguage {
  if (value === undefined || isAppLanguage(value)) {
    return value ?? 'zh-CN'
  }
  throw new Error('Invalid language parameter.')
}

function validateRequiredLanguage(value: unknown): AppLanguage {
  if (isAppLanguage(value)) return value
  throw new Error('Invalid language parameter.')
}

async function revealPath(targetPath: string) {
  try {
    const stats = await fs.lstat(targetPath)
    if (stats.isDirectory()) {
      const error = await shell.openPath(targetPath)
      if (error) {
        return {
          ok: false,
          targetKind: 'directory',
          method: 'open-path',
          message: t('zh-CN', 'main.revealFailed', { error }),
          messageKey: 'main.revealFailed',
          messageParams: { error }
        }
      }
      return {
        ok: true,
        targetKind: 'directory',
        method: 'open-path',
        message: t('zh-CN', 'main.revealOpenedDirectory'),
        messageKey: 'main.revealOpenedDirectory'
      }
    }
    shell.showItemInFolder(targetPath)
    return {
      ok: true,
      targetKind: 'file',
      method: 'finder-reveal',
      message: t('zh-CN', 'main.revealShownInFinder'),
      messageKey: 'main.revealShownInFinder'
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      ok: false,
      targetKind: code === 'ENOENT' ? 'missing' : 'unknown',
      method: 'none',
      message: t('zh-CN', code === 'ENOENT' ? 'main.revealMissing' : 'main.revealFailed', { error: formatError(error) }),
      messageKey: code === 'ENOENT' ? 'main.revealMissing' : 'main.revealFailed',
      messageParams: { error: formatError(error) }
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
