# 0015. Route Investment Market Value Through Materialized System Snapshots

- Status: Accepted
- Date: 2026-09-22

## Context

The second investment increment adds a real holdings domain: `investment_positions`, `investment_transactions`, and `price_quotes`. Positions track quantity, weighted-average cost, and realized P&L; manual quotes price them; net worth must keep exactly one authority per account so the finance layers cannot double count the same money.

Two candidate routes were on the table: materialize each linked account's open market value into `asset_snapshots` with `sourceKind: "system"`, or sum the investment layer inside `getNetWorthSnapshot()` the way outstanding loan principal is added. The plan also floated a `PriceProvider` interface mirroring the FX provider.

## Decision

- Investment market value reaches net worth only through materialized `asset_snapshots` rows. `materializeAccountValue()` rewrites one `system` snapshot per linked account per day after every position, trade, or quote change, and net worth keeps reading snapshots alone.
- A manual snapshot taken the same day keeps winning: it carries an ISO timestamp that sorts after the date-only `system` key, and the materialized row updates in place instead of accumulating.
- Position state is always the replay of the trade history (`replayTrades`). Positions persist the derived quantity, average cost, cost basis, and realized P&L for reads; no other workflow may write those columns, and quotes never rewrite position rows.
- Quotes are manual only. Pricing is an explicit user action (`recordPriceQuote`), and no provider interface is defined in this increment. Quotes estimate value; they never create cashflow or mutate positions.
- Positions without a linked account (`asset_item_id` is null) stay display-only and never reach net worth.

## Rationale

Materialized snapshots keep the asymmetric model intact and preserve a single read path: net worth, asset totals, the assets page, and the investment page all derive from the same snapshot rows, including the recorded cost basis. Summing the investment layer into net worth (the rejected alternative) would create a second aggregation path that can drift from snapshots and double count whenever a user also records a manual balance. Manual-only quotes (rejected: a `PriceProvider` seam now) keep this increment small and fully testable; adding an exchange-backed provider later is additive and can supersede this decision.

## Consequences

- Investment market value becomes visible in the assets surface as a `system` snapshot, while a same-day manual balance stays authoritative over it.
- Recording positions, trades, or quotes on an account whose manual snapshot is current does not move net worth until the user updates the manual balance; this is the documented user-first balance trade-off.
- Deleting the last open position, or unlinking or archiving the account, removes the materialized `system` snapshot so nothing lingers in net worth.
- Cross-currency holdings convert through cached FX rates at read time like the rest of FX-aware aggregation, and positions must match their account currency.
- [ADR 0014](0014-display-asset-pnl-from-cost-basis.md) stays valid for account-level display-only P&L on manual snapshots; this decision covers the holdings domain and keeps its single-source rule.
- Adopting a quote provider later requires a new decision; this one deliberately stops at manual quotes.
