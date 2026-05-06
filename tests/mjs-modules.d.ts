declare module '*.mjs' {
  import type { AppLanguage } from '../src/shared/types'

  export function parseLanguageArg(argv: string[]): AppLanguage | undefined
  export function getLanguageSettingsPath(homeDir?: string): string
  export function readLanguagePreference(settingsPath?: string): Promise<AppLanguage | null>
  export function writeLanguagePreference(language: AppLanguage, settingsPath?: string, now?: Date): Promise<AppLanguage>
}
