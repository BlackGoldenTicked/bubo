# bubo Desktop

[![CI](https://github.com/BarrySong97/bubo-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/BarrySong97/bubo-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tauri 2](https://img.shields.io/badge/shell-Tauri%202-24c8db.svg)](https://tauri.app)

A local-first personal finance tracker that keeps **three layers separate**: what you already
spent, what you own now, and what you will probably pay later. Data lives in a single SQLite
file on your machine — no account, no sync, no telemetry.

<!--
Screenshots: add 2–3 images or a short GIF here (overview, cashflow, card wallet) and keep
them under docs/assets/. Everything below assumes the name "bubo"; the UI itself is Chinese.
-->

## Why not just another ledger

Double-entry bookkeeping forces every account to balance, which is the wrong shape for
personal money: an imported bank statement, a manually counted asset snapshot, and a
subscription forecast are three independent truths that should not have to reconcile.

bubo therefore keeps them apart:

| Layer              | Question it answers                  | Sources                                                |
| ------------------ | ------------------------------------ | ------------------------------------------------------ |
| Past cashflow      | How much was spent and earned?       | Imported statements, manual entries, voice capture     |
| Present assets     | How much money and value exists now? | Asset snapshots, holdings, contract positions          |
| Future obligations | What will likely be paid later?      | Subscriptions, loans, plans (forecasts, never actuals) |

The layers can inform each other in the UI. They never get collapsed into one balanced book,
and a forecast never silently becomes an actual.

## Features

- **Cashflow** — import bank/WeChat/Alipay statements (CSV/XLSX), categorize, tag, link
  related records, and roll up by week/month/quarter/year.
- **Assets & net worth** — asset snapshots per currency, holdings, leveraged contract
  positions, and a net-worth trend. Liabilities come from snapshots, not from loan plans.
- **Subscriptions & loans** — recurrence projections that stay forecast-shaped.
- **Card wallet** — bank/credit/prepaid cards with both faces scanned and stored locally
  (searchable bank picker, bank-grouped list). Only the last four digits are ever recorded.
- **Voice entry** — hold a shortcut, speak, and the app parses one or more records
  (cashflow / subscription / loan / asset / investment) and pre-fills the right form. Bring
  your own transcription and LLM provider keys.
- **Two visual styles** — `bubo` (compact, flat, mono headings) and `lumno` (soft, gradient),
  each with light and dark mode.
- **Menu bar capture** — a global shortcut opens a small always-on-top recorder.

## Download

Grab the latest build from [Releases](https://github.com/BarrySong97/bubo-desktop/releases):
macOS is distributed as an `.app`/`.dmg` (Apple Silicon, ad-hoc signed — right-click → Open
the first time), Windows as an NSIS installer.

The first launch creates the app-data directory with a **synthetic** demo ledger so the UI has
something to show. Real data you enter stays next to it.

## Your data

| What                  | Where (macOS)                                                  |
| --------------------- | -------------------------------------------------------------- |
| Ledger                | `~/Library/Application Support/com.chaordex.bubo/bubo.sqlite3` |
| Rolling snapshots (7) | same directory, `bubo.sqlite3.bak-*`                           |
| Card scans            | `…/com.chaordex.bubo/card-images/`                             |
| AI keys (optional)    | `…/com.chaordex.bubo/bubo-voice.json` (mode `0600`)            |

- Deleting the app does **not** delete this directory; deleting the directory does lose data.
- The `.bak-*` snapshots contain the database **only** — card scans are never backed up
  automatically. Back up the whole directory to keep them.
- The ledger is not encrypted at rest. Keys are stored in a `0600` file rather than the OS
  keychain (known limitation, see [SECURITY.md](./SECURITY.md)).
- No telemetry, no analytics, no account. Network is only used for the AI provider you
  configure and the update check; fonts and styles are bundled, not fetched from a CDN.

## Architecture

```text
React renderer ──► window.bubo adapter ──► narrow Rust commands (Tauri v2)
                                              │ NDJSON over stdio
                                              ▼
                                    private Node 22 sidecar
                                    (tRPC + @bubo/api + @bubo/db)
                                              │ the only SQLite handle
                                              ▼
                                        SQLite (+ card-images/)
```

- Desktop shell: Tauri v2 (Rust) with a bundled Node 22 sidecar.
- Renderer: React 19, TanStack Router/Query, Jotai, Tailwind v4, HeroUI, plus hand-drawn
  primitives in `packages/ui`.
- Business layer: TypeScript packages (`api`, `db`, `shared`, `ui`, `cli`).
- Mobile: a Flutter shell under `apps/mobile` (early; desktop is the reference surface).
- `apps/web` is the Next.js marketing site. Blog content is intentionally **not** part of this
  repository.

The sidecar owns the only SQLite connection, so the renderer can never reach the database
directly. Card scans are plain files; the database stores file names only.

## Build from source

Prerequisites: **Node 22**, **pnpm 10.12.1** (`corepack enable`), Rust + Xcode Command Line
Tools for the shell. `better-sqlite3` is built for the Node 22 ABI, so a different Node major
will break the sidecar and the tests.

```bash
pnpm install
pnpm dev            # renderer + sidecar with hot reload
pnpm dev:tauri      # full desktop shell

pnpm check-types    # tsc across the workspace
pnpm lint           # oxlint
pnpm format:check   # oxfmt
pnpm check-architecture
pnpm check-docs     # file headers + module-doc drift
pnpm test           # Vitest (Node 22)

pnpm package:app    # bundle build -> apps/desktop/src-tauri/target/release/bundle/macos/bubo.app
pnpm install:local  # same, then install to /Applications/bubo.app
```

`pnpm package` is the release variant and requires the updater signing key, so it fails without
`TAURI_SIGNING_PRIVATE_KEY`. Use `package:app` unless you are cutting a release.

## Documentation

- [AGENTS.md](./AGENTS.md) — how the repository is meant to be worked on (including the
  maintainer-only Plane workflow).
- [docs/architecture.md](./docs/architecture.md), [docs/run.md](./docs/run.md),
  [docs/testing.md](./docs/testing.md), [docs/conventions.md](./docs/conventions.md).
- [docs/modules/](./docs/modules/) — per-package notes; [docs/decisions/](./docs/decisions/) —
  architecture decision records.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — checks, commit style, product-model red lines.
- [SECURITY.md](./SECURITY.md) — data layout, threat model, private reporting.

## Acknowledgements

- **[flowm-desktop](https://github.com/BarrySong97/flowm-desktop)** — bubo started as a
  personal fork of this project. The asymmetric three-layer product model, the guarded
  ledger CLI, and the statement-import pipeline all descend from it; every `flowm` brand
  and identifier was migrated to `bubo` in
  [ADR 0013](./docs/decisions/0013-rename-brand-to-bubo.md).
- **[lumno-extension](https://github.com/kubai087/lumno-extension)** by kubai087 — the
  `lumno` visual style (and the reference palette behind the theme system) is ported from
  its design language, which ships as **GPL-3.0**. See the license note in
  [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) and
  [ADR 0019](./docs/decisions/0019-dual-visual-languages-and-drawn-primitives.md).

## License

[MIT](./LICENSE). Third-party attribution — including the Apache-2.0 icon set, React Aria,
and the GPL-3.0 lineage of the `lumno` visual style — is listed in
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
