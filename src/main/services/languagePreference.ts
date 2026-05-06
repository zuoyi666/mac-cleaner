import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AppLanguage, ThemePreference } from '../../shared/types'

interface LanguageSettings {
  language?: unknown
  installTarget?: unknown
  themePreference?: unknown
  updatedAt?: unknown
}

const PRODUCT_APP_NAME = 'Mac Cleaner.app'

export function getLanguageSettingsPath(homeDir = os.homedir()): string {
  return path.join(homeDir, 'Library', 'Application Support', 'Mac Cleaner', 'settings.json')
}

export function getDefaultInstallTarget(homeDir = os.homedir()): string {
  return path.join(homeDir, 'Desktop', PRODUCT_APP_NAME)
}

export async function readLanguagePreference(settingsPath = getLanguageSettingsPath()): Promise<AppLanguage | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as LanguageSettings
    return isAppLanguage(parsed.language) ? parsed.language : null
  } catch {
    return null
  }
}

export async function readInstallTarget(settingsPath = getLanguageSettingsPath(), homeDir = os.homedir()): Promise<string | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as LanguageSettings
    return isAllowedInstallTarget(parsed.installTarget, homeDir) ? parsed.installTarget : null
  } catch {
    return null
  }
}

export async function readThemePreference(settingsPath = getLanguageSettingsPath()): Promise<ThemePreference | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as LanguageSettings
    return isThemePreference(parsed.themePreference) ? parsed.themePreference : null
  } catch {
    return null
  }
}

export async function writeLanguagePreference(
  language: AppLanguage,
  settingsPath = getLanguageSettingsPath(),
  now = new Date()
): Promise<AppLanguage> {
  if (!isAppLanguage(language)) {
    throw new Error('Invalid language preference.')
  }
  await writeSettings({ language }, settingsPath, now)
  return language
}

export async function writeInstallTarget(
  installTarget: string,
  settingsPath = getLanguageSettingsPath(),
  now = new Date(),
  homeDir = os.homedir()
): Promise<string> {
  if (!isAllowedInstallTarget(installTarget, homeDir)) {
    throw new Error('Invalid install target.')
  }
  await writeSettings({ installTarget }, settingsPath, now)
  return installTarget
}

export async function writeThemePreference(
  themePreference: ThemePreference,
  settingsPath = getLanguageSettingsPath(),
  now = new Date()
): Promise<ThemePreference> {
  if (!isThemePreference(themePreference)) {
    throw new Error('Invalid theme preference.')
  }
  await writeSettings({ themePreference }, settingsPath, now)
  return themePreference
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh-CN' || value === 'en-US'
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'hacker-dark' || value === 'aurora-light' || value === 'neon-night' || value === 'solar-minimal'
}

export function isAllowedInstallTarget(value: unknown, homeDir = os.homedir()): value is string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.basename(value) !== PRODUCT_APP_NAME) return false
  const relative = path.relative(homeDir, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function writeSettings(partialSettings: Partial<LanguageSettings>, settingsPath: string, now: Date): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  const existingSettings = await readSettings(settingsPath)
  const payload = `${JSON.stringify({ ...existingSettings, ...partialSettings, updatedAt: now.toISOString() }, null, 2)}\n`
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await fs.writeFile(temporaryPath, payload, 'utf8')
  await fs.rename(temporaryPath, settingsPath)
}

async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
