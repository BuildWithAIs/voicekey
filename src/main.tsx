import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import { initI18n } from './i18n'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

initI18n()
  .catch((error) => {
    console.error('[i18n] Failed to initialize, falling back to defaults.', error)
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <App />
        <Toaster />
      </React.StrictMode>,
    )
  })

// Use contextBridge
// Guard ipcRenderer access to support browser preview/dev mode
if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    console.log(message)
  })
}
