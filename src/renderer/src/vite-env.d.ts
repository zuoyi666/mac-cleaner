/// <reference types="vite/client" />

import type { MacCleanerApi } from '../../shared/types'

declare global {
  interface Window {
    macCleaner?: MacCleanerApi
  }
}
