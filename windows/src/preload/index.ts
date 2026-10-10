import { contextBridge, ipcRenderer } from 'electron'
import type { MonetaApi } from './index.d'

const api: MonetaApi = {
  platform: 'windows',
  kvGet: (key) => ipcRenderer.invoke('kv:get', key),
  kvSet: (key, value) => ipcRenderer.invoke('kv:set', key, value),
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  dataInfo: () => ipcRenderer.invoke('data:info'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  chooseDataFolder: () => ipcRenderer.invoke('data:choose-folder'),
  resetDataFolder: () => ipcRenderer.invoke('data:reset-folder'),
  fetchQuotes: (symbols) => ipcRenderer.invoke('quotes:fetch', symbols),
  searchSymbols: (query) => ipcRenderer.invoke('quotes:search', query),
  fetchFx: () => ipcRenderer.invoke('fx:fetch'),
  exportFile: (args) => ipcRenderer.invoke('file:export', args),
  importFile: (filters) => ipcRenderer.invoke('file:import', filters),
  setTheme: (dark) => ipcRenderer.send('window:theme', dark),
  appInfo: () => ipcRenderer.invoke('app:info'),
  onExternalChange: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('data:external-change', listener)
    return () => ipcRenderer.removeListener('data:external-change', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
