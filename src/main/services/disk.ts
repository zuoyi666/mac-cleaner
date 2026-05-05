import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DiskSummary } from '../../shared/types'

const execFileAsync = promisify(execFile)

export async function getDiskSummary(targetPath: string): Promise<DiskSummary> {
  try {
    const { stdout } = await execFileAsync('df', ['-kP', targetPath])
    const rows = stdout.trim().split('\n')
    const data = rows[1]?.trim().split(/\s+/)

    if (!data || data.length < 6) {
      throw new Error('Unexpected df output')
    }

    const totalBytes = Number(data[1]) * 1024
    const usedBytes = Number(data[2]) * 1024
    const availableBytes = Number(data[3]) * 1024

    return {
      mountPath: data[5],
      totalBytes,
      usedBytes,
      availableBytes
    }
  } catch {
    return {
      mountPath: targetPath,
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0
    }
  }
}
