# Database Package

## Responsibility

`packages/db` owns the SQLite schema, Drizzle migrations, and the typed database
handle used by the Tauri Node sidecar, CLI, and API package.

## Key Files

- `packages/db/src/index.ts` - database exports and typed handle.
- `packages/db/src/schema/index.ts` - canonical Drizzle schema.
- `packages/db/migrations/` - generated SQLite migrations and Drizzle metadata.
- `packages/db/drizzle.config.ts` - Drizzle migration configuration.

## Schema Areas

- Ledger metadata and settings tables describe the database itself.
- `cashflow_events` describes past cashflow, including rows materialized from
  agent-assisted imports. Import source metadata should live on imported
  cashflow records so the app can deduplicate by source.
- `asset_snapshots` describes present assets and liabilities.
- `investment_positions`, `investment_transactions`, and `price_quotes` describe the
  investment layer: trade-replayed holdings, their buy/sell history, and manual
  quotes. Materialized `system` asset snapshots stay the only path into net worth
  (see [ADR 0015](../../decisions/0015-route-investment-value-through-system-snapshots.md)).
- `contract_positions` describes leveraged futures/perpetual rows. It is display-only:
  contract P&L is derived from mark/exit prices at read time and never materialized
  into snapshots or cashflow
  (see [ADR 0016](../../decisions/0016-keep-contract-positions-display-only.md)).
- `cards` and `card_images` describe the physical cards a person holds: bank, type
  (debit/credit/prepaid/virtual), brand, last four digits, credit limit, billing and
  repayment days, expiry, and a display colour. A card is identity data — it never
  changes net worth. Scans are one row per face (`front` / `back`, unique per card) and
  store only a generated file name under the sidecar's `card-images` folder, never bytes
  (see [ADR 0026](../../decisions/0026-cards-are-identity-not-balances.md)).
- Budgets, categories, subscriptions, and loans support planning and review workflows.
- Subscription forecasts are derived from `subscriptions` at read time and are not persisted.
  `subscription_occurrences` remains temporarily in the schema only as an ignored compatibility
  table for existing ledgers. Loan occurrence rows remain forecast artifacts; passing a due date may
  change date-derived presentation, but it does not create an actual event in `cashflow_events`.

## Data Flow

The private Tauri Node sidecar opens the active SQLite file, runs migrations,
and passes the typed database handle into `@bubo/api` behind narrow Rust
commands. Product code queries exported schema objects through Drizzle.

## Interfaces

- Exported schema tables and types from `@bubo/db`.
- Migration files consumed during desktop startup and tests.

## Watchouts

- Schema changes must preserve the asymmetric layer boundaries: cashflow, asset snapshots, and future obligations are not one reconciled ledger.
- Migration files are generated artifacts but still user-data critical. Review them before shipping.
- Do not bypass the typed database handle from product code.
- Agent-assisted import commands in `@bubo/cli` should use migrations, Drizzle
  schema objects, and the API facade instead of ad hoc direct SQL writes.
- Imported cashflow is deduplicated by source metadata on `cashflow_events`; do
  not recreate a separate evidence layer for routine agent-imported transactions.
- Handwritten database TypeScript files carry AI headers. Generated SQL/JSON migration artifacts are not part of file-header enforcement.
