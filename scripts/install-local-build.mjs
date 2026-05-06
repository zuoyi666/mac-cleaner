#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLanguageArg, writeLanguagePreference } from './language-preference.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const installTarget = path.join(os.homedir(), 'Applications', 'Mac Cleaner.app')
const requestedLanguage = parseLanguageArg(process.argv.slice(2))

console.log('Mac Cleaner local install')
console.log('免费本地构建，不需要 Apple Developer 账号。')

if (!(await pathExists(path.join(repoRoot, 'node_modules')))) {
  console.log('依赖不存在，正在执行 npm ci...')
  await run('npm', ['ci'])
}

console.log('正在构建带图标的本地 App...')
await run('npm', ['run', 'package:dir'])

if (requestedLanguage) {
  await writeLanguagePreference(requestedLanguage)
  console.log(`已设置默认界面语言：${requestedLanguage}`)
}

const appPath = await findBuiltApp()
console.log(`正在安装到 ${installTarget} ...`)
await run('node', [
  path.join(repoRoot, 'scripts', 'install-local-app.mjs'),
  '--source',
  appPath,
  '--target',
  installTarget,
  '--parent-pid',
  '0'
])

console.log('安装完成。以后可以双击 ~/Applications/Mac Cleaner.app 启动。')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: 'inherit',
      env: process.env
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode ?? 1}`))
    })
  })
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function findBuiltApp() {
  const releasePath = path.join(repoRoot, 'release')
  const preferred = path.join(releasePath, `mac-${process.arch}`, 'Mac Cleaner.app')
  if (await pathExists(preferred)) return preferred

  const entries = await fs.readdir(releasePath, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('mac')) continue
    const candidate = path.join(releasePath, entry.name, 'Mac Cleaner.app')
    if (await pathExists(candidate)) return candidate
  }
  throw new Error('Built Mac Cleaner.app was not found in release/.')
}
