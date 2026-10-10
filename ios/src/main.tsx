// Must come first: it sets window.api, which the app's store reads when it loads.
import './webApi'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/source-serif-4'
import '@/styles.css'
import { App } from '@/App'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// Ask Safari to keep this app's storage instead of clearing it when space runs low.
navigator.storage?.persist?.().catch(() => {})
