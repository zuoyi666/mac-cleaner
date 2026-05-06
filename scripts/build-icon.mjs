#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(rootDir, 'build')
const sourcePng = path.join(buildDir, 'icon-source.png')
const iconsetDir = path.join(buildDir, 'icon.iconset')
const iconOutput = path.join(buildDir, 'icon.icns')
const faviconOutput = path.join(rootDir, 'src', 'renderer', 'favicon.svg')

if (!existsSync(sourcePng)) {
  throw new Error(`Missing icon source: ${path.relative(rootDir, sourcePng)}`)
}

rmSync(iconsetDir, { recursive: true, force: true })
mkdirSync(iconsetDir, { recursive: true })

const iconSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

for (const [fileName, size] of iconSizes) {
  execFileSync('sips', ['-z', String(size), String(size), sourcePng, '--out', path.join(iconsetDir, fileName)], {
    stdio: 'ignore'
  })
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', iconOutput], { stdio: 'inherit' })
rmSync(iconsetDir, { recursive: true, force: true })

writeFileSync(
  faviconOutput,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="8" y1="4" x2="56" y2="60">
      <stop stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e8eef5"/>
    </linearGradient>
    <linearGradient id="drive" x1="18" y1="17" x2="46" y2="50">
      <stop stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#9aa7b6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#bg)"/>
  <rect x="15" y="17" width="34" height="30" rx="5" fill="url(#drive)" stroke="#768394" stroke-width="1.5"/>
  <path d="M15 36h34v8a5 5 0 0 1-5 5H20a5 5 0 0 1-5-5v-8Z" fill="#475569"/>
  <path d="M22 29a10 10 0 1 0 20 0 10 10 0 0 0-20 0Z" fill="none" stroke="#1d7cf2" stroke-width="7"/>
  <path d="M32 19a10 10 0 0 1 10 10" fill="none" stroke="#9be7f0" stroke-width="7"/>
  <path d="M38 36l8-4 8 4v9c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11v-9Z" fill="#37b24d" stroke="#f8fafc" stroke-width="2"/>
  <path d="M42 44l3 3 6-7" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
)

console.log(`Built ${path.relative(rootDir, iconOutput)} and ${path.relative(rootDir, faviconOutput)}`)
