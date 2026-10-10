// Renders the phone app icons with Electron: an apple-touch icon and manifest icons.
// iPhone rounds the corners itself, so these are full squares.
// Run from this folder: ../windows/node_modules/.bin/electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
  <rect width="64" height="64" fill="#D97757"/>
  <g transform="translate(32 32) scale(${pad}) translate(-32 -32)">
    <circle cx="32" cy="32" r="20" fill="#FBF7EF"/>
    <circle cx="32" cy="32" r="16" fill="none" stroke="#D97757" stroke-opacity="0.3" stroke-width="1.5"/>
    <path d="M23.5 40.5V24.5l8.5 9.5 8.5-9.5v16" fill="none" stroke="#D97757" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`

const outputs = [
  { file: 'apple-touch-icon.png', size: 180, pad: 1.18 },
  { file: 'icon-192.png', size: 192, pad: 1.18 },
  { file: 'icon-512.png', size: 512, pad: 1.18 },
  { file: 'maskable-512.png', size: 512, pad: 0.95 }
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  for (const o of outputs) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;overflow:hidden">${mark(o.pad)}</body></html>`))
    await new Promise((r) => setTimeout(r, 400))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
    const out = path.join(__dirname, '..', 'public', 'icons', o.file)
    fs.writeFileSync(out, img.resize({ width: o.size, height: o.size, quality: 'best' }).toPNG())
    console.log('wrote', o.file)
  }
  app.quit()
})
