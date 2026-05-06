declare module '*.mjs' {
  import type { AppLanguage } from '../src/shared/types'

  export function parseLanguageArg(argv: string[]): AppLanguage | undefined
  export function parseInstallTargetArg(argv: string[], homeDir?: string): string | undefined
  export function getLanguageSettingsPath(homeDir?: string): string
  export function getDefaultInstallTarget(homeDir?: string): string
  export function readLanguagePreference(settingsPath?: string): Promise<AppLanguage | null>
  export function readInstallTarget(settingsPath?: string, homeDir?: string): Promise<string | null>
  export function writeLanguagePreference(language: AppLanguage, settingsPath?: string, now?: Date): Promise<AppLanguage>
  export function writeInstallTarget(installTarget: string, settingsPath?: string, now?: Date, homeDir?: string): Promise<string>
  export function chooseInstallTarget(options?: {
    requestedTarget?: string
    settingsPath?: string
    homeDir?: string
    stdin?: NodeJS.ReadStream
    stdout?: NodeJS.WriteStream
  }): Promise<string>
}
