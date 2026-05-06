import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getLanguageSettingsPath, readLanguagePreference, writeLanguagePreference } from '../src/main/services/languagePreference'

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

  it('falls back safely when the settings file is missing, corrupted, or invalid', async () => {
    const settingsPath = await makeSettingsPath()

    expect(await readLanguagePreference(settingsPath)).toBeNull()
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, '{bad json', 'utf8')
    expect(await readLanguagePreference(settingsPath)).toBeNull()

    await fs.writeFile(settingsPath, JSON.stringify({ language: 'fr-FR' }), 'utf8')
    expect(await readLanguagePreference(settingsPath)).toBeNull()
  })

  it('parses language arguments for the local install script', async () => {
    const helper = await import('../scripts/language-preference.mjs')

    expect(helper.parseLanguageArg(['--language', 'zh-CN'])).toBe('zh-CN')
    expect(helper.parseLanguageArg(['--language=en-US'])).toBe('en-US')
    expect(helper.parseLanguageArg([])).toBeUndefined()
    expect(() => helper.parseLanguageArg(['--language', 'fr-FR'])).toThrow('Invalid --language value')
  })
})

async function makeSettingsPath(): Promise<string> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-language-'))
  tempRoots.push(homeDir)
  return getLanguageSettingsPath(homeDir)
}
