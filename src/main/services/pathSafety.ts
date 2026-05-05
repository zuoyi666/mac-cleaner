import path from 'node:path'

export function isWithinPath(targetPath: string, rootPath: string): boolean {
  const target = path.resolve(targetPath)
  const root = path.resolve(rootPath)
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function compactPathForDisplay(filePath: string, homeDir: string): string {
  const relative = path.relative(homeDir, filePath)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return path.join('~', relative)
  }
  return filePath
}
