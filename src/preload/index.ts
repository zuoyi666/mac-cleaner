import { contextBridge, ipcRenderer } from 'electron'
import type { AppLanguage, LocalUpdateConfig, LocalUpdateProgress, MacCleanerApi, ScanProgress, ScanRequest, ThemePreference } from '../shared/types'

const api: MacCleanerApi = {
  scan: (request?: AppLanguage | ScanRequest) => ipcRenderer.invoke('mac-cleaner:scan', validateScanRequest(request)),
  cancelScan: () => ipcRenderer.invoke('mac-cleaner:cancel-scan'),
  cleanupPreview: (candidateIds: string[], language?: AppLanguage) =>
    ipcRenderer.invoke('mac-cleaner:cleanup-preview', validateCandidateIds(candidateIds), validateLanguage(language)),
  moveToTrash: (candidateIds: string[], confirmationId: string, language?: AppLanguage) =>
    ipcRenderer.invoke('mac-cleaner:move-to-trash', validateCandidateIds(candidateIds), validateString(confirmationId), validateLanguage(language)),
  revealPath: (pathToken: string) => ipcRenderer.invoke('mac-cleaner:reveal-path', validateString(pathToken)),
  openFullDiskAccessSettings: () => ipcRenderer.invoke('mac-cleaner:open-full-disk-access-settings'),
  checkForLocalUpdate: (language?: AppLanguage) => ipcRenderer.invoke('mac-cleaner:check-local-update', validateLanguage(language)),
  runLocalSourceUpdate: (language?: AppLanguage) => ipcRenderer.invoke('mac-cleaner:run-local-update', validateLanguage(language)),
  configureLocalUpdate: (config: Partial<LocalUpdateConfig>) => ipcRenderer.invoke('mac-cleaner:configure-local-update', validateLocalUpdateConfig(config)),
  getLanguagePreference: () => ipcRenderer.invoke('mac-cleaner:get-language-preference'),
  setLanguagePreference: (language: AppLanguage) => ipcRenderer.invoke('mac-cleaner:set-language-preference', validateRequiredLanguage(language)),
  getThemePreference: () => ipcRenderer.invoke('mac-cleaner:get-theme-preference'),
  setThemePreference: (themePreference: ThemePreference) => ipcRenderer.invoke('mac-cleaner:set-theme-preference', validateThemePreference(themePreference)),
  onScanProgress: (listener: (progress: ScanProgress) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => listener(progress)
    ipcRenderer.on('mac-cleaner:scan-progress', wrapped)
    return () => ipcRenderer.removeListener('mac-cleaner:scan-progress', wrapped)
  },
  onLocalUpdateProgress: (listener: (progress: LocalUpdateProgress) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: LocalUpdateProgress): void => listener(progress)
    ipcRenderer.on('mac-cleaner:local-update-progress', wrapped)
    return () => ipcRenderer.removeListener('mac-cleaner:local-update-progress', wrapped)
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

function validateLanguage(language: AppLanguage | undefined): AppLanguage {
  if (language === undefined || language === 'zh-CN' || language === 'en-US') {
    return language ?? 'zh-CN'
  }
  throw new Error('Invalid language argument')
}

function validateRequiredLanguage(language: AppLanguage): AppLanguage {
  if (language === 'zh-CN' || language === 'en-US') {
    return language
  }
  throw new Error('Invalid language argument')
}

function validateThemePreference(themePreference: ThemePreference): ThemePreference {
  if (
    themePreference === 'system' ||
    themePreference === 'hacker-dark' ||
    themePreference === 'aurora-light' ||
    themePreference === 'graphite-pro' ||
    themePreference === 'solar-minimal'
  ) {
    return themePreference
  }
  throw new Error('Invalid theme preference argument')
}

function validateScanRequest(request: AppLanguage | ScanRequest | undefined): AppLanguage | ScanRequest {
  if (typeof request === 'string' || request === undefined) return validateLanguage(request)
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Invalid scan request')
  }
  const language = request.language === undefined ? undefined : validateLanguage(request.language)
  const mode = request.mode === undefined || request.mode === 'standard' || request.mode === 'comprehensive' ? request.mode : undefined
  if (request.mode !== undefined && mode === undefined) {
    throw new Error('Invalid scan mode')
  }
  return {
    language: language ?? 'zh-CN',
    mode: mode ?? 'comprehensive'
  }
}

function validateLocalUpdateConfig(config: Partial<LocalUpdateConfig>): Partial<LocalUpdateConfig> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Invalid local update config')
  }
  return {
    repoPath: config.repoPath === undefined ? undefined : validatePathString(config.repoPath),
    installTarget: config.installTarget === undefined ? undefined : validatePathString(config.installTarget)
  }
}

function validatePathString(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500 || !value.startsWith('/')) {
    throw new Error('Invalid path argument')
  }
  return value
}
