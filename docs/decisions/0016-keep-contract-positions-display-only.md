# 0016. Keep Contract Positions As A Display-Only Derivatives Layer

- Status: Accepted
- Date: 2026-09-22

## Context

The third investment increment adds leveraged futures/perpetual tracking: a `contract_positions` table, five facade methods, and a contracts tab inside the investments page. Unlike spot holdings, a contract is direction on an underlying rather than a holding, and the money at risk is the posted margin. The asymmetric model allows three routes: materialize positions into `asset_snapshots` like spot holdings (ADR 0015), sum contract P&L into net worth at read time, or keep contracts as a pure display layer where only a user-recorded margin balance can reach net worth.

## Decision

- Contract rows never materialize and never feed net worth. The investments page reads `contract_positions` directly; a margin balance becomes real money only when the user records it as an asset snapshot on the assets page.
- P&L is always derived, never stored: `unrealizedPnl = (mark − entry) × quantity × direction` for open rows, `(exit − entry) × quantity × direction` for closes, and `−effectiveMargin` for liquidations. No `unrealized_pnl` column exists to drift.
- Without a mark price an open row is valued at its entry price, reporting zero P&L, mirroring the spot quote fallback so an unpriced contract never invents gains.
- `effectiveMargin` is the recorded `margin_amount`, or `notional / leverage` as the display estimate; unrealized percent is measured against the margin, not the notional.
- Closing records an outcome: `closed` requires an exit price, `liquidated` optionally records the final mark and realizes the full posted margin as a loss.
- Leverage is stored as `leverage_bps` (×10000) and validated inside the 1x–125x band; `margin_mode` distinguishes isolated vs cross for display only.

## Rationale

Materializing contracts (the rejected alternative) would push speculative P&L into net worth and break the past/present/future separation the model is built on: unrealized contract P&L is a forecast on a belief, not an observed balance. Storing an unrealized P&L column (also rejected) would duplicate the derivation that mark updates already recompute, and the spot layer demonstrates derived state stays testable without storage. Display-only contracts keep one net-worth authority per account: the user's own snapshot.

## Consequences

- The contracts tab shows notional, margin, and P&L with explicit hints that nothing reaches net worth until a margin snapshot is recorded; there is no automatic materialization hook in this increment.
- Contract rows carry no `asset_item_id`, so account linking, currency-matching rules, and cost-basis snapshots from ADR 0015 do not apply; the row's `currency` is free-standing (defaults to USD).
- Deleting a contract never touches cashflow, snapshots, or quotes; the confirm copy tells the user to settle the margin balance manually.
- A future increment that wants automated margin accounting or funding fees must supersede this decision instead of extending it silently.
