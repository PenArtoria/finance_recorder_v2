// Renders the app icon (build/icon.png, 512×512) with Electron's own renderer.
// Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 512
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 64 64">
  <rect x="1" y="1" width="62" height="62" rx="15" fill="#D97757"/>
  <circle cx="32" cy="32" r="20" fill="#FBF7EF"/>
  <circle cx="32" cy="32" r="16" fill="none" stroke="#D97757" stroke-opacity="0.3" stroke-width="1.5"/>
  <path d="M23.5 40.5V24.5l8.5 9.5 8.5-9.5v16" fill="none" stroke="#D97757" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  win.webContents.setFrameRate(1)
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const out = path.join(__dirname, '..', 'build', 'icon.png')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG())
  console.log('wrote', out, image.getSize())
  app.quit()
})
