# CLI Package

## Responsibility

`packages/cli` owns the workspace command line interface that agents and
developers use to inspect bubo ledgers and submit guarded business patches.

## Key Files

- `packages/cli/src/index.ts` - Commander.js command surface for ledger
  inspection and patch application.
- `packages/cli/scripts/build.mjs` - npm packaging build: bundles workspace
  bubo code, copies DB migrations, and writes a sanitized publish directory.
- `packages/cli/package.json` - package scripts, workspace dependencies, and
  CLI package metadata.
- `packages/cli/npm/` - generated publish directory for
  `@barrysongdev4real/bubo-cli`; do not
  edit by hand.

## Data Flow

Agent or developer -> `pnpm bubo-cli` -> `@barrysongdev4real/bubo-cli` ->
`@bubo/api` -> `@bubo/db` -> SQLite.

The CLI opens the selected SQLite file, runs migrations, creates the bubo API
facade, and delegates all business behavior to the API layer.

## npm Distribution

`@barrysongdev4real/bubo-cli` is published from the generated
`packages/cli/npm` directory, not directly from the workspace package root. The
build bundles the local `@bubo/api`, `@bubo/db`, and `@bubo/shared` source
into `dist/index.mjs`, copies `packages/db/migrations` into `dist/migrations`,
and keeps `better-sqlite3`, `commander`, and `drizzle-orm` as normal npm
runtime dependencies.

The workspace command runs through `tsx` on Node 22, matching the desktop
sidecar's `better-sqlite3` ABI. The npm package installs its own native module
for the user's supported Node runtime and can run as
`npx @barrysongdev4real/bubo-cli ...` or through the installed `bubo-cli`
binary.

## Interfaces

- `pnpm bubo-cli ledger-info [--db path]`
- `pnpm bubo-cli list-categories [--db path]`
- `pnpm bubo-cli list-assets [--db path] [--type type] [--active-only]`
- `pnpm bubo-cli get-asset <id> [--db path]`
- `pnpm bubo-cli create-asset --name name --type type [--commit] [--db path]`
- `pnpm bubo-cli update-asset <id> [fields...] [--commit] [--db path]`
- `pnpm bubo-cli archive-asset <id> [--commit] [--db path]`
- `pnpm bubo-cli list-asset-snapshots [--asset-id id] [--latest-only] [--db path]`
- `pnpm bubo-cli get-asset-snapshot <id> [--db path]`
- `pnpm bubo-cli add-asset-snapshot --asset-id id --value amount [--commit] [--db path]`
- `pnpm bubo-cli update-asset-snapshot <id> [fields...] [--commit] [--db path]`
- `pnpm bubo-cli delete-asset-snapshot <id> [--commit] [--db path]`
- `pnpm bubo-cli net-worth [--currency code] [--db path]`
- `pnpm bubo-cli asset-change <asset-id> [--comparison previous|30d|90d|1y] [--db path]`
- `pnpm bubo-cli list-subscriptions [--status status] [--db path]`
- `pnpm bubo-cli get-subscription <id> [--db path]`
- `pnpm bubo-cli create-subscription --name name --amount amount --billing-cycle monthly --next-charge-date date [--commit] [--db path]`
- `pnpm bubo-cli update-subscription <id> [fields...] [--clear-category] [--commit] [--db path]`
- `pnpm bubo-cli archive-subscription <id> [--commit] [--db path]`
- `pnpm bubo-cli list-subscription-occurrences [--subscription-id id] [--date-from date] [--date-to date] [--db path]`
- `pnpm bubo-cli list-loans [--status status] [--db path]`
- `pnpm bubo-cli get-loan <id> [--db path]`
- `pnpm bubo-cli create-loan --name name --payment-amount amount --start-date date [--commit] [--db path]`
- `pnpm bubo-cli update-loan <id> [fields...] [--commit] [--db path]`
- `pnpm bubo-cli archive-loan <id> [--commit] [--db path]`
- `pnpm bubo-cli list-loan-occurrences [--loan-id id] [--date-from date] [--date-to date] [--db path]`
- `pnpm bubo-cli generate-loan-occurrences --through-date date [--loan-id id] [--commit] [--db path]`
- `pnpm bubo-cli future-pressure [--date-from date] [--date-to date] [--db path]`
- `pnpm bubo-cli list-budget-sets [--db path]`
- `pnpm bubo-cli create-budget-set --name name [--commit] [--db path]`
- `pnpm bubo-cli list-budget-periods [--budget-set-id id] [--status status] [--db path]`
- `pnpm bubo-cli create-budget-period --budget-set-id id --start date --end date [--kind monthly|weekly|yearly|custom] [--commit] [--db path]`
- `pnpm bubo-cli list-budget-items [--budget-period-id id] [--db path]`
- `pnpm bubo-cli create-budget-item --budget-period-id id --name name --amount amount [--category-id id] [--commit] [--db path]`
- `pnpm bubo-cli update-budget-item <id> [fields...] [--category-id id] [--clear-scopes] [--commit] [--db path]`
- `pnpm bubo-cli archive-budget-item <id> [--commit] [--db path]`
- `pnpm bubo-cli budget-progress --budget-period-id id [--db path]`
- `pnpm bubo-cli list-cashflow [--db path] [--source name] [--source-external-id id] [--limit n]`
- `pnpm bubo-cli list-linked-cashflow --owner-type subscription|loan --owner-id id [--db path]`
- `pnpm bubo-cli bind-cashflow --owner-type subscription|loan --owner-id id --event-id id [--event-id id...] [--note text] [--commit] [--db path]`
- `pnpm bubo-cli unbind-cashflow <link-id> [--commit] [--db path]`
- `pnpm bubo-cli apply-patch <patch.json|-> [--db path] [--dry-run|--commit]`

The `apply-patch` command defaults to `--dry-run`. It writes only when callers
pass `--commit`.

Asset write commands also default to dry-run and write only when callers pass
`--commit`. Asset item deletion is intentionally exposed as archive, while
asset snapshot deletion removes a single present-state snapshot record.

Budget write commands also default to dry-run and write only when callers pass
`--commit`. Budget scopes can be bound with repeatable `--category-id` flags or
lower-level repeatable `--scope kind:value` flags. `budget-progress` summarizes
past active expense cashflow inside the selected period; it does not materialize
planned spend or future obligations.

Subscription and loan write commands also default to dry-run and write only when callers pass
`--commit`. Subscription commands maintain plans; `list-subscription-occurrences` projects the
requested date window at read time and never writes rows. Loan commands continue to maintain their
amortization forecast occurrences. Neither workflow creates actual cashflow events, asset snapshots,
or net-worth liabilities.

Cashflow-binding commands record which real cashflow events back a subscription
or loan as its deductions, stored as `object_links`. `bind-cashflow` accepts
repeatable `--event-id` and is idempotent (existing links are skipped);
`unbind-cashflow` removes one link by id. Both default to dry-run and write only
with `--commit`. Bindings are explanatory only and never change the forecast plan
or its statistics.

After a successful `--commit`, the CLI sends a best-effort local
`ledger.changed` event to the desktop app's IPC socket. If the app is closed, or
the socket is unavailable, the CLI still succeeds and preserves machine-readable
JSON stdout. Set `BUBO_CLI_DEBUG_IPC=1` to see skipped notification diagnostics
on stderr.

Agents that need machine-parseable stdout should call `pnpm --silent bubo-cli
...` so pnpm does not add lifecycle output around the CLI's JSON payload.

Supported patch operations currently include `category.ensure`,
`cashflow.create`, and `cashflow.classify`. Use `cashflow.classify` to update an
existing transaction's category by cashflow `id` or by `sourceName` plus
`sourceExternalId`. Category operations are guarded by the API: a patch cannot
assign an income cashflow to an expense category, or an expense cashflow to an
income category.

## Ledger Resolution

The CLI resolves a ledger path in this order:

1. `--db`
2. `BUBO_DB_PATH`
3. `BUBO_USER_DATA_DIR`
4. The platform's default bubo app data directory
5. The active ledger in `bubo-ledgers.json`
6. `bubo.sqlite3` under the resolved app data directory

## Watchouts

- Do not expose arbitrary SQL or table-level CRUD from this package.
- Keep write workflows behind `@bubo/api.applyAgentLedgerPatch` or another
  guarded business API.
- Asset commands must call the guarded `@bubo/api` asset facade. Do not add raw
  SQLite asset mutation commands.
- Keep imported statement parsing outside durable product code. Agents normalize
  source files into patch operations before calling this CLI.
- Keep the CLI and bundled desktop sidecar on Node 22's ABI when rebuilding
  `better-sqlite3`.
- Keep npm publish output generated. If package metadata changes, update
  `packages/cli/scripts/build.mjs` and verify with
  `pnpm -F @barrysongdev4real/bubo-cli pack:dry`.
- CLI output should remain JSON by default so agents can parse it reliably.
