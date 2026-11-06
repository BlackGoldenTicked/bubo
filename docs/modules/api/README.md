# API Package

## Responsibility

`packages/api` is the product facade used by the Tauri Node sidecar and CLI. It
translates renderer-facing operations into domain-shaped
results through use cases, domain rules, infrastructure repositories, and
presentation mappers.

## Key Files

- `packages/api/src/index.ts` - public API entry point.
- `packages/api/src/shared/api-helpers.ts` - shared Result, ID, date, currency, and SQL helper primitives.
- `packages/api/src/infrastructure/db/sqlite-api-base.ts` - shared SQLite-backed facade base class and cross-domain query helpers.
- `packages/api/src/use-cases/` - facade-compatible use-case wrappers for reference data, imports, cashflow, assets, subscriptions, loans, budgets, links, and dashboard workflows. These files must not import Drizzle, `@bubo/db`, or access `this.db` directly.
- `packages/api/src/infrastructure/db/repositories/*-api.repository.ts` - Drizzle-backed persistence implementations that support the facade-compatible use-case wrappers.
- `packages/api/src/sqlite/` - transitional compatibility re-exports for old internal import paths.
- `packages/api/src/use-cases/agent-ledger/agent-ledger-api.ts` - guarded agent ledger patch facade.
- `packages/api/src/infrastructure/db/repositories/agent-ledger-api.repository.ts` - rule-checked agent patch persistence.
- `packages/api/src/use-cases/voice/voice-intent-api.ts` - system-wide voice intent pipeline: transcript, pooled reasoning, and a typed intent array (one element per record, capped at 20).
- `packages/api/src/use-cases/voice/voice-transcribe-api.ts` - ASR-only stage so the renderer can log recognition and reasoning separately.
- `packages/api/src/domain/voice/voice-intent-rules.ts` - frozen cacheable system prompt (domain taxonomy, per-record dates with date-line inheritance, cross-domain batches), per-domain normalization, and the batch parser (`normalizeVoiceIntents`).
- `packages/api/src/domain/voice/voice-entry-rules.ts` - cashflow draft normalization, plus `CATEGORY_KEYWORD_HINTS` / `matchCategoryByKeywords` (product-word → ledger category fallback guarded on the category name).
- `packages/api/src/domain/voice/llm-pool-rules.ts` - pure Bailian free-tier pool ordering and attempt-chain rules.
- `packages/api/src/infrastructure/ai/bailian-asr-client.ts` - Bailian (DashScope) ASR client over the OpenAI-compatible endpoint.
- `packages/api/src/infrastructure/ai/llm-entry-client.ts` - OpenAI-compatible JSON completion client shared by pool models and DeepSeek.
- `packages/api/tests/voice-entry-rules.test.ts` - unit tests for amount, category, and date normalization.
- `packages/api/tests/voice-intent-rules.test.ts` - unit tests for domain routing, id safety, and prompt-cache stability.
- `packages/api/tests/llm-pool-rules.test.ts` - unit tests for pool expiry filtering, ordering, and fallback chain.
- `packages/api/src/domain/assets/asset-rules.ts` - pure asset normalization rules.
- `packages/api/src/domain/investments/investment-rules.ts` - pure trade replay, weighted-average cost, and P&L rules.
- `packages/api/src/domain/investments/contract-rules.ts` - pure leveraged-contract parsing, leverage bounds, and derived P&L rules.
- `packages/api/src/use-cases/assets/assets-api.ts` - present asset facade methods backed by asset use cases and repositories.
- `packages/api/src/use-cases/assets/upsert-asset-snapshot.ts` - multi-step asset snapshot upsert workflow.
- `packages/api/src/use-cases/investments/investments-api.ts` - investment facade methods backed by the investments repository.
- `packages/api/src/infrastructure/db/repositories/assets.repository.ts` - Drizzle-backed asset item and snapshot persistence.
- `packages/api/src/infrastructure/db/repositories/investments.repository.ts` - Drizzle-backed position, trade, and quote persistence.
- `packages/api/src/infrastructure/db/repositories/investments-api.repository.ts` - investment facade implementation, including system snapshot materialization for linked accounts.
- `packages/api/src/infrastructure/db/repositories/contracts-api.repository.ts` - contract-position facade implementation over `contract_positions`; P&L stays derived display math.
- `packages/api/src/presentation/mappers/sqlite-row-mappers.ts` - SQLite row to renderer contract mappers.
- `packages/api/src/default-seed.ts` - default categories and lightweight personal starter data.
- `packages/api/src/demo-seed.ts` - full deterministic demo ledger data.
- `packages/api/tests/api.test.ts` - integration tests for the facade against SQLite.
- `packages/api/tests/investments.test.ts` - integration tests for positions, trades, quotes, and net-worth materialization.
- `packages/api/tests/contracts.test.ts` - integration tests for contract-position CRUD and close/liquidate outcomes.
- `packages/api/tests/contract-rules.test.ts` - unit tests for contract parsing, leverage bounds, and derived P&L.

## Use-Case Map

- `assets/assets-api.ts` - asset item archive/restore, asset snapshot CRUD,
  net worth inputs, and asset detail data.
- `budgets/budgets-api.ts` - budget definitions, category/source/tag scopes, budget-related cashflow summaries, and confirmed monthly budget rollover.
- `cashflow/cashflow-api.ts` - past cashflow event queries, mutations, and monthly income/expense/net trend summaries.
- `dashboard/dashboard-api.ts` - cross-layer dashboard composition without requiring reconciliation.
- `imports/imports-api.ts` - legacy imported statement records and transaction review
  surfaces while direct agent-assisted cashflow import is introduced.
- `investments/investments-api.ts` - trade-driven investment positions, manual price
  quotes, and materialized account market value for net worth.
- `agent-ledger/agent-ledger-api.ts` - business-level patch operations for AI
  agents, including category ensure, cashflow creation, and cashflow
  classification.
- `voice/voice-intent-api.ts` - turns one recorded utterance into a typed intent
  for cashflow, asset, investment, subscription, or loan through pooled ASR and
  reasoning, then DeepSeek as the floor. It never persists anything; each page
  saves through its own mutation after the user confirms the prefilled form.
- `links/links-api.ts` - relationships between imported records and explanatory domain objects.
- `loans/loans-api.ts` - loan plans and projected payment occurrences; elapsed
  dates do not materialize cashflow.
- `reference/reference-api.ts` - reference/category/tag data, currency settings (display/base currency), and foreign-exchange rates. `getCurrentRates` returns the latest per-currency rate to the base currency; `refreshExchangeRates` fetches and caches rates (via the FX provider) for the currencies actually held across assets, subscriptions, and loans.
- `subscriptions/subscriptions-api.ts` - subscription plans plus compatibility reads that project
  requested date windows without storing occurrence rows.

## Data Flow

The shared desktop tRPC router calls this package with a typed `Database` handle
from `@bubo/db`. Tauri hosts the router and facade in its private bundled Node
sidecar. Public facade methods keep the
existing tRPC-facing API stable while use-case wrappers delegate persistence to
`infrastructure/db/repositories/`, pure rules live in `domain/`, and row-to-
contract conversion lives in `presentation/mappers/`.

## Interfaces

The package exports the facade consumed by `apps/desktop/src/main/trpc/router.ts`. Browser-safe asset contracts are owned by `@bubo/shared/contracts` and re-exported from `@bubo/api` for compatibility while renderer imports migrate to the shared contract layer.

Cashflow analysis surfaces use `getMonthlyCashflowTrend` for monthly income,
expense, and net cashflow rows. The trend summarizes past active analytics
cashflow only; it does not infer asset balances or materialize future plans.

Budget progress summarizes past active analytics expense cashflow for the budget
period. Multiple scope values of the same kind are ORed together, while
different scope kinds are ANDed together; a budget with no explicit scopes is
treated as an overall expense budget.

Budget rollover is explicit. `getBudgetRolloverSuggestion` is a read-only check
for “current month has no budget but a previous monthly plan exists.”
`createBudgetPeriodFromLatest` runs only after user confirmation and copies the
latest monthly budget period's active items and scopes into the target month.

## Seed Data

`default-seed.ts` owns the editable starter data for non-demo personal ledgers: default categories, one current budget period, five starter budget items, two asset examples with manual snapshots, two subscription plans, and two loan plans. It intentionally does not create cashflow events or imported statements.

`demo-seed.ts` owns the larger packaged sample ledger used by `bubo-demo.sqlite3`,
including trade-driven investment positions with manual quotes whose open market
value stays in the same ballpark as the linked account's manual snapshot, plus a
small set of open/closed/liquidated contract positions that stay outside net worth.

The personal starter seed should be idempotent and conservative. It should only run for new non-demo ledgers and must use the public bubo API facade for domain objects instead of inserting cross-domain starter rows directly. This keeps the seed aligned with validation, read-time subscription projection, loan occurrence generation, and the asymmetric finance model.

## Watchouts

- `packages/api/src/sqlite/` is compatibility glue only; new implementation code should use the layered folders directly.
- `pnpm check-architecture` enforces that `use-cases/` do not import Drizzle or `@bubo/db`, infrastructure does not import use cases, shared contracts stay browser-safe, and `sqlite/` remains compatibility glue.
- Do not infer asset balances from imports.
- Investment position state is the replay of its trade history: `replayTrades`
  derives quantity, average cost, cost basis, realized P&L, and open/closed status,
  while manual quotes only price positions and never rewrite position rows or create
  cashflow. Positions must use the linked account's default currency.
- Investment market value enters net worth only through materialized `system` asset
  snapshots (one per linked account per day); a same-day manual snapshot wins the
  latest-snapshot read by ISO-vs-date ordering. Positions without a linked account
  stay display-only. See [ADR 0015](../../decisions/0015-route-investment-value-through-system-snapshots.md).
- Contract positions are a display-only derivatives layer: rows carry no
  `asset_item_id`, never materialize snapshots, and P&L is derived from
  mark/exit prices at read time (`contract-rules.ts`). Deleting a contract
  touches nothing else; only a margin balance the user records as an asset
  snapshot reaches net worth. See
  [ADR 0016](../../decisions/0016-keep-contract-positions-display-only.md).
- Cross-currency aggregation (net worth, future pressure) converts each amount to the display currency at the latest cached rate via `convertAmount`; buckets without an available rate are dropped (net worth surfaces them as `missingFx`). Conversion never mutates stored amounts, and past cashflow is intentionally not converted.
- Asset item archive/restore must preserve snapshot history. Default asset
  snapshot and net worth queries use active accounts only; explicit archived
  queries are for history/recovery surfaces.
- Do not persist subscription schedule projections or materialize subscription/loan forecasts as
  actual cashflow. Loan
  progress is derived from elapsed due dates in the renderer, without changing
  occurrence status, stored principal, cashflow, links, or asset snapshots.
- Cashflow-to-obligation binding (`bindCashflowEvents` / `listLinkedCashflowEvents` / `unbindCashflowEvent`) records the deduction link in `object_links` (`fromType` `subscription`/`loan` → `toType` `cashflow_event`, `linkType` `confirmed_matches`). Binding is idempotent (existing owner/event pairs are skipped) and strictly explanatory: it must not change forecast pressure, net worth, or any cashflow aggregate.
- Keep platform-specific statement parsing outside durable product code when a
  local agent command can normalize the source into imported cashflow records.
- Agent write workflows should submit business-level patch operations, not raw
  SQLite table mutations.
- `pnpm bubo-cli apply-patch` is provided by `@bubo/cli` for agents; it calls
  the guarded API patch method rather than exposing SQLite.
- Cashflow writes validate category direction. Expense cashflow can only use
  expense categories, income cashflow can only use income categories, and agent
  classification infers the expected category kind from the target event.
- Keep personal starter seed small and editable; larger explanatory datasets belong in the demo ledger.
- Starter assets are examples with manual snapshots; starter subscriptions and loans are future plans. Do not convert them into cashflow or liability snapshots.
- Keep demo seed and personal starter seed separate. Demo data can be broad and explanatory; personal starter data should feel like the user's own editable first ledger.
- Prefer Drizzle expressions. Raw SQL strings and `db.$client` are outside the product boundary.
- Handwritten API and test files carry AI headers; update them when the file's responsibility or boundary changes.
