# 0013. Rename The Product Brand And Identifiers To bubo

- Status: Accepted
- Date: 2026-09-22

## Context

This repository is a personal fork being customized into a new product, bubo. Upstream flowm branding, package scope, sidecar names, environment variables, and data-file names leaked through every layer: workspace packages (`@flowm/*`), the Tauri crate, the bundled sidecar, the CLI, docs, and fixtures. Leaving them in place would keep the fork coupled to the upstream identity and confuse agents and future contributors about which names are load-bearing.

## Decision

Rename the product brand and all technical identifiers from flowm to bubo in one workspace-wide migration:

- Workspace packages: `@flowm/*` to `@bubo/*`, including the pnpm lockfile, rebuilt via `pnpm install`.
- Tauri: `productName` and window title `bubo`, identifier `com.chaordex.bubo`, crate `bubo`, lib `bubo_lib`, sidecar binary `bubo-sidecar`, env `BUBO_SIDECAR_*`.
- Ledger files: `bubo.sqlite3` and the bundled demo fixture `bubo-demo.sqlite3`.
- CLI: `bubo-cli`; the npm scope stays `@barrysongdev4real` until the owner publishes under their own scope.
- API facade: `BuboApi`, `BuboId`, `createBuboApi`, and the shared contract file `bubo-primitives.contract.ts`.
- Docs, ADRs, plans, skills, and renamed artifacts (`bubo Design System.html`, `bubo Redesign.html`, `skills/bubo-ledger-kit`).

The updater `plugins.updater.endpoints` entry pointing at the upstream GitHub release feed was removed rather than renamed, because no bubo release repository exists yet.

## Rationale

One mechanical, case-sensitive mapping (`flowm`/`Flowm`/`FlowM`/`FLOWM` to `bubo`/`Bubo`/`bubo`/`BUBO`) kept every layer consistent in a single pass and avoided long-lived mixed naming. Rejected alternatives: renaming only user-visible strings (leaves upstream coupling and confusing identifiers), and renaming files without updating their references (breaks imports and bundling).

## Consequences

- Data directory and file names changed (`~/Library/Application Support/com.chaordex.bubo/bubo.sqlite3`); pre-rename ledger data under `com.flowm.desktop/flowm.sqlite3` must be copied and renamed manually.
- Automatic updates stay inert until a bubo release repository is configured and its `endpoints` entry is restored.
- `FlowMock.tsx` was renamed to `ImportsMock.tsx`: its "Flow"+"Mock" name collided with case-insensitive `flowm` scans without being branding.
- npm scope and GitHub owner still reference the upstream author; release automation resolves the repository dynamically through `$GITHUB_REPOSITORY`.
