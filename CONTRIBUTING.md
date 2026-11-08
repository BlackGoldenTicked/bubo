# Contributing to bubo Desktop

Thanks for taking the time to help. This project is a local-first personal finance app:
correctness of the numbers and the safety of user data matter more than feature velocity.

## Before you start

- **Node 22** and **pnpm 10.12.1** (`packageManager` in `package.json` pins it). The sidecar
  and workspace tests run on Node 22 because `better-sqlite3` is built against that ABI.
- **Rust toolchain + Xcode Command Line Tools** for the Tauri shell (`cargo` is only needed
  when you touch `apps/desktop/src-tauri`).
- For anything non-trivial, open an issue first. The product model has deliberate constraints
  (see below) and a change that contradicts them will be asked to change.

```bash
pnpm install
pnpm dev            # renderer + sidecar hot reload
pnpm dev:tauri      # full desktop shell
```

## Product model (do not break these)

bubo is **not** a double-entry ledger. Three layers stay independent:

1. Past cashflow — what was spent and earned.
2. Present assets — what money and value exists now.
3. Future obligations — subscriptions, loans, plans (forecasts, never actuals).

Hard rules, enforced by review and partly by `pnpm check-architecture`:

- Never infer asset balances from imported statement lines.
- Subscription and loan plans stay forecasts; they do not create cashflow or move assets.
- Liabilities in net worth come from liability snapshots, not from loan plans.
- The renderer reaches data only through the `window.bubo` adapter and narrow Rust commands.
  Only the private Node sidecar opens SQLite. No raw SQL strings — go through Drizzle against
  `@bubo/db`; `sql\`...\`` is for expressions Drizzle cannot express.
- Card scans never enter SQLite; only the file name is stored.

## Checks (run before pushing)

```bash
pnpm check-types        # tsc across all packages
pnpm lint               # oxlint
pnpm format:check       # oxfmt
pnpm check-architecture # layer boundaries
pnpm check-docs         # AI file headers + module docs drift
pnpm test               # Vitest on Node 22
```

`pnpm check-docs` is not cosmetic: every source file carries an `@purpose/@role/@deps/@gotcha`
header, and changing a module without touching its doc under `docs/modules/<module>/` is a
hard failure. Add or update an ADR in `docs/decisions/` for durable architecture decisions.

Desktop changes are not done until the app builds:

```bash
pnpm package:app        # renderer + sidecar + Rust shell -> apps/desktop/src-tauri/target/release/bundle/macos/bubo.app
pnpm install:local      # same, then install to /Applications/bubo.app
```

`pnpm package` is the release variant and needs the updater signing key, so it fails without
`TAURI_SIGNING_PRIVATE_KEY`. Contributors should use `package:app`.

## Commits and pull requests

- Commit messages follow `type(scope): 中文摘要`, and the body explains **the problem, the
  approach, and (optionally) how to reproduce**. One logical change per commit.
- Keep pull requests focused; unrelated refactors go in their own PR.
- A PR should state: what changed, why, how you verified it (commands + what you saw), and any
  known gaps. Screenshots help for anything visual — the UI has two visual styles
  (`bubo` / `lumno`) and both must survive a layout change.
- The maintainer's own workflow tracks work items in a private Plane project. External
  contributors only need an issue; ignore any Plane reference you see in `AGENTS.md`.

## Data safety

Never commit ledger exports, card scans, API keys, or anything from
`~/Library/Application Support/com.chaordex.bubo*`. `.gitignore` covers the usual suspects,
but check `git status` before you commit. Demo/seed data must stay synthetic.

## Reporting bugs and security issues

- Functional bugs: open an issue with the bug template (include macOS/Windows version and
  whether you run the bundled app or `pnpm dev`).
- Security issues: **do not** open a public issue — see [SECURITY.md](./SECURITY.md).
