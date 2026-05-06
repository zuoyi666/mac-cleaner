import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  AppLanguage,
  LocalUpdateConfig,
  LocalUpdateProgress,
  LocalUpdateResult,
  LocalUpdateStatus
} from '../../shared/types'
import { t } from '../../shared/i18n'

const SUPPORTED_REMOTE_RE = /github\.com[:/]zuoyi666\/mac-cleaner(?:\.git)?$/i
const PRODUCT_APP_NAME = 'Mac Cleaner.app'
const PACKAGE_NAME = 'mac-cleaner'

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export type CommandRunner = (command: string, args: string[], options: { cwd: string }) => Promise<CommandResult>
export type AppBundleCopier = (source: string, target: string) => Promise<void>

export interface LocalUpdateServiceOptions {
  repoPath?: string
  installTarget?: string
  commandRunner?: CommandRunner
  copyAppBundle?: AppBundleCopier
  spawnDetached?: (command: string, args: string[]) => void
}

export interface LocalUpdateService {
  getConfig(): LocalUpdateConfig
  configure(config: Partial<LocalUpdateConfig>): LocalUpdateConfig
  checkForUpdate(language?: AppLanguage, onProgress?: (progress: LocalUpdateProgress) => void): Promise<LocalUpdateStatus>
  runSourceUpdate(language?: AppLanguage, onProgress?: (progress: LocalUpdateProgress) => void): Promise<LocalUpdateResult>
}

interface RepoInfo {
  branch?: string
  upstream?: string
  remoteUrl?: string
  localCommit?: string
  remoteCommit?: string
  currentVersion: string
  latestVersion?: string
  dirty: boolean
}

export function createLocalUpdateService(options: LocalUpdateServiceOptions = {}): LocalUpdateService {
  let config: LocalUpdateConfig = normalizeConfig({
    repoPath: options.repoPath ?? process.env.MAC_CLEANER_REPO_PATH ?? path.join(os.homedir(), 'Mac-Clearner'),
    installTarget: options.installTarget ?? path.join(os.homedir(), 'Applications', PRODUCT_APP_NAME)
  })
  const runCommand = options.commandRunner ?? defaultCommandRunner
  const copyAppBundle = options.copyAppBundle ?? copyAppBundleWithDitto
  const spawnDetached = options.spawnDetached ?? defaultSpawnDetached
  let updateRunning = false

  return {
    getConfig() {
      return config
    },

    configure(nextConfig) {
      config = normalizeConfig({ ...config, ...nextConfig })
      return config
    },

    async checkForUpdate(language: AppLanguage = 'zh-CN', onProgress) {
      return checkForUpdate(config, runCommand, language, onProgress)
    },

    async runSourceUpdate(language: AppLanguage = 'zh-CN', onProgress) {
      if (updateRunning) {
        throw new Error(t(language, 'localUpdate.error.alreadyRunning'))
      }
      updateRunning = true
      try {
        const status = await checkForUpdate(config, runCommand, language, onProgress)
        if (!status.updateAvailable) {
          if (status.state !== 'current') {
            throw new Error(status.message)
          }
          return {
            updated: false,
            previousVersion: status.currentVersion,
            currentVersion: status.latestVersion ?? status.currentVersion,
            installedPath: config.installTarget,
            needsRelaunch: false,
            message: t(language, 'localUpdate.result.noUpdate'),
            messageKey: 'localUpdate.result.noUpdate'
          }
        }
        if (status.state === 'blocked') {
          throw new Error(status.message)
        }

        emit(onProgress, language, 'pulling', 'localUpdate.progress.pulling')
        await mustRun(runCommand, 'git', ['pull', '--ff-only'], config.repoPath)

        emit(onProgress, language, 'installing-dependencies', 'localUpdate.progress.installingDependencies')
        await mustRun(runCommand, 'npm', ['ci'], config.repoPath)

        emit(onProgress, language, 'building', 'localUpdate.progress.building')
        await mustRun(runCommand, 'npm', ['run', 'package:dir'], config.repoPath)

        const builtApp = await findBuiltApp(config.repoPath)
        const stagingRoot = path.join(os.tmpdir(), `mac-cleaner-update-${crypto.randomUUID()}`)
        const stagedApp = path.join(stagingRoot, PRODUCT_APP_NAME)
        await fs.rm(stagingRoot, { recursive: true, force: true })
        await fs.mkdir(stagingRoot, { recursive: true })
        await copyAppBundle(builtApp, stagedApp)

        emit(onProgress, language, 'installing', 'localUpdate.progress.installing')
        const installerScript = path.join(config.repoPath, 'scripts', 'install-local-app.mjs')
        spawnDetached('/usr/bin/env', [
          'node',
          installerScript,
          '--source',
          stagedApp,
          '--target',
          config.installTarget,
          '--parent-pid',
          String(process.pid)
        ])

        emit(onProgress, language, 'relaunching', 'localUpdate.progress.relaunching')
        return {
          updated: true,
          previousVersion: status.currentVersion,
          currentVersion: status.latestVersion ?? status.currentVersion,
          installedPath: config.installTarget,
          needsRelaunch: true,
          message: t(language, 'localUpdate.result.updated', { currentVersion: status.latestVersion ?? status.currentVersion }),
          messageKey: 'localUpdate.result.updated',
          messageParams: { currentVersion: status.latestVersion ?? status.currentVersion }
        }
      } catch (error) {
        emit(onProgress, language, 'failed', 'localUpdate.progress.failed', { error: formatError(error) })
        throw error
      } finally {
        updateRunning = false
      }
    }
  }
}

export async function checkForUpdate(
  config: LocalUpdateConfig,
  runCommand: CommandRunner = defaultCommandRunner,
  language: AppLanguage = 'zh-CN',
  onProgress?: (progress: LocalUpdateProgress) => void
): Promise<LocalUpdateStatus> {
  emit(onProgress, language, 'checking', 'localUpdate.progress.checking')
  const checkedAt = new Date().toISOString()
  try {
    const repoInfo = await readRepoInfo(config, runCommand)
    if (!repoInfo.remoteUrl || !SUPPORTED_REMOTE_RE.test(repoInfo.remoteUrl)) {
      return makeStatus('blocked', false, config, repoInfo, language, checkedAt, 'localUpdate.status.invalidRepo')
    }
    if (!repoInfo.upstream) {
      return makeStatus('blocked', false, config, repoInfo, language, checkedAt, 'localUpdate.status.noUpstream')
    }
    if (repoInfo.dirty) {
      return makeStatus('blocked', false, config, repoInfo, language, checkedAt, 'localUpdate.status.blockedDirty')
    }

    emit(onProgress, language, 'fetching', 'localUpdate.progress.fetching')
    await mustRun(runCommand, 'git', ['fetch', '--tags', '--prune'], config.repoPath)
    const refreshedInfo = await readRepoInfo(config, runCommand)
    const remoteCommit = refreshedInfo.remoteCommit
    const localCommit = refreshedInfo.localCommit
    if (!remoteCommit || !localCommit) {
      return makeStatus('unknown', false, config, refreshedInfo, language, checkedAt, 'localUpdate.status.checkFailed', {
        error: 'Missing commit information'
      })
    }
    const ancestor = await runCommand('git', ['merge-base', '--is-ancestor', localCommit, remoteCommit], { cwd: config.repoPath })
    if (ancestor.exitCode !== 0) {
      return makeStatus('blocked', false, config, refreshedInfo, language, checkedAt, 'localUpdate.status.blockedDiverged')
    }
    if (localCommit !== remoteCommit) {
      return makeStatus('available', true, config, refreshedInfo, language, checkedAt, 'localUpdate.status.available')
    }
    return makeStatus('current', false, config, refreshedInfo, language, checkedAt, 'localUpdate.status.current')
  } catch (error) {
    return makeStatus(
      'unknown',
      false,
      config,
      { currentVersion: await readCurrentVersion(config.repoPath), dirty: false },
      language,
      checkedAt,
      'localUpdate.status.checkFailed',
      { error: formatError(error) }
    )
  }
}

export function normalizeConfig(config: LocalUpdateConfig): LocalUpdateConfig {
  if (!path.isAbsolute(config.repoPath)) {
    throw new Error('Repository path must be absolute.')
  }
  if (!isInsideApplications(config.installTarget)) {
    throw new Error('Install target must be inside ~/Applications.')
  }
  return {
    repoPath: path.normalize(config.repoPath),
    installTarget: path.normalize(config.installTarget)
  }
}

export async function findBuiltApp(repoPath: string): Promise<string> {
  const releasePath = path.join(repoPath, 'release')
  const preferred = path.join(releasePath, `mac-${process.arch}`, PRODUCT_APP_NAME)
  if (await pathExists(preferred)) return preferred
  const entries = await fs.readdir(releasePath, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('mac')) continue
    const candidate = path.join(releasePath, entry.name, PRODUCT_APP_NAME)
    if (await pathExists(candidate)) return candidate
  }
  throw new Error('Built Mac Cleaner.app was not found.')
}

async function readRepoInfo(config: LocalUpdateConfig, runCommand: CommandRunner): Promise<RepoInfo> {
  const packageJson = await readPackageJson(config.repoPath)
  if (packageJson.name !== PACKAGE_NAME) {
    return { currentVersion: String(packageJson.version ?? '0.0.0'), dirty: false }
  }
  const [branch, upstream, remoteUrl, localCommit, dirtyStatus] = await Promise.all([
    optionalStdout(runCommand, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'], config.repoPath),
    optionalStdout(runCommand, 'git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], config.repoPath),
    optionalStdout(runCommand, 'git', ['remote', 'get-url', 'origin'], config.repoPath),
    optionalStdout(runCommand, 'git', ['rev-parse', 'HEAD'], config.repoPath),
    optionalStdout(runCommand, 'git', ['status', '--porcelain', '--untracked-files=no'], config.repoPath)
  ])
  const remoteCommit = upstream
    ? await optionalStdout(runCommand, 'git', ['rev-parse', upstream], config.repoPath)
    : undefined
  const latestVersion = upstream
    ? await readRemotePackageVersion(runCommand, config.repoPath, upstream)
    : undefined
  return {
    branch,
    upstream,
    remoteUrl,
    localCommit,
    remoteCommit,
    currentVersion: String(packageJson.version ?? '0.0.0'),
    latestVersion,
    dirty: Boolean(dirtyStatus?.trim())
  }
}

async function readPackageJson(repoPath: string): Promise<{ name?: string; version?: string }> {
  const raw = await fs.readFile(path.join(repoPath, 'package.json'), 'utf8')
  return JSON.parse(raw) as { name?: string; version?: string }
}

async function readCurrentVersion(repoPath: string): Promise<string> {
  try {
    return String((await readPackageJson(repoPath)).version ?? '0.0.0')
  } catch {
    return '0.0.0'
  }
}

async function readRemotePackageVersion(runCommand: CommandRunner, repoPath: string, upstream: string): Promise<string | undefined> {
  const result = await runCommand('git', ['show', `${upstream}:package.json`], { cwd: repoPath })
  if (result.exitCode !== 0) return undefined
  try {
    const parsed = JSON.parse(result.stdout) as { version?: string }
    return parsed.version
  } catch {
    return undefined
  }
}

async function optionalStdout(runCommand: CommandRunner, command: string, args: string[], cwd: string): Promise<string | undefined> {
  const result = await runCommand(command, args, { cwd })
  if (result.exitCode !== 0) return undefined
  return result.stdout.trim()
}

async function mustRun(runCommand: CommandRunner, command: string, args: string[], cwd: string): Promise<CommandResult> {
  const result = await runCommand(command, args, { cwd })
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
  }
  return result
}

function makeStatus(
  state: LocalUpdateStatus['state'],
  updateAvailable: boolean,
  config: LocalUpdateConfig,
  repoInfo: RepoInfo,
  language: AppLanguage,
  checkedAt: string,
  messageKey: string,
  messageParams = {}
): LocalUpdateStatus {
  return {
    state,
    updateAvailable,
    currentVersion: repoInfo.currentVersion,
    latestVersion: repoInfo.latestVersion,
    repoPath: config.repoPath,
    installTarget: config.installTarget,
    currentBranch: repoInfo.branch,
    upstream: repoInfo.upstream,
    localCommit: repoInfo.localCommit,
    remoteCommit: repoInfo.remoteCommit,
    remoteUrl: repoInfo.remoteUrl,
    dirty: repoInfo.dirty,
    message: t(language, messageKey, messageParams),
    messageKey,
    messageParams,
    checkedAt
  }
}

function emit(
  onProgress: ((progress: LocalUpdateProgress) => void) | undefined,
  language: AppLanguage,
  stage: LocalUpdateProgress['stage'],
  messageKey: string,
  messageParams = {}
): void {
  onProgress?.({
    stage,
    message: t(language, messageKey, messageParams),
    messageKey,
    messageParams
  })
}

function defaultCommandRunner(command: string, args: string[], options: { cwd: string }): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: process.env
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: 1 })
    })
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 })
    })
  })
}

function defaultSpawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
    env: process.env
  })
  child.unref()
}

function copyAppBundleWithDitto(source: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ditto', ['--rsrc', '--extattr', '--acl', source, target], {
      shell: false,
      stdio: 'ignore',
      env: process.env
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve()
        return
      }
      reject(new Error(`ditto failed with exit code ${exitCode ?? 1}`))
    })
  })
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isInsideApplications(targetPath: string): boolean {
  if (!path.isAbsolute(targetPath)) return false
  const applicationsRoot = path.join(os.homedir(), 'Applications')
  const relative = path.relative(applicationsRoot, targetPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(targetPath) === PRODUCT_APP_NAME
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
