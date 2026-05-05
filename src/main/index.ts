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
      sandbox: false
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
    const emitProgress = (progress: ScanProgress): void => {
      event.sender.send('mac-cleaner:scan-progress', progress)
    }

    currentScanRun = await scanStorage({ onProgress: emitProgress })
    return currentScanRun.summary
  })

  ipcMain.handle('mac-cleaner:cleanup-preview', (_event, candidateId: string) => {
    return cleanupManager.cleanupPreview(candidateId)
  })

  ipcMain.handle('mac-cleaner:move-to-trash', (_event, candidateId: string, confirmationId: string) => {
    return cleanupManager.moveToTrash(candidateId, confirmationId)
  })

  ipcMain.handle('mac-cleaner:reveal-path', async (_event, pathToken: string) => {
    const targetPath = currentScanRun?.pathTokens.get(pathToken)
    if (!targetPath) {
      throw new Error('路径令牌已失效，请重新扫描。')
    }
    shell.showItemInFolder(targetPath)
  })
}
