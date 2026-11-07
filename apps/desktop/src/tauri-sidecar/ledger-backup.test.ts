/**
 * @purpose Verify the pre-open ledger snapshot keeps recent data and stays bounded.
 * @role    Unit regression for ledger-backup.ts.
 * @deps    Vitest, better-sqlite3, and a throwaway temp directory.
 * @gotcha  The snapshot must use VACUUM INTO, so the test asserts the copy is a readable
 *          database with the same row count rather than trusting file size.
 */

import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import { LEDGER_BACKUP_LIMIT, backupLedger, pruneLedgerBackups } from "./ledger-backup"

const directories: string[] = []

function tempDb(rows: number): { dir: string; path: string; db: Database.Database } {
  const dir = mkdtempSync(join(tmpdir(), "bubo-ledger-backup-"))
  directories.push(dir)
  const path = join(dir, "bubo.sqlite3")
  const db = new Database(path)
  db.exec("CREATE TABLE cashflow_events (id INTEGER PRIMARY KEY, amount TEXT)")
  const insert = db.prepare("INSERT INTO cashflow_events (amount) VALUES (?)")
  for (let index = 0; index < rows; index += 1) insert.run(String(index + 1))
  return { dir, path, db }
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("backupLedger", () => {
  it("writes a readable snapshot with the same rows", () => {
    const { path, db } = tempDb(3)

    const target = backupLedger(db, path)
    expect(target).not.toBeNull()

    const copy = new Database(target!, { readonly: true })
    const count = copy.prepare("SELECT COUNT(*) AS count FROM cashflow_events").get() as {
      count: number
    }
    expect(count.count).toBe(3)
    copy.close()
    db.close()
  })

  it("skips an empty ledger so a fresh install leaves no clutter", () => {
    const { path, db } = tempDb(0)

    expect(backupLedger(db, path)).toBeNull()
    db.close()
  })

  it(`keeps only the newest ${LEDGER_BACKUP_LIMIT} snapshots`, () => {
    const { dir, path, db } = tempDb(1)

    for (let index = 0; index < LEDGER_BACKUP_LIMIT + 3; index += 1) {
      expect(backupLedger(db, path)).not.toBeNull()
    }

    const backups = readdirSync(dir).filter((name) => name.startsWith("bubo.sqlite3.bak-"))
    expect(backups).toHaveLength(LEDGER_BACKUP_LIMIT)
    db.close()
  })

  it("prunes without touching the live ledger", () => {
    const { dir, path, db } = tempDb(1)
    for (let index = 0; index < 3; index += 1) backupLedger(db, path)

    const removed = pruneLedgerBackups(path, 1)
    expect(removed).toBe(2)
    expect(readdirSync(dir)).toContain("bubo.sqlite3")
    db.close()
  })
})
