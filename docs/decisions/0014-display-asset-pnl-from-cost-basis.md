# 0014. Display Investment P&L From Manual Cost Basis

- Status: Accepted
- Date: 2026-09-22

## Context

The first investment-tracking increment exposes stock/fund/crypto holdings without adding new tables: `asset_snapshots` already stores `quantity_amount`, `quantity_unit`, `cost_basis_amount`, and `cost_basis_currency`, and the repository already writes cost basis from the shared add/upsert snapshot inputs. The missing pieces were the contract surface and the renderer: `AssetSnapshotSummary` buried the cost basis inside `meta`, so no page could compute an unrealized result.

## Decision

- Promote `costBasisAmount` / `costBasisCurrency` to top-level `AssetSnapshotSummary` fields; the SQLite row mapper reads the snapshot columns directly instead of hiding them in `meta`.
- The asset form shows optional 数量 / 成本基础 inputs for investment-class types only (`brokerage`, `investment`, `fund`, `stock`, `crypto`), stored through the existing snapshot columns.
- The renderer derives 未实现盈亏 (`valueAmount − costBasisAmount`) and its return rate display-only through `apps/desktop/src/renderer/src/assets/assetPnl.ts`; net worth keeps using `valueAmount` alone.

## Rationale

Investment market value already enters net worth through the snapshot's `valueAmount`, so a single source is preserved by never adding P&L on top. Rejected alternatives: writing P&L into snapshot rows or net worth (double counting, stale derived data), and building the separate investment table in this increment (the heavier full-plane change stays in the later investment phases).

## Consequences

- Accounts without a cost basis (most cash/bank/real-estate rows) simply render no P&L row.
- Cross-currency cost bases are skipped by the display helper; conversion remains in the FX-aware API layer.
- Resetting a balance refreshes `valueAmount` while keeping the recorded cost basis, so P&L keeps comparing against the original cost.
- The asset form writes `valuationMethod: manual_market_value` for investment-class types and `manual_balance` otherwise.
- Later investment phases (holdings/trades, quote providers) must keep this single-source rule or supersede this decision.
