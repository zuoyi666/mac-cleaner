import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AppLanguage } from '../../shared/types'

interface LanguageSettings {
  language?: unknown
  updatedAt?: unknown
}

export function getLanguageSettingsPath(homeDir = os.homedir()): string {
  return path.join(homeDir, 'Library', 'Application Support', 'Mac Cleaner', 'settings.json')
}

export async function readLanguagePreference(settingsPath = getLanguageSettingsPath()): Promise<AppLanguage | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as LanguageSettings
    return isAppLanguage(parsed.language) ? parsed.language : null
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
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  const payload = `${JSON.stringify({ language, updatedAt: now.toISOString() }, null, 2)}\n`
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await fs.writeFile(temporaryPath, payload, 'utf8')
  await fs.rename(temporaryPath, settingsPath)
  return language
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh-CN' || value === 'en-US'
}
