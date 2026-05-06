import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getDefaultInstallTarget,
  getLanguageSettingsPath,
  readInstallTarget,
  readLanguagePreference,
  readThemePreference,
  writeInstallTarget,
  writeLanguagePreference,
  writeThemePreference
} from '../src/main/services/languagePreference'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('language preference settings', () => {
  it('writes and overwrites the local default app language', async () => {
    const settingsPath = await makeSettingsPath()

    await writeLanguagePreference('zh-CN', settingsPath, new Date('2026-05-06T01:00:00Z'))
    expect(await readLanguagePreference(settingsPath)).toBe('zh-CN')

    await writeLanguagePreference('en-US', settingsPath, new Date('2026-05-06T02:00:00Z'))
    expect(await readLanguagePreference(settingsPath)).toBe('en-US')

    const raw = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, string>
    expect(raw).toEqual({
      language: 'en-US',
      updatedAt: '2026-05-06T02:00:00.000Z'
    })
  })

  it('writes and reads the local install target while preserving language', async () => {
    const homeDir = await makeHome()
    const settingsPath = getLanguageSettingsPath(homeDir)
    const desktopTarget = getDefaultInstallTarget(homeDir)
    const customTarget = path.join(homeDir, 'Tools', 'Mac Cleaner.app')

    await writeLanguagePreference('zh-CN', settingsPath, new Date('2026-05-06T01:00:00Z'))
    await writeInstallTarget(desktopTarget, settingsPath, new Date('2026-05-06T02:00:00Z'), homeDir)
    expect(await readLanguagePreference(settingsPath)).toBe('zh-CN')
    expect(await readInstallTarget(settingsPath, homeDir)).toBe(desktopTarget)

    await writeInstallTarget(customTarget, settingsPath, new Date('2026-05-06T03:00:00Z'), homeDir)
    expect(await readInstallTarget(settingsPath, homeDir)).toBe(customTarget)
  })

  it('writes and overwrites the local theme preference while preserving existing settings', async () => {
    const homeDir = await makeHome()
    const settingsPath = getLanguageSettingsPath(homeDir)
    const desktopTarget = getDefaultInstallTarget(homeDir)

    await writeLanguagePreference('zh-CN', settingsPath, new Date('2026-05-06T01:00:00Z'))
    await writeInstallTarget(desktopTarget, settingsPath, new Date('2026-05-06T02:00:00Z'), homeDir)
    await writeThemePreference('system', settingsPath, new Date('2026-05-06T03:00:00Z'))
    expect(await readThemePreference(settingsPath)).toBe('system')

    await writeThemePreference('graphite-pro', settingsPath, new Date('2026-05-06T04:00:00Z'))
    expect(await readLanguagePreference(settingsPath)).toBe('zh-CN')
    expect(await readInstallTarget(settingsPath, homeDir)).toBe(desktopTarget)
    expect(await readThemePreference(settingsPath)).toBe('graphite-pro')

    const raw = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, string>
    expect(raw.themePreference).toBe('graphite-pro')
    expect(raw.updatedAt).toBe('2026-05-06T04:00:00.000Z')
  })

  it('falls back safely when the settings file is missing, corrupted, or invalid', async () => {
    const settingsPath = await makeSettingsPath()

    expect(await readLanguagePreference(settingsPath)).toBeNull()
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, '{bad json', 'utf8')
    expect(await readLanguagePreference(settingsPath)).toBeNull()

    await fs.writeFile(settingsPath, JSON.stringify({ language: 'fr-FR' }), 'utf8')
    expect(await readLanguagePreference(settingsPath)).toBeNull()
    expect(await readThemePreference(settingsPath)).toBeNull()
    expect(await readInstallTarget(settingsPath)).toBeNull()

    await fs.writeFile(settingsPath, JSON.stringify({ themePreference: 'unknown-theme' }), 'utf8')
    expect(await readThemePreference(settingsPath)).toBeNull()
  })

  it('parses language and install target arguments for the local install script', async () => {
    const homeDir = await makeHome()
    const helper = await import('../scripts/language-preference.mjs')

    expect(helper.parseLanguageArg(['--language', 'zh-CN'])).toBe('zh-CN')
    expect(helper.parseLanguageArg(['--language=en-US'])).toBe('en-US')
    expect(helper.parseLanguageArg([])).toBeUndefined()
    expect(() => helper.parseLanguageArg(['--language', 'fr-FR'])).toThrow('Invalid --language value')
    expect(helper.getDefaultInstallTarget(homeDir)).toBe(path.join(homeDir, 'Desktop', 'Mac Cleaner.app'))
    expect(helper.parseInstallTargetArg(['--install-dir', '~/Tools'], homeDir)).toBe(path.join(homeDir, 'Tools', 'Mac Cleaner.app'))
    expect(helper.parseInstallTargetArg(['--target', '~/Desktop/Mac Cleaner.app'], homeDir)).toBe(path.join(homeDir, 'Desktop', 'Mac Cleaner.app'))
    expect(() => helper.parseInstallTargetArg(['--target', '/Applications/Mac Cleaner.app'], homeDir)).toThrow('Install target')
  })

  it('uses the saved target or desktop default when the installer is non-interactive', async () => {
    const homeDir = await makeHome()
    const settingsPath = getLanguageSettingsPath(homeDir)
    const helper = await import('../scripts/language-preference.mjs')
    const nonInteractiveStream = { isTTY: false } as NodeJS.ReadStream
    const outputStream = { isTTY: false } as NodeJS.WriteStream

    await expect(helper.chooseInstallTarget({ settingsPath, homeDir, stdin: nonInteractiveStream, stdout: outputStream })).resolves.toBe(
      path.join(homeDir, 'Desktop', 'Mac Cleaner.app')
    )

    const savedTarget = path.join(homeDir, 'Tools', 'Mac Cleaner.app')
    await writeInstallTarget(savedTarget, settingsPath, new Date('2026-05-06T01:00:00Z'), homeDir)
    await expect(helper.chooseInstallTarget({ settingsPath, homeDir, stdin: nonInteractiveStream, stdout: outputStream })).resolves.toBe(
      savedTarget
    )
  })
})

async function makeSettingsPath(): Promise<string> {
  return getLanguageSettingsPath(await makeHome())
}

async function makeHome(): Promise<string> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-language-'))
  tempRoots.push(homeDir)
  return homeDir
}
