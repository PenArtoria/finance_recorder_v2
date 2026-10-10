import type { AppData, DataInfo, FileFilter, FxTable, LoadResult, QuoteResult, SymbolMatch } from '../shared/types'

export interface MonetaApi {
  /** Which build this is: the Windows app or the phone (web) app. */
  platform: 'windows' | 'web'
  /** Small per-device values kept outside the data file (sync key, sync state). */
  kvGet(key: string): Promise<string | null>
  kvSet(key: string, value: string | null): Promise<void>
  loadData(): Promise<LoadResult>
  saveData(data: AppData): Promise<{ savedAt: number }>
  dataInfo(): Promise<DataInfo>
  openDataFolder(): Promise<string>
  chooseDataFolder(): Promise<{ info: DataInfo; reload: boolean } | null>
  resetDataFolder(): Promise<DataInfo>
  fetchQuotes(symbols: string[]): Promise<QuoteResult>
  searchSymbols(query: string): Promise<SymbolMatch[]>
  fetchFx(): Promise<FxTable>
  exportFile(args: { defaultName: string; content: string; filters: FileFilter[] }): Promise<string | null>
  importFile(filters: FileFilter[]): Promise<{ name: string; content: string } | null>
  setTheme(dark: boolean): void
  appInfo(): Promise<{ version: string; platform: string }>
  onExternalChange(cb: () => void): () => void
}

declare global {
  interface Window {
    api: MonetaApi
  }
}
