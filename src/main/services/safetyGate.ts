import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AppLanguage, ProtectedPath, TrustEvidenceItem } from '../../shared/types'
import { t } from '../../shared/i18n'
import { compactPathForDisplay, isWithinPath } from './pathSafety'

const FORBIDDEN_EXACT_ROOTS = ['/']
const FORBIDDEN_TREE_ROOTS = ['/System', '/bin', '/sbin', '/usr/bin', '/usr/sbin']

export interface SafetyGateInput {
  targetPath: string
  allowedRoot: string
  homeDir: string
  protectedPaths?: ProtectedPath[]
  language?: AppLanguage
}

export interface SafetyGateResult {
  allowed: boolean
  normalizedPath: string
  evidence: TrustEvidenceItem[]
  blockReasonKey?: string
  blockReasonParams?: Record<string, string | number>
}

export async function runSafetyGate(input: SafetyGateInput): Promise<SafetyGateResult> {
  const language = input.language ?? 'zh-CN'
  const targetPath = path.resolve(input.targetPath)
  const allowedRoot = path.resolve(input.allowedRoot)
  const homeDir = path.resolve(input.homeDir)
  const evidence: TrustEvidenceItem[] = []

  const block = (reasonKey: string, reasonParams: Record<string, string | number> = {}): SafetyGateResult => ({
    allowed: false,
    normalizedPath: targetPath,
    evidence: [
      ...evidence,
      evidenceItem(language, 'preflight.blocked.label', reasonKey, 'blocked', {
        path: compactPathForDisplay(targetPath, homeDir),
        root: compactPathForDisplay(allowedRoot, homeDir),
        ...reasonParams
      })
    ],
    blockReasonKey: reasonKey,
    blockReasonParams: reasonParams
  })

  if (
    hasControlCharacters(input.targetPath) ||
    hasControlCharacters(input.allowedRoot) ||
    hasUnsafeTraversal(input.targetPath) ||
    hasUnsafeTraversal(input.allowedRoot)
  ) {
    return block('preflight.blocked.controlChars.detail')
  }

  if (isForbiddenRoot(targetPath, homeDir)) {
    return block('preflight.blocked.forbiddenRoot.detail')
  }

  if (!isWithinPath(targetPath, allowedRoot)) {
    return block('preflight.blocked.outsideRoot.detail', { root: compactPathForDisplay(allowedRoot, homeDir) })
  }
  evidence.push(evidenceItem(language, 'preflight.allowedRoot.label', 'preflight.allowedRoot.detail', 'safe', {
    root: compactPathForDisplay(allowedRoot, homeDir)
  }))

  const protectedMatch = findProtectedPath(targetPath, input.protectedPaths ?? [])
  if (protectedMatch) {
    return block('preflight.blocked.protectedPath.detail', {
      protectedPath: compactPathForDisplay(protectedMatch.path, homeDir)
    })
  }
  evidence.push(evidenceItem(language, 'preflight.protectedPath.label', 'preflight.protectedPath.detail', 'safe'))

  let targetStats
  try {
    targetStats = await fs.lstat(targetPath)
  } catch (error) {
    return block('preflight.blocked.statFailed.detail', { error: formatError(error) })
  }

  if (targetStats.isSymbolicLink()) {
    return block('preflight.blocked.symlink.detail')
  }
  evidence.push(evidenceItem(language, 'preflight.symlink.label', 'preflight.symlink.detail', 'safe'))

  try {
    const rootStats = await fs.lstat(allowedRoot)
    if (rootStats.dev !== targetStats.dev) {
      return block('preflight.blocked.crossVolume.detail')
    }
    evidence.push(evidenceItem(language, 'preflight.volume.label', 'preflight.volume.detail', 'safe'))
  } catch (error) {
    return block('preflight.blocked.rootStatFailed.detail', { error: formatError(error) })
  }

  return {
    allowed: true,
    normalizedPath: targetPath,
    evidence
  }
}

export function normalizeProtectedPaths(paths: ProtectedPath[], homeDir = os.homedir(), now = new Date()): ProtectedPath[] {
  const seen = new Set<string>()
  const normalized: ProtectedPath[] = []
  for (const item of paths) {
    if (!item || typeof item.path !== 'string') continue
    const protectedPath = path.resolve(expandHomePath(item.path, homeDir))
    if (hasControlCharacters(item.path) || hasUnsafeTraversal(item.path) || isForbiddenRoot(protectedPath, path.resolve(homeDir))) continue
    if (!isWithinPath(protectedPath, homeDir)) continue
    if (seen.has(protectedPath)) continue
    seen.add(protectedPath)
    normalized.push({
      id: typeof item.id === 'string' && item.id.length ? item.id.slice(0, 100) : `protected-${stableHash(protectedPath)}`,
      path: protectedPath,
      reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim().slice(0, 160) : undefined,
      createdAt: typeof item.createdAt === 'string' && item.createdAt.length ? item.createdAt : now.toISOString()
    })
  }
  return normalized.slice(0, 100)
}

function findProtectedPath(targetPath: string, protectedPaths: ProtectedPath[]): ProtectedPath | undefined {
  const target = path.resolve(targetPath)
  return protectedPaths.find((item) => {
    const protectedPath = path.resolve(item.path)
    return isWithinPath(target, protectedPath) || isWithinPath(protectedPath, target)
  })
}

function isForbiddenRoot(targetPath: string, homeDir: string): boolean {
  const resolved = path.resolve(targetPath)
  const exactRoots = new Set([...FORBIDDEN_EXACT_ROOTS.map((root) => path.resolve(root)), homeDir, path.join(homeDir, 'Library')])
  if (exactRoots.has(resolved)) return true
  return FORBIDDEN_TREE_ROOTS.some((root) => {
    const forbiddenRoot = path.resolve(root)
    return resolved === forbiddenRoot || isWithinPath(resolved, forbiddenRoot)
  })
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}

function hasUnsafeTraversal(value: string): boolean {
  return value.split(/[\\/]+/).includes('..')
}

function expandHomePath(value: string, homeDir: string): string {
  if (value === '~') return homeDir
  if (value.startsWith(`~${path.sep}`)) return path.join(homeDir, value.slice(2))
  return value
}

function evidenceItem(
  language: AppLanguage,
  labelKey: string,
  detailKey: string,
  tone: TrustEvidenceItem['tone'],
  params: Record<string, string | number> = {}
): TrustEvidenceItem {
  return {
    label: t(language, labelKey, params),
    labelKey,
    labelParams: params,
    detail: t(language, detailKey, params),
    detailKey,
    detailParams: params,
    tone
  }
}

function stableHash(value: string): string {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash.toString(16)
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
