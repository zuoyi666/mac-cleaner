import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('release push scripts', () => {
  it('previews SemVer version push without mutating files', () => {
    const result = spawnSync('node', ['scripts/version-push.mjs', '--level', 'patch', '--message', 'test', '--dry-run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false
    })

    expect(result.status).toBe(0)
    const [major, minor, patch] = packageJson.version.split('.').map((part) => Number(part))
    expect(result.stdout).toContain(`[dry-run] would bump ${packageJson.version} -> ${major}.${minor}.${patch + 1}`)
    expect(result.stdout).toContain('would push current branch')
  })

  it('accepts changes push dry-run mode', () => {
    const result = spawnSync('node', ['scripts/changes-push.mjs', '--message', 'test', '--dry-run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false
    })

    expect(result.status).toBe(0)
    expect(`${result.stdout}${result.stderr}`).toMatch(/dry-run|No local changes/)
  })
})
