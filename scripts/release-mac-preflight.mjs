#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const warnings = []

function commandOutput(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    return null
  }
}

function requireCommand(label, command, args = ['--version']) {
  const output = commandOutput(command, args)
  if (!output) failures.push(`${label} is not available.`)
  return output
}

function requireExecutable(label, executable) {
  const output = commandOutput('/usr/bin/which', [executable])
  if (!output) failures.push(`${label} is not available.`)
  return output
}

function requireFile(relativePath) {
  if (!existsSync(path.join(rootDir, relativePath))) {
    failures.push(`Missing ${relativePath}.`)
  }
}

if (process.platform !== 'darwin') {
  failures.push('Signed macOS releases must be built on macOS.')
}

requireExecutable('codesign', 'codesign')
requireExecutable('security', 'security')
requireCommand('notarytool', 'xcrun', ['--find', 'notarytool'])

requireFile('build/icon.icns')
requireFile('build/entitlements.mac.plist')
requireFile('build/entitlements.mac.inherit.plist')

const identities = commandOutput('security', ['find-identity', '-v', '-p', 'codesigning']) ?? ''
const requestedIdentity = process.env.CSC_NAME?.trim()

if (requestedIdentity) {
  if (!identities.includes(requestedIdentity)) {
    failures.push(`CSC_NAME was set, but no matching codesigning identity was found: ${requestedIdentity}`)
  }
} else if (!identities.includes('Developer ID Application')) {
  failures.push('No Developer ID Application certificate was found in the current Keychain. Set CSC_NAME if needed.')
}

const hasApiKeyNotarization = Boolean(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
const hasAppleIdNotarization = Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
const hasKeychainProfile = Boolean(process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE)

if (!hasApiKeyNotarization && !hasAppleIdNotarization && !hasKeychainProfile) {
  failures.push(
    'Missing notarization credentials. Prefer APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER for App Store Connect API key notarization.'
  )
}

if (hasApiKeyNotarization && process.env.APPLE_API_KEY && !existsSync(process.env.APPLE_API_KEY)) {
  failures.push('APPLE_API_KEY is set but does not point to an existing local .p8 file.')
}

if (failures.length) {
  console.error('macOS release preflight failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  if (warnings.length) {
    console.error('Warnings:')
    for (const warning of warnings) console.error(`- ${warning}`)
  }
  process.exit(1)
}

console.log('macOS release preflight passed.')
if (requestedIdentity) console.log(`Using signing identity from CSC_NAME: ${requestedIdentity}`)
else console.log('Using available Developer ID Application identity from Keychain.')

if (hasApiKeyNotarization) console.log('Using App Store Connect API key notarization environment.')
else if (hasAppleIdNotarization) console.log('Using Apple ID notarization environment.')
else console.log('Using notarytool keychain profile notarization environment.')

for (const warning of warnings) console.warn(`Warning: ${warning}`)
