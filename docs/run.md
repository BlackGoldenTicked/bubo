# Runbook

## Environment

- Node.js 22 for workspace tools, tests, CLI development, and sidecar packaging.
- `pnpm@10.12.1`.
- Rust stable and platform Tauri prerequisites for desktop builds.
- Flutter stable for `apps/mobile`.
- Production data identity: `com.chaordex.bubo`.

### When the host default differs

- **Node newer than 22.** The sidecar build (`pkg`, target node22) and the
  `better-sqlite3` ABI are pinned to Node 22, and the sidecar packaging script
  refuses other versions. Keep an isolated Node 22 instead of changing the
  system runtime, and prefix workspace commands with its bin directory, for
  example `PATH="$HOME/.local/node22/node_modules/.bin:$PATH" pnpm test`.
- **Rust older than 1.88.** `Cargo.lock` pins crates that require 1.88 or
  newer; an older stable toolchain fails at `cargo check` with a version
  requirement error rather than a code error. Upgrade the toolchain before
  diagnosing further.
- **fish shell.** Assigning a temporary variable inline (`VAR=value cmd`) and
  the `$'...'` quoting form are bash-only. Use `env VAR=value cmd`. A failed
  command that reports `Expected a variable name after this $` means the shell
  rejected the line, so the command never ran; it is not a build failure.

## Install

```bash
pnpm install
```

A clean install builds `better-sqlite3` for Node 22. If this checkout previously
used Electron and reports an ABI mismatch, run once:

```bash
pnpm -F desktop rebuild better-sqlite3
```

## Start Desktop Development

```bash
pnpm dev
```

This builds the self-contained sidecar and launches `bubo Dev` through Tauri
with identifier `com.chaordex.bubo.dev`. It serves the existing React renderer
through Vite and keeps development ledgers separate from production.

`dev` rebuilds the sidecar on every start and refreshes the copy Tauri spawns
(`src-tauri/target/debug/bubo-sidecar`). That refresh matters: `tauri dev` only
re-copies the external binary when the Rust build actually runs, so a TypeScript
change on its own used to leave an old sidecar running and surface as
`No procedure found on path "voice,parseIntent"` after a tRPC rename. If you see
a procedure/route error that does not match the source, restart with `pnpm dev`.

### Ledger Data And Backups

The two profiles keep separate data folders, and they are **not** the same ledger:

| Profile      | Identifier              | Folder (macOS)                                        |
| ------------ | ----------------------- | ----------------------------------------------------- |
| `pnpm dev`   | `com.chaordex.bubo.dev` | `~/Library/Application Support/com.chaordex.bubo.dev` |
| Packaged app | `com.chaordex.bubo`     | `~/Library/Application Support/com.chaordex.bubo`     |

Opening the wrong one looks exactly like data loss. Two safeguards now cover it:

- `dev` first runs `scripts/sync-dev-ledger.mjs`. It copies the packaged app's
  ledger forward **only when that copy is newer**, snapshots the dev file before
  overwriting it (`bubo.sqlite3.bak-dev-<time>`, newest 7 kept), and removes a
  stale `-wal`/`-shm` so SQLite can never replay a foreign journal. A dev session
  that recorded fresh entries is therefore never rolled back; it just prints that
  the dev ledger is already newest. Set `BUBO_SKIP_LEDGER_SYNC=1` to disable it.
- The sidecar snapshots the active ledger on every open, before migrations run:
  `<ledger>.bak-<time>` via `VACUUM INTO` (so uncheckpointed WAL pages are
  included), newest 7 kept. Rolling back is a file copy away.

Equivalent direct command:

```bash
pnpm -F desktop dev:tauri
```

Useful build checks:

```bash
pnpm -F desktop build:tauri-renderer
pnpm -F desktop build:tauri-sidecar:js
pnpm -F desktop build:tauri-sidecar
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Build And Package

Build every workspace package without creating installers:

```bash
pnpm build
```

Build the native Tauri app bundle for local use:

```bash
pnpm package:app
```

`package:app` skips updater artifacts, so it needs no signing key and is the command the
delivery gate in [AGENTS.md](../AGENTS.md) expects. Build the release bundle instead
(updater archive + signature) when publishing:

```bash
pnpm package
```

Create the configured distribution artifacts:

```bash
pnpm dist
```

The macOS app bundle is under
`apps/desktop/src-tauri/target/release/bundle/macos/bubo.app`. Local builds use
an ad-hoc signature; CI overrides it with the configured Developer ID and
notarization credentials.

Build an isolated debug bundle for manual verification:

```bash
pnpm -F desktop exec tauri build --debug --bundles app --config src-tauri/tauri.dev.conf.json
```

Do not distribute the debug bundle.

## Install Locally On macOS

```bash
pnpm install:local
pnpm install:local -- --restart
```

The script packages Tauri, copies `bubo.app` to `/Applications`, and optionally
restarts it. Existing app data is untouched.

## Release

Add the new first entry in
`apps/web/components/releases/ReleaseTimeline.tsx` and move the single
`badge: "latest"` marker to it, then run from `main`:

```bash
pnpm release 0.2.2
```

The script bumps root/desktop/web/CLI versions plus Tauri JSON/Cargo versions,
runs checks, commits, pushes `main`, tags `v<version>`, and waits for GitHub
Actions. CI creates the GitHub Release, builds target-native Node sidecars,
creates Tauri DMG/NSIS installers, signs/notarizes where configured, and uploads
them. Automatic update discovery is currently disabled: the rename to bubo
removed `plugins.updater.endpoints` because no bubo release repository exists
yet (ADR 0013). Restore that entry to re-enable the startup prompt and Settings
update checks; until then, install new releases by downloading the artifact.
Release CI requires `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; retain a secure offline backup of the
matching bubo updater key.

Supported release flags include `--dry-run`, `--no-publish`, `--no-npm`,
`--no-cask`, `--no-wait`, and `--no-checks`.

## Voice Entry Keys

Voice entry needs a Bailian (DashScope) key for ASR and a DeepSeek key for
semantic parsing. Configure either way:

- In the app: 设置 → 语音记账, paste both keys and save. Keys are stored in
  `bubo-voice.json` inside the app-data directory with mode `0600`.
- For headless or CLI runs: export `DASHSCOPE_API_KEY` and `DEEPSEEK_API_KEY`
  before starting; they act as fallbacks when the settings file has no key.

Region or model overrides live in the same JSON file (`baseUrl`, `model` per
provider); see [docs/topics/voice-entry.md](topics/voice-entry.md).

## Typecheck, Lint, Format, And Test

```bash
pnpm check-types
pnpm lint
pnpm lint:fix
pnpm format:check
pnpm format
pnpm test
pnpm check-architecture
pnpm check-docs
```

`pnpm test` runs Vitest with the same Node ABI used by the sidecar build.

## Demo Data

```bash
pnpm seed:demo
pnpm -F desktop build:demo
```

The seed command is dry-run unless explicitly told to write by its own flags.
The build command regenerates the committed packaged demo ledger.

## bubo CLI

```bash
pnpm bubo-cli ledger-info
pnpm bubo-cli list-budget-periods --status active
pnpm bubo-cli budget-progress --budget-period-id <id>
pnpm bubo-cli apply-patch patch.json --dry-run
```

The workspace CLI runs directly on Node 22 and uses the same
`better-sqlite3` ABI as the sidecar. Use `pnpm --silent bubo-cli ...` when
another program parses its JSON stdout.

## Mobile App

```bash
cd apps/mobile
flutter pub get
flutter run
flutter analyze
flutter test
```

The mobile development fixture lives in the mobile sandbox and does not open
the user's desktop ledger.

## Blog

The blog content and its R2 image pipeline are **not part of this repository** — they live in
a private project next to it (`bubo-blog-private`). `apps/web` ships the marketing site only;
its routes, navigation, and sitemap no longer reference `/blog`.
