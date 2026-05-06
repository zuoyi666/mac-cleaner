import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('GitHub language README pages', () => {
  it('keeps the root README as a language entry and separates install commands', async () => {
    const [rootReadme, zhReadme, enReadme] = await Promise.all([
      fs.readFile('README.md', 'utf8'),
      fs.readFile('README.zh-CN.md', 'utf8'),
      fs.readFile('README.en-US.md', 'utf8')
    ])

    expect(rootReadme).toContain('README.zh-CN.md')
    expect(rootReadme).toContain('README.en-US.md')
    expect(rootReadme).not.toContain('npm run install:local:zh')
    expect(rootReadme).not.toContain('npm run install:local:en')

    expect(zhReadme).toContain('npm run install:local:zh')
    expect(zhReadme).toContain('默认界面语言设置为中文')
    expect(enReadme).toContain('npm run install:local:en')
    expect(enReadme).toContain('default interface language on this Mac to English')
  })
})
