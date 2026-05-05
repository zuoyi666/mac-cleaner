import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const validationCommands = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['test']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'smoke:electron']],
  ['npm', ['audit', '--audit-level=high']],
  ['npm', ['run', 'release:dry-run']]
]

export function parseArgs(argv) {
  const parsed = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) {
      parsed._.push(item)
      continue
    }
    const key = item.slice(2)
    if (key === 'dry-run') {
      parsed.dryRun = true
      continue
    }
    parsed[key] = argv[index + 1]
    index += 1
  }
  return parsed
}

export function bumpVersion(version, level) {
  const parts = version.split('.').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid SemVer version: ${version}`)
  }
  if (level === 'major') return `${parts[0] + 1}.0.0`
  if (level === 'minor') return `${parts[0]}.${parts[1] + 1}.0`
  if (level === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  throw new Error('Version level must be patch, minor, or major.')
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 1}`)
  }
  return result.stdout?.trim() ?? ''
}

export function getGitStatus(cwd = process.cwd()) {
  return spawnSync('git', ['status', '--porcelain'], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false
  }).stdout.trim()
}

export function ensureCleanWorktree(cwd = process.cwd()) {
  const status = getGitStatus(cwd)
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes before running this command.')
  }
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function updatePackageVersions(root, nextVersion) {
  const packagePath = path.join(root, 'package.json')
  const packageJson = readJson(packagePath)
  const previousVersion = packageJson.version
  packageJson.version = nextVersion
  writeJson(packagePath, packageJson)

  const lockPath = path.join(root, 'package-lock.json')
  if (fs.existsSync(lockPath)) {
    const lockJson = readJson(lockPath)
    lockJson.version = nextVersion
    if (lockJson.packages?.['']) {
      lockJson.packages[''].version = nextVersion
    }
    writeJson(lockPath, lockJson)
  }

  const readmePath = path.join(root, 'README.md')
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8')
    fs.writeFileSync(readmePath, readme.replace(`v${previousVersion}`, `v${nextVersion}`))
  }

  return previousVersion
}

export function runValidation(root = process.cwd()) {
  for (const [command, args] of validationCommands) {
    run(command, args, { cwd: root })
  }
}
