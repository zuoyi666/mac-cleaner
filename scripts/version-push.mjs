#!/usr/bin/env node
import process from 'node:process'
import {
  bumpVersion,
  ensureCleanWorktree,
  parseArgs,
  readJson,
  run,
  runValidation,
  updatePackageVersions
} from './release-helpers.mjs'

const args = parseArgs(process.argv.slice(2))
const level = args.level
const message = args.message
const dryRun = Boolean(args.dryRun)

if (!['patch', 'minor', 'major'].includes(level) || !message) {
  console.error('Usage: npm run version:push -- --level patch|minor|major --message "..." [--dry-run]')
  process.exit(2)
}

const root = process.cwd()
const currentVersion = readJson(`${root}/package.json`).version
const nextVersion = bumpVersion(currentVersion, level)

if (dryRun) {
  console.log(`[dry-run] would bump ${currentVersion} -> ${nextVersion}`)
  console.log('[dry-run] would run validation commands')
  console.log(`[dry-run] would commit: chore(release): v${nextVersion}`)
  console.log('[dry-run] would push current branch and print PR status')
  process.exit(0)
}

ensureCleanWorktree(root)
updatePackageVersions(root, nextVersion)
runValidation(root)
run('git', ['add', 'package.json', 'package-lock.json', 'README.md'], { cwd: root })
run('git', ['commit', '-m', `chore(release): v${nextVersion}`], { cwd: root })
run('git', ['push'], { cwd: root })

console.log(`Version updated from ${currentVersion} to ${nextVersion}.`)
try {
  console.log(run('gh', ['pr', 'view', '--json', 'url,statusCheckRollup'], { cwd: root, capture: true }))
} catch {
  console.log('Pushed branch. No open PR status was found.')
}

if (message !== `chore(release): v${nextVersion}`) {
  console.log(`Requested message noted: ${message}`)
}
