#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const source = args.source
const target = args.target
const parentPid = Number(args['parent-pid'] ?? 0)

if (!source || !target || !isAllowedTarget(target)) {
  console.error('Usage: install-local-app.mjs --source <Mac Cleaner.app> --target <~/Applications/Mac Cleaner.app> --parent-pid <pid>')
  process.exit(2)
}

await waitForParentExit(parentPid)
await fs.mkdir(path.dirname(target), { recursive: true })
await fs.rm(target, { recursive: true, force: true })
await fs.cp(source, target, { recursive: true })
await fs.rm(path.dirname(source), { recursive: true, force: true }).catch(() => undefined)
spawn('/usr/bin/open', [target], { detached: true, stdio: 'ignore', shell: false }).unref()

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) continue
    parsed[key.slice(2)] = value
  }
  return parsed
}

async function waitForParentExit(pid) {
  if (!pid || Number.isNaN(pid)) return
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!isProcessAlive(pid)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isAllowedTarget(targetPath) {
  if (!path.isAbsolute(targetPath)) return false
  const applicationsRoot = path.join(os.homedir(), 'Applications')
  const relative = path.relative(applicationsRoot, targetPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(targetPath) === 'Mac Cleaner.app'
}
