import { app } from 'electron'
import { promises as fs, watchFile, unwatchFile, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DataInfo } from '@shared/types'

// Everything lives in one JSON file. By default it sits in %APPDATA%\Nest Egg,
// but the user can move it to any folder (for example OneDrive or iCloud Drive)
// so it is backed up and can be shared with another computer.

const DATA_FILE = 'nest-egg-data.json'
const BACKUP_DIR = 'backups'
const BACKUPS_KEPT = 30

interface Config {
  dataDir?: string
}

const configPath = () => join(app.getPath('userData'), 'config.json')
const defaultDir = () => app.getPath('userData')

function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(cfg: Config) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

export function dataDir(): string {
  const dir = readConfig().dataDir
  return dir && existsSync(dir) ? dir : defaultDir()
}

export function dataFile(): string {
  return join(dataDir(), DATA_FILE)
}

export function dataInfo(): DataInfo {
  const dir = dataDir()
  return { dir, file: join(dir, DATA_FILE), isDefault: dir === defaultDir() }
}

export async function readData(): Promise<unknown | null> {
  try {
    const text = await fs.readFile(dataFile(), 'utf8')
    return JSON.parse(text)
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

let lastWriteMtime = 0

async function retry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 150 * (i + 1)))
    }
  }
  throw lastErr
}

async function backupOncePerDay(dir: string, file: string) {
  if (!existsSync(file)) return
  const backups = join(dir, BACKUP_DIR)
  const today = new Date().toISOString().slice(0, 10)
  const target = join(backups, `nest-egg-${today}.json`)
  if (existsSync(target)) return
  await fs.mkdir(backups, { recursive: true })
  await fs.copyFile(file, target)
  const old = (await fs.readdir(backups)).filter((f) => f.startsWith('nest-egg-')).sort()
  for (const f of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) {
    await fs.unlink(join(backups, f)).catch(() => {})
  }
}

let writing: Promise<void> = Promise.resolve()

export function writeData(data: unknown): Promise<void> {
  // Serialize writes so two saves never interleave.
  writing = writing.then(async () => {
    const dir = dataDir()
    const file = join(dir, DATA_FILE)
    await fs.mkdir(dir, { recursive: true })
    await backupOncePerDay(dir, file).catch(() => {})
    const tmp = file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(data, null, 1), 'utf8')
    await retry(() => fs.rename(tmp, file))
    lastWriteMtime = (await fs.stat(file)).mtimeMs
  })
  return writing
}

/** Moves the data file to `dir`. When `useExisting` is set, the file already there wins. */
export async function moveDataTo(dir: string, useExisting: boolean): Promise<DataInfo> {
  const target = join(dir, DATA_FILE)
  const current = dataFile()
  if (!useExisting && existsSync(current) && current !== target) {
    await fs.copyFile(current, target)
  }
  writeConfig({ ...readConfig(), dataDir: dir === defaultDir() ? undefined : dir })
  return dataInfo()
}

export function hasDataFileIn(dir: string): boolean {
  return existsSync(join(dir, DATA_FILE))
}

let watched: string | null = null

/** Calls `onChange` when another program (e.g. OneDrive sync) replaces the data file. */
export function watchData(onChange: () => void) {
  if (watched) unwatchFile(watched)
  watched = dataFile()
  watchFile(watched, { interval: 3000 }, (curr) => {
    if (curr.mtimeMs && Math.abs(curr.mtimeMs - lastWriteMtime) > 1) {
      lastWriteMtime = curr.mtimeMs
      onChange()
    }
  })
}

export async function primeWatch() {
  try {
    lastWriteMtime = (await fs.stat(dataFile())).mtimeMs
  } catch {
    lastWriteMtime = 0
  }
}
