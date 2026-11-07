/**
 * @purpose Keep the development profile in step with the real ledger before `tauri dev`.
 * @role    Pre-dev sync step: the packaged app and `pnpm dev` use different bundle
 *          identifiers, so their data folders differ; this copies the real ledger forward.
 * @deps    node:fs, node:os, node:path only — runs before the sidecar bundle exists.
 * @gotcha  One-way and newest-wins: it only copies when the real ledger is strictly newer,
 *          so a dev session that recorded fresh entries is never overwritten by an older
 *          copy. The dev file is snapshotted first, and a stale `-wal`/`-shm` must be
 *          removed when the source has none, or SQLite would replay a foreign WAL.
 */

import { copyFileSync, existsSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

const APP_ID = "com.chaordex.bubo"
const DEV_APP_ID = "com.chaordex.bubo.dev"
const LEDGER = "bubo.sqlite3"
const SIDECARS = ["bubo.sqlite3-wal", "bubo.sqlite3-shm"]
const METADATA = ["bubo-ledgers.json", "bubo-voice.json"]
const BACKUP_LIMIT = 7
const STALE_MS = 2000

function appSupportRoot() {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support")
  if (platform() === "win32") return process.env.APPDATA ?? join(homedir(), "AppData", "Roaming")
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-")
}

function prune(dir, prefix) {
  if (!existsSync(dir)) return
  const olds = readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse()
    .slice(BACKUP_LIMIT)
  for (const name of olds) rmSync(join(dir, name), { force: true })
}

function copyKeepingMtime(from, to) {
  copyFileSync(from, to)
  const { atime, mtime } = statSync(from)
  utimesSync(to, atime, mtime)
}

function main() {
  if (process.env.BUBO_SKIP_LEDGER_SYNC === "1") {
    console.log("[ledger-sync] skipped (BUBO_SKIP_LEDGER_SYNC=1)")
    return
  }

  const root = appSupportRoot()
  const source = join(root, APP_ID)
  const target = join(root, DEV_APP_ID)
  const sourceDb = join(source, LEDGER)
  const targetDb = join(target, LEDGER)

  if (!existsSync(sourceDb)) {
    console.log("[ledger-sync] 还没有打包版账本，跳过同步")
    return
  }
  if (!existsSync(target)) {
    console.log("[ledger-sync] 还没有开发版数据目录，跳过同步（首次启动会自动创建）")
    return
  }

  const sourceTime = statSync(sourceDb).mtimeMs
  const targetTime = existsSync(targetDb) ? statSync(targetDb).mtimeMs : 0
  if (targetTime >= sourceTime - STALE_MS) {
    console.log("[ledger-sync] 开发版账本已是最新，无需同步")
    return
  }

  // Never clobber silently: keep the pre-sync dev file around, newest 7 only.
  if (existsSync(targetDb)) {
    const backup = join(target, `${LEDGER}.bak-dev-${stamp()}`)
    copyFileSync(targetDb, backup)
    prune(target, `${LEDGER}.bak-dev-`)
    console.log(`[ledger-sync] 已备份开发版账本：${backup}`)
  }

  copyKeepingMtime(sourceDb, targetDb)
  for (const name of SIDECARS) {
    const from = join(source, name)
    const to = join(target, name)
    if (existsSync(from)) copyKeepingMtime(from, to)
    else if (existsSync(to)) rmSync(to, { force: true })
  }
  for (const name of METADATA) {
    const from = join(source, name)
    if (existsSync(from)) copyKeepingMtime(from, join(target, name))
  }

  const size = (statSync(targetDb).size / 1024 / 1024).toFixed(1)
  console.log(`[ledger-sync] 已将打包版账本同步到开发版（${size} MB）`)
}

main()
