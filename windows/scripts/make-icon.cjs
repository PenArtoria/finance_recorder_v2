// Renders the app icon (build/icon.png, 512×512) with Electron's own renderer.
// Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 512
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 64 64">
  <rect x="1" y="1" width="62" height="62" rx="15" fill="#D97757"/>
  <path d="M32 13c-8.3 0-14.5 11.4-14.5 20.6C17.5 42.4 24 48 32 48s14.5-5.6 14.5-14.4C46.5 24.4 40.3 13 32 13z" fill="#FBF7EF"/>
  <path d="M14 42.5c5.2 6 11.2 8.5 18 8.5s12.8-2.5 18-8.5" fill="none" stroke="#FBF7EF" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M26 35.5l4.2-4.4 3.6 3 5.6-6.1" fill="none" stroke="#D97757" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
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
