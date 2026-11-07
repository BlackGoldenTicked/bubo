# bubo Desktop - Agent Guide

**What:** bubo Desktop is a Tauri app for asymmetric personal finance tracking.
**Architecture:** Tauri + React renderer + narrow Rust commands + bundled Node/tRPC sidecar + Drizzle/SQLite. Run commands from [docs/run.md](docs/run.md).

## Product Model

bubo is not a traditional double-entry ledger. It keeps three independent layers:

1. Past cashflow: how much was spent and earned.
2. Present assets: how much money and value exists now.
3. Future obligations: what will likely be paid later through subscriptions, loans, and plans.

Imported statements, asset snapshots, and future plans may inform each other in the UI, but they do not have to reconcile into one balanced book.

## Red Lines

- Keep the asymmetric model intact; do not infer asset balances from imported statement lines. See [docs/topics/asymmetric-finance-model.md](docs/topics/asymmetric-finance-model.md).
- Subscription and loan plans are forecasts. Do not turn them into actual expenses or asset-liability changes unless a feature explicitly asks for that workflow.
- Liabilities in net worth come from liability asset snapshots, not from loan plans.
- Preserve Tauri boundaries: renderer code reaches app data only through the `window.bubo` adapter and narrow Rust commands; only the private sidecar owns SQLite. See [docs/topics/tauri-sidecar-trpc.md](docs/topics/tauri-sidecar-trpc.md).
- Access SQLite through Drizzle against `@bubo/db` schema. Do not write raw SQL strings or reach through `db.$client`; use `sql\`...\`` only for expressions Drizzle cannot express.
- Keep `better-sqlite3` on the Node 22 ABI used by the bundled sidecar and workspace tests. See [docs/topics/tauri-node-sidecar.md](docs/topics/tauri-node-sidecar.md).

## Mandatory Plane Workflow

Every feature, fix, and refactor must be associated with a work item in the Plane `bubo` project. Plane is a prerequisite before coding and a hard delivery gate, not an optional closing step.

### Before Implementation

1. If the user provides a Plane number, read the work item description and every comment first. If no number is provided, search for a related work item; create one automatically when none exists, with a clear scope and acceptance criteria.
2. Move the work item to `In Progress` and leave a kickoff comment describing the scope and implementation direction.
3. Add the Plane number to the agent's working plan as a development and delivery checklist item. Do not start coding without a Plane number.

### During Development

1. Record additional user feedback for the same feature on the original work item.
2. Add a comment when the requirement scope or implementation direction changes materially. Do not spam comments for ordinary, small implementation adjustments.

### At Delivery

1. Complete type checking, tests, any required browser acceptance checks and screenshots, then create a conventional commit.
2. The final Plane comment must include:
   - The commit hash.
   - Type-check and test results.
   - A specific frontend acceptance URL.
   - A specific backend acceptance URL.
   - A UI screenshot that renders inline in the Plane comment.
   - Any known environment noise or baseline failures unrelated to the change.

## Workflow

1. Read the relevant module doc in [docs/modules/](docs/modules/) plus any linked topic docs and file headers.
2. For broad or risky work, write a plan in [docs/plans/](docs/plans/) before changing code.
3. Change code according to [docs/conventions.md](docs/conventions.md), keeping edits scoped.
4. Sync nearby docs: file headers for changed source files, the matching module doc, and an ADR in [docs/decisions/](docs/decisions/) for durable architecture decisions.
5. Run the smallest meaningful verification from [docs/testing.md](docs/testing.md), then broaden to `pnpm check-types`, `pnpm test`, and `pnpm build` when feasible.
6. Run `pnpm check-docs` or `node scripts/check-docs.mjs` before finishing and clear hard failures.

## App Build Gate

Development is not complete until the desktop app itself is built. A green `pnpm build` only
produces dist assets, not a runnable app, so every change that ships to the app ends with a
bundle build — run it automatically, do not wait to be asked.

1. `pnpm package:app` builds the renderer, the Node sidecar, and the Rust shell, then writes
   `apps/desktop/src-tauri/target/release/bundle/macos/bubo.app`. It skips updater artifacts,
   so it needs no signing key — `pnpm package` is the release variant and fails without
   `TAURI_SIGNING_PRIVATE_KEY`.
2. `pnpm install:local [--open]` performs the same build and installs to
   `/Applications/bubo.app`; use it when the result must run outside the dev session.
3. `pnpm dev` stays the inner loop (it rebuilds the sidecar and hot-reloads the renderer).
   It is not a substitute for the bundle build.

Report the bundle path, the version from `apps/desktop/src-tauri/tauri.conf.json`, and the
build outcome in the final message. If the build fails, name the failing stage instead of
reporting the change as delivered.

Ratchet rule: when an agent mistake reveals a repeatable risk, add a test, lint rule, sensor, or ADR so the same mistake is harder next time.

## Navigation

- Product model: [docs/topics/asymmetric-finance-model.md](docs/topics/asymmetric-finance-model.md)
- Voice entry: [docs/topics/voice-entry.md](docs/topics/voice-entry.md)
- Card wallet: [docs/topics/cards.md](docs/topics/cards.md)
- Menu bar and quick capture: [docs/topics/menu-bar-capture.md](docs/topics/menu-bar-capture.md)
- Runtime and IPC: [docs/architecture.md](docs/architecture.md), [docs/topics/tauri-sidecar-trpc.md](docs/topics/tauri-sidecar-trpc.md)
- Native sidecar and ABI: [docs/topics/tauri-node-sidecar.md](docs/topics/tauri-node-sidecar.md)
- Modules: [desktop](docs/modules/desktop/), [api](docs/modules/api/), [db](docs/modules/db/), [shared](docs/modules/shared/), [ui](docs/modules/ui/), [hooks](docs/modules/hooks/)
- Design system: [docs/modules/ui/](docs/modules/ui/) (token contract and primitives)
- Runbook: [docs/run.md](docs/run.md)
- Conventions and terms: [docs/conventions.md](docs/conventions.md)
- Testing and validation: [docs/testing.md](docs/testing.md)
- Specs: [docs/specs/](docs/specs/)
- Plans: [docs/plans/](docs/plans/)
- Decisions: [docs/decisions/](docs/decisions/)
