## What and why

<!-- The problem being solved, and the approach taken. Link the issue this closes. -->

Closes #

## How it was verified

<!--
Paste the commands you ran and what you observed. Delete lines that do not apply.
-->

- [ ] `pnpm check-types`
- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm check-architecture`
- [ ] `pnpm check-docs`
- [ ] `pnpm test`
- [ ] `pnpm package:app` (desktop changes only)

## Checklist

- [ ] The change respects the product model (no asset balances inferred from statement lines,
      plans stay forecasts, liabilities come from snapshots).
- [ ] Renderer changes reach data only through `window.bubo`; SQLite stays in the sidecar.
- [ ] Both visual styles (`bubo` / `lumno`) still render — screenshots for UI changes.
- [ ] Module docs under `docs/modules/` updated; ADR added for durable decisions.
- [ ] No personal data, ledger exports, scans, or API keys in the diff.
