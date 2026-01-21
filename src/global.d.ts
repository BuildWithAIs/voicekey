import { ElectronAPI } from '../electron/preload/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
