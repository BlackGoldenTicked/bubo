/**
 * @purpose Import a QianJi (钱迹) ledger export into a bubo SQLite ledger as categories and cashflow.
 * @role    One-shot migration CLI that replaces seeded sample data with real history.
 * @deps    better-sqlite3, Drizzle migrations, the @bubo/api facade, and @bubo/db schema.
 * @gotcha  --wipe deletes seeded business rows (never currency/exchange settings) and always writes
 *          a `bubo.sqlite3.bak-<ts>` backup first. Re-runs skip rows whose QianJi id already exists.
 *          Input JSON is produced from the workbook with openpyxl (one object per 账单 row).
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import BetterSqlite3 from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { createBuboApi } from "@bubo/api"
import type { BuboId } from "@bubo/shared/contracts"
import { schema, type Database } from "@bubo/db"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, "../../../packages/db/migrations")

const DEV_DB_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "com.chaordex.bubo.dev",
  "bubo.sqlite3",
)

interface QianJiRow {
  id: string
  time: string
  category: string
  subcategory: string
  type: string
  amount: number
  currency: string
  account1: string
  account2: string
  note: string
}

interface CliOptions {
  jsonPath: string
  dbPath: string
  wipe: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { jsonPath: "", dbPath: DEV_DB_PATH, wipe: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") options.jsonPath = resolve(argv[++index] ?? "")
    else if (arg === "--db") options.dbPath = resolve(argv[++index] ?? "")
    else if (arg === "--wipe") options.wipe = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.jsonPath)
    throw new Error("Usage: tsx import-qianji.ts --json <export.json> [--db <path>] [--wipe]")
  if (!existsSync(options.jsonPath)) throw new Error(`Input JSON not found: ${options.jsonPath}`)
  if (!existsSync(options.dbPath)) throw new Error(`Ledger database not found: ${options.dbPath}`)
  return options
}

/** QianJi top-level categories, split by direction where history mixes both. */
const CATEGORIES: Array<{ name: string; kind: "expense" | "income"; color: string }> = [
  { name: "日常", kind: "expense", color: "#e07b3a" },
  { name: "零食", kind: "expense", color: "#c46a9e" },
  { name: "三餐", kind: "expense", color: "#d4a017" },
  { name: "车相关", kind: "expense", color: "#4a8fc4" },
  { name: "彩票", kind: "expense", color: "#a86fc4" },
  { name: "话费数码软件", kind: "expense", color: "#4a9d94" },
  { name: "医疗健身", kind: "expense", color: "#5bac8e" },
  { name: "住房", kind: "expense", color: "#7c8a52" },
  { name: "宠物", kind: "expense", color: "#c4694a" },
  { name: "水电煤", kind: "expense", color: "#5e9e9f" },
  { name: "其它", kind: "expense", color: "#8a9590" },
  { name: "小金马", kind: "expense", color: "#b0713f" },
  { name: "书影音", kind: "expense", color: "#7c6ac4" },
  { name: "彩票", kind: "income", color: "#a86fc4" },
  { name: "政策补贴", kind: "income", color: "#14794a" },
  { name: "其它", kind: "income", color: "#8a9590" },
]

/** Child tables first so foreign keys never block the wipe. */
const WIPE_TABLES = [
  "loan_payment_occurrences",
  "asset_snapshots",
  "budget_item_scopes",
  "budget_items",
  "budget_periods",
  "budget_sets",
  "object_links",
  "cashflow_event_tags",
  "tags",
  "statement_lines",
  "statement_imports",
  "price_quotes",
  "investment_transactions",
  "investment_positions",
  "contract_positions",
  "subscriptions",
  "loans",
  "asset_items",
  "cashflow_events",
  "categories",
] as const

function expectOk<T>(result: { success: boolean; data: T; error?: string }): T {
  if (!result.success) throw new Error(result.error ?? "operation failed")
  return result.data
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const rows = JSON.parse(readFileSync(options.jsonPath, "utf8")) as QianJiRow[]
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("input JSON contains no rows")

  const backupPath = `${options.dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
  copyFileSync(options.dbPath, backupPath)
  console.log(`backup written: ${backupPath}`)

  const client = new BetterSqlite3(options.dbPath)
  client.pragma("foreign_keys = ON")
  client.pragma("journal_mode = WAL")
  const db: Database = drizzle(client, { schema })
  migrate(db, { migrationsFolder })

  if (options.wipe) {
    const wipe = client.transaction(() => {
      for (const table of WIPE_TABLES) client.prepare(`DELETE FROM "${table}"`).run()
    })
    wipe()
    console.log(`wiped seeded business tables (${WIPE_TABLES.length} tables)`)
  }

  const api = createBuboApi(db)

  const categoryIds = new Map<string, BuboId>()
  for (const category of CATEGORIES) {
    const created = expectOk(
      await api.createCategory({
        name: category.name,
        categoryKind: category.kind,
        color: category.color,
      }),
    )
    categoryIds.set(`${category.name}|${category.kind}`, created.id)
  }
  console.log(`categories created: ${categoryIds.size}`)

  const existingExternalIds = new Set(
    db
      .select({ id: schema.cashflowEvents.sourceExternalId })
      .from(schema.cashflowEvents)
      .all()
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string"),
  )

  let imported = 0
  let skipped = 0
  const startedAt = Date.now()
  for (const row of rows) {
    if (!row.id || existingExternalIds.has(row.id)) {
      skipped += 1
      continue
    }
    const isIncome = row.type === "收入"
    const kind = isIncome ? "income" : "expense"
    const categoryId = categoryIds.get(`${row.category}|${kind}`)
    if (!categoryId) throw new Error(`no category for ${row.category}|${kind} (row ${row.id})`)

    expectOk(
      await api.createCashflowEvent({
        eventDate: row.time.slice(0, 10),
        occurredAt: row.time.replace(" ", "T"),
        title: row.note?.trim() || row.category,
        amount: Number(row.amount).toFixed(2),
        currency: row.currency || "CNY",
        direction: isIncome ? "in" : "out",
        flowKind: kind,
        categoryId,
        sourceKind: "import",
        sourceName: "钱迹",
        sourceExternalId: row.id,
        accountHint: row.account1?.trim() || null,
        includeInAnalytics: true,
        classificationSource: "imported",
      }),
    )
    imported += 1
    if (imported % 1000 === 0) {
      console.log(
        `imported ${imported}/${rows.length} (${Math.round((Date.now() - startedAt) / 1000)}s)`,
      )
    }
  }

  const totals = client
    .prepare(
      `SELECT direction, COUNT(*) AS n, ROUND(SUM(amount), 2) AS total
       FROM cashflow_events WHERE source_name = '钱迹' GROUP BY direction`,
    )
    .all()

  console.log(
    `done: imported=${imported} skipped=${skipped} in ${Math.round((Date.now() - startedAt) / 1000)}s`,
  )
  for (const row of totals as Array<{ direction: string; n: number; total: number }>) {
    console.log(`  ${row.direction}: ${row.n} rows, total ${row.total}`)
  }
  client.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
