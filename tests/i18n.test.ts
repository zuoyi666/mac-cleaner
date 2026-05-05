import { describe, expect, it } from 'vitest'
import { resolveLanguage, t } from '../src/shared/i18n'

describe('i18n helpers', () => {
  it('resolves Chinese variants to zh-CN', () => {
    expect(resolveLanguage('zh-Hans-CN')).toBe('zh-CN')
    expect(resolveLanguage('zh-TW')).toBe('zh-CN')
  })

  it('resolves unsupported or empty languages to English', () => {
    expect(resolveLanguage('de-DE')).toBe('en-US')
    expect(resolveLanguage(undefined)).toBe('en-US')
  })

  it('interpolates localized messages', () => {
    expect(t('en-US', 'cleanup.batchTitle', { count: 3 })).toBe('3 cleanup items')
    expect(t('zh-CN', 'cleanup.batchTitle', { count: 3 })).toBe('3 个清理项目')
  })
})
