import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, createLocalUpdateService, normalizeConfig, type CommandRunner } from '../src/main/services/localUpdate'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('local update service', () => {
  it('detects when the configured GitHub upstream has a newer commit', async () => {
    const repoPath = await makeRepo()
    const status = await checkForUpdate(makeConfig(repoPath), makeRunner(), 'en-US')

    expect(status.state).toBe('available')
    expect(status.updateAvailable).toBe(true)
    expect(status.currentVersion).toBe('0.2.0')
    expect(status.latestVersion).toBe('0.4.0')
    expect(status.message).toContain('New commits')
  })

  it('blocks updates when tracked files are dirty', async () => {
    const repoPath = await makeRepo()
    const status = await checkForUpdate(makeConfig(repoPath), makeRunner({ dirty: true }), 'en-US')

    expect(status.state).toBe('blocked')
    expect(status.updateAvailable).toBe(false)
    expect(status.message).toContain('uncommitted changes')
  })

  it('blocks updates when the branch has no upstream or diverged history', async () => {
    const repoPath = await makeRepo()
    const noUpstream = await checkForUpdate(makeConfig(repoPath), makeRunner({ upstream: '' }), 'en-US')
    const diverged = await checkForUpdate(makeConfig(repoPath), makeRunner({ diverged: true }), 'en-US')

    expect(noUpstream.state).toBe('blocked')
    expect(noUpstream.message).toContain('no upstream')
    expect(diverged.state).toBe('blocked')
    expect(diverged.message).toContain('diverged')
  })

  it('runs the source update command sequence and stages the built app', async () => {
    const repoPath = await makeRepo()
    const commands: string[] = []
    const spawnDetached = vi.fn()
    const copyAppBundle = vi.fn(async () => undefined)
    const service = createLocalUpdateService({
      repoPath,
      installTarget: makeInstallTarget(),
      commandRunner: makeRunner({ commands, buildRepoPath: repoPath }),
      copyAppBundle,
      spawnDetached
    })

    const result = await service.runSourceUpdate('en-US')

    expect(result.updated).toBe(true)
    expect(commands).toEqual(
      expect.arrayContaining([
        'git fetch --tags --prune',
        'git pull --ff-only',
        'npm ci',
        'npm run package:dir'
      ])
    )
    expect(copyAppBundle).toHaveBeenCalledWith(expect.stringContaining('Mac Cleaner.app'), expect.stringContaining('Mac Cleaner.app'))
    expect(spawnDetached).toHaveBeenCalledWith('/usr/bin/env', expect.arrayContaining(['node', expect.stringContaining('install-local-app.mjs')]))
  })

  it('only allows local installs inside the user Applications folder', () => {
    expect(() => normalizeConfig({ repoPath: 'relative', installTarget: makeInstallTarget() })).toThrow()
    expect(() => normalizeConfig({ repoPath: '/tmp/repo', installTarget: '/Applications/Mac Cleaner.app' })).toThrow()
    expect(normalizeConfig({ repoPath: '/tmp/repo', installTarget: makeInstallTarget() }).installTarget).toContain('Applications')
  })
})

async function makeRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-cleaner-update-test-'))
  tempRoots.push(repoPath)
  await fs.writeFile(path.join(repoPath, 'package.json'), JSON.stringify({ name: 'mac-cleaner', version: '0.2.0' }))
  return repoPath
}

function makeConfig(repoPath: string) {
  return {
    repoPath,
    installTarget: makeInstallTarget()
  }
}

function makeInstallTarget(): string {
  return path.join(os.homedir(), 'Applications', 'Mac Cleaner.app')
}

function makeRunner({
  dirty = false,
  upstream = 'origin/codex/reliability-upgrades',
  diverged = false,
  commands,
  buildRepoPath
}: {
  dirty?: boolean
  upstream?: string
  diverged?: boolean
  commands?: string[]
  buildRepoPath?: string
} = {}): CommandRunner {
  return async (command, args) => {
    const fullCommand = `${command} ${args.join(' ')}`
    commands?.push(fullCommand)
    if (fullCommand === 'git rev-parse --abbrev-ref HEAD') return ok('codex/reliability-upgrades')
    if (fullCommand === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') {
      return upstream ? ok(upstream) : fail('no upstream')
    }
    if (fullCommand === 'git remote get-url origin') return ok('https://github.com/zuoyi666/mac-cleaner.git')
    if (fullCommand === 'git rev-parse HEAD') return ok('local-commit')
    if (fullCommand === `git rev-parse ${upstream}`) return ok('remote-commit')
    if (fullCommand === 'git status --porcelain --untracked-files=no') return ok(dirty ? ' M package.json' : '')
    if (fullCommand === 'git fetch --tags --prune') return ok('')
    if (fullCommand === 'git show origin/codex/reliability-upgrades:package.json') {
      return ok(JSON.stringify({ name: 'mac-cleaner', version: '0.4.0' }))
    }
    if (fullCommand === 'git merge-base --is-ancestor local-commit remote-commit') return diverged ? fail('diverged') : ok('')
    if (fullCommand === 'git pull --ff-only') return ok('')
    if (fullCommand === 'npm ci') return ok('')
    if (fullCommand === 'npm run package:dir') {
      if (!buildRepoPath) return ok('')
      await fs.mkdir(path.join(buildRepoPath, 'release', `mac-${process.arch}`, 'Mac Cleaner.app'), { recursive: true })
      return ok('')
    }
    return fail(`unexpected command: ${fullCommand}`)
  }
}

function ok(stdout: string) {
  return { stdout, stderr: '', exitCode: 0 }
}

function fail(stderr: string) {
  return { stdout: '', stderr, exitCode: 1 }
}
