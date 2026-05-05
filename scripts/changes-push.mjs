#!/usr/bin/env node
import process from 'node:process'
import { getGitStatus, parseArgs, run, runValidation } from './release-helpers.mjs'

const args = parseArgs(process.argv.slice(2))
const message = args.message
const dryRun = Boolean(args.dryRun)
const root = process.cwd()

if (!message) {
  console.error('Usage: npm run changes:push -- --message "..." [--dry-run]')
  process.exit(2)
}

const status = getGitStatus(root)
if (!status) {
  console.log('No local changes to push.')
  process.exit(0)
}

if (dryRun) {
  console.log('[dry-run] would run validation commands')
  console.log(`[dry-run] would commit: ${message}`)
  console.log('[dry-run] would push current branch and print PR status')
  process.exit(0)
}

runValidation(root)
run('git', ['add', '-A'], { cwd: root })
run('git', ['commit', '-m', message], { cwd: root })
run('git', ['push'], { cwd: root })

try {
  console.log(run('gh', ['pr', 'view', '--json', 'url,statusCheckRollup'], { cwd: root, capture: true }))
} catch {
  console.log('Pushed branch. No open PR status was found.')
}
