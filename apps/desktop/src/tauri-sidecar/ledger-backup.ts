/**
 * @purpose Keep a rolling snapshot of the active ledger before each open.
 * @role    Sidecar-side safety net around better-sqlite3 so a bad migration or a mistaken
 *          import can always be rolled back to a recent file.
 * @deps    node:fs, node:path, and the better-sqlite3 handle that is already open.
 * @gotcha  Copy the file with `VACUUM INTO`, never with a plain file copy: the main file
 *          omits uncheckpointed WAL pages, so a naive copy can lose the last writes.
 *          An empty ledger is skipped — a fresh install has nothing worth keeping.
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"

import type Database from "better-sqlite3"

/** How many pre-open snapshots stay on disk per ledger file. */
export const LEDGER_BACKUP_LIMIT = 7

/** `2026-11-08T06-20-01-123Z` — sorts lexicographically and is filesystem-safe. */
export function backupStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

export function backupPrefix(dbPath: string): string {
  return `${basename(dbPath)}.bak-`
}

/** Delete all but the newest `limit` snapshots of one ledger file. Returns how many went. */
export function pruneLedgerBackups(dbPath: string, limit = LEDGER_BACKUP_LIMIT): number {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) return 0
  const prefix = backupPrefix(dbPath)
  const backups = readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse()
  let removed = 0
  for (const name of backups.slice(limit)) {
    try {
      rmSync(join(dir, name), { force: true })
      removed += 1
    } catch {
      // A file held open by another process is not worth failing startup over.
    }
  }
  return removed
}

/**
 * Snapshot the currently open ledger. Returns the new file path, or null when the ledger
 * holds no cashflow rows yet (fresh install) or the snapshot could not be written.
 */
export function backupLedger(
  client: Database.Database,
  dbPath: string,
  limit = LEDGER_BACKUP_LIMIT,
): string | null {
  let rows = 0
  try {
    const row = client.prepare("SELECT COUNT(*) AS count FROM cashflow_events").get() as
      | { count: number }
      | undefined
    rows = row?.count ?? 0
  } catch {
    // Table missing means the file predates the schema; nothing to preserve.
    return null
  }
  if (rows === 0) return null

  const target = join(dirname(dbPath), `${backupPrefix(dbPath)}${backupStamp()}`)
  try {
    client.prepare("VACUUM INTO ?").run(target)
  } catch (error) {
    console.error("[bubo-sidecar] ledger snapshot failed:", error)
    return null
  }

  if (statSync(target).size === 0) {
    // VACUUM INTO never writes an empty database; a zero-byte file means it was interrupted.
    rmSync(target, { force: true })
    return null
  }

  pruneLedgerBackups(dbPath, limit)
  return target
}
