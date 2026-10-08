import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { FileFilter } from '@shared/types'
import { fetchFx, fetchQuotes, searchSymbols } from './quotes'
import { dataInfo, hasDataFileIn, migrateFromNestEgg, moveDataTo, primeWatch, readData, watchData, writeData } from './storage'

const TITLEBAR_HEIGHT = 44
const titleBarColors = (dark: boolean) =>
  dark
    ? { color: '#262624', symbolColor: '#C2C0B6', height: TITLEBAR_HEIGHT }
    : { color: '#FAF9F5', symbolColor: '#5E5D59', height: TITLEBAR_HEIGHT }

let win: BrowserWindow | null = null

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Moneta',
    backgroundColor: dark ? '#262624' : '#FAF9F5',
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(dark),
    autoHideMenuBar: true,
    // The packaged app takes its icon from the .exe.
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win?.show())

  // Links to websites open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (url.startsWith('https://')) shell.openExternal(url)
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

function startWatching() {
  watchData(() => win?.webContents.send('data:external-change'))
}

ipcMain.handle('data:load', async () => {
  await primeWatch()
  return { data: await readData(), info: dataInfo() }
})

ipcMain.handle('data:save', async (_e, data: unknown) => {
  await writeData(data)
  return { savedAt: Date.now() }
})

ipcMain.handle('data:info', () => dataInfo())

ipcMain.handle('data:open-folder', () => shell.openPath(dataInfo().dir))

ipcMain.handle('data:choose-folder', async () => {
  if (!win) return null
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for your Moneta data',
    properties: ['openDirectory', 'createDirectory']
  })
  if (pick.canceled || !pick.filePaths[0]) return null
  const dir = pick.filePaths[0]
  if (dir === dataInfo().dir) return { info: dataInfo(), reload: false }

  let useExisting = false
  if (hasDataFileIn(dir)) {
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Data file found',
      message: 'This folder already has a Moneta data file.',
      detail:
        'Use the file in that folder (for example one synced from another computer), or replace it with the data on this computer?',
      buttons: ['Use the file in that folder', 'Replace it with this computer’s data', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (answer.response === 2) return null
    useExisting = answer.response === 0
  }
  const info = await moveDataTo(dir, useExisting)
  await primeWatch()
  startWatching()
  return { info, reload: useExisting }
})

ipcMain.handle('data:reset-folder', async () => {
  const info = await moveDataTo(app.getPath('userData'), false)
  await primeWatch()
  startWatching()
  return info
})

ipcMain.handle('quotes:fetch', (_e, symbols: string[]) => fetchQuotes(symbols))
ipcMain.handle('quotes:search', (_e, query: string) => searchSymbols(query))
ipcMain.handle('fx:fetch', () => fetchFx())

ipcMain.handle(
  'file:export',
  async (_e, args: { defaultName: string; content: string; filters: FileFilter[] }) => {
    if (!win) return null
    const res = await dialog.showSaveDialog(win, {
      defaultPath: join(app.getPath('documents'), args.defaultName),
      filters: args.filters
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, args.content, 'utf8')
    return res.filePath
  }
)

ipcMain.handle('file:import', async (_e, filters: FileFilter[]) => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (res.canceled || !res.filePaths[0]) return null
  const path = res.filePaths[0]
  const content = await fs.readFile(path, 'utf8')
  return { name: path.split(/[\\/]/).pop() ?? path, content }
})

ipcMain.on('window:theme', (_e, dark: boolean) => {
  try {
    win?.setTitleBarOverlay(titleBarColors(dark))
    win?.setBackgroundColor(dark ? '#262624' : '#FAF9F5')
  } catch {
    // setTitleBarOverlay is unavailable on some platforms
  }
})

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  migrateFromNestEgg()
  app.whenReady().then(() => {
    // Kept from the Nest Egg days so the new installer upgrades the old one in place.
    app.setAppUserModelId('com.nestegg.app')
    createWindow()
    startWatching()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
