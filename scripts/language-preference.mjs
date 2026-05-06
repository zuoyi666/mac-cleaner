import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const SUPPORTED_LANGUAGES = new Set(['zh-CN', 'en-US'])

export function parseLanguageArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--language') {
      const value = argv[index + 1]
      if (!isSupportedLanguage(value)) throw new Error('Invalid --language value. Use zh-CN or en-US.')
      return value
    }
    if (arg?.startsWith('--language=')) {
      const value = arg.slice('--language='.length)
      if (!isSupportedLanguage(value)) throw new Error('Invalid --language value. Use zh-CN or en-US.')
      return value
    }
  }
  return undefined
}

export function getLanguageSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, 'Library', 'Application Support', 'Mac Cleaner', 'settings.json')
}

export async function readLanguagePreference(settingsPath = getLanguageSettingsPath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    return isSupportedLanguage(parsed?.language) ? parsed.language : null
  } catch {
    return null
  }
}

export async function writeLanguagePreference(language, settingsPath = getLanguageSettingsPath(), now = new Date()) {
  if (!isSupportedLanguage(language)) {
    throw new Error('Invalid language preference. Use zh-CN or en-US.')
  }
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  const payload = `${JSON.stringify({ language, updatedAt: now.toISOString() }, null, 2)}\n`
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await fs.writeFile(temporaryPath, payload, 'utf8')
  await fs.rename(temporaryPath, settingsPath)
  return language
}

function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value)
}
