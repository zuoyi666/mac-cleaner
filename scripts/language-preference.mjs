import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const SUPPORTED_LANGUAGES = new Set(['zh-CN', 'en-US'])
const PRODUCT_APP_NAME = 'Mac Cleaner.app'

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

export function getDefaultInstallTarget(homeDir = os.homedir()) {
  return path.join(homeDir, 'Desktop', PRODUCT_APP_NAME)
}

export function parseInstallTargetArg(argv, homeDir = os.homedir()) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--target' || arg === '--install-dir') {
      const value = argv[index + 1]
      if (!value) throw new Error(`Missing value for ${arg}.`)
      return normalizeInstallTarget(value, homeDir, arg === '--install-dir')
    }
    if (arg?.startsWith('--target=')) {
      return normalizeInstallTarget(arg.slice('--target='.length), homeDir, false)
    }
    if (arg?.startsWith('--install-dir=')) {
      return normalizeInstallTarget(arg.slice('--install-dir='.length), homeDir, true)
    }
  }
  return undefined
}

export async function readLanguagePreference(settingsPath = getLanguageSettingsPath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    return isSupportedLanguage(parsed?.language) ? parsed.language : null
  } catch {
    return null
  }
}

export async function readInstallTarget(settingsPath = getLanguageSettingsPath(), homeDir = os.homedir()) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    return isAllowedInstallTarget(parsed?.installTarget, homeDir) ? parsed.installTarget : null
  } catch {
    return null
  }
}

export async function writeLanguagePreference(language, settingsPath = getLanguageSettingsPath(), now = new Date()) {
  if (!isSupportedLanguage(language)) {
    throw new Error('Invalid language preference. Use zh-CN or en-US.')
  }
  await writeSettings({ language }, settingsPath, now)
  return language
}

export async function writeInstallTarget(installTarget, settingsPath = getLanguageSettingsPath(), now = new Date(), homeDir = os.homedir()) {
  if (!isAllowedInstallTarget(installTarget, homeDir)) {
    throw new Error(`Install target must be inside your home folder and end with ${PRODUCT_APP_NAME}.`)
  }
  await writeSettings({ installTarget }, settingsPath, now)
  return installTarget
}

export async function chooseInstallTarget({
  requestedTarget,
  settingsPath = getLanguageSettingsPath(),
  homeDir = os.homedir(),
  stdin = process.stdin,
  stdout = process.stdout
} = {}) {
  if (requestedTarget) return requestedTarget
  const defaultTarget = getDefaultInstallTarget(homeDir)
  const savedTarget = await readInstallTarget(settingsPath, homeDir)
  if (savedTarget) return savedTarget
  if (!stdin.isTTY || !stdout.isTTY) return defaultTarget

  stdout.write(`安装位置默认为桌面：${defaultTarget}\n`)
  stdout.write('首次安装可输入其它安装目录，直接回车使用桌面：')
  const answer = await readLine(stdin)
  const trimmed = answer.trim()
  if (!trimmed) return defaultTarget
  return normalizeInstallTarget(trimmed, homeDir, true)
}

async function writeSettings(partialSettings, settingsPath, now) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  const existingSettings = await readSettings(settingsPath)
  const payload = `${JSON.stringify({ ...existingSettings, ...partialSettings, updatedAt: now.toISOString() }, null, 2)}\n`
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await fs.writeFile(temporaryPath, payload, 'utf8')
  await fs.rename(temporaryPath, settingsPath)
}

async function readSettings(settingsPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeInstallTarget(value, homeDir, valueIsDirectory) {
  const expanded = value.replace(/^~(?=$|\/)/, homeDir)
  const absolutePath = path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded)
  const targetPath = valueIsDirectory || !absolutePath.endsWith('.app')
    ? path.join(absolutePath, PRODUCT_APP_NAME)
    : absolutePath
  if (!isAllowedInstallTarget(targetPath, homeDir)) {
    throw new Error(`Install target must be inside your home folder and end with ${PRODUCT_APP_NAME}.`)
  }
  return path.normalize(targetPath)
}

function isAllowedInstallTarget(value, homeDir) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.basename(value) !== PRODUCT_APP_NAME) return false
  const relative = path.relative(homeDir, value)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function readLine(stdin) {
  return new Promise((resolve) => {
    let line = ''
    const onData = (chunk) => {
      line += chunk.toString()
      if (line.includes('\n')) {
        stdin.off('data', onData)
        stdin.pause()
        resolve(line.split('\n')[0])
      }
    }
    stdin.setEncoding('utf8')
    stdin.resume()
    stdin.on('data', onData)
  })
}

function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value)
}
