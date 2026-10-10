import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The phone app reuses the Windows app's screens and logic from ../windows/src.
// Only the platform layer (storage, prices, files) lives here, in src/webApi.ts.

const shared = resolve(__dirname, '../windows/src')
const version = JSON.parse(readFileSync(resolve(__dirname, '../windows/package.json'), 'utf8')).version

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(shared, 'renderer/src'),
      '@shared': resolve(shared, 'shared')
    },
    // One copy of each library, even for files that live in ../windows.
    dedupe: ['react', 'react-dom', 'zustand', 'recharts', 'lucide-react', 'qrcode']
  },
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
    proxy: { '/api': 'http://127.0.0.1:8787' }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500
  }
})
