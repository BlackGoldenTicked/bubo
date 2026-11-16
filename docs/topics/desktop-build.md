# Desktop Build And Release

桌面端产物只有一条链：renderer（Vite）→ sidecar（Vite SSR + Node SEA）→ Tauri bundle。
开发内环、本地安装与发布命令见 [runbook](../run.md)，运行期边界见
[desktop runtime](desktop-runtime.md)。

## Key Files

- `apps/desktop/vite.config.ts` - Vite build for the renderer.
- `apps/desktop/vite.sidecar.config.ts` - Vite build for sidecar JavaScript (`dist-sidecar/index.cjs`, `better-sqlite3` external).
- `apps/desktop/scripts/build-tauri-sidecar.mjs` - maps Rust host triples to self-contained Node 22 sidecars.
- `apps/desktop/pkg.sidecar.config.cjs` - includes the dynamic `better-sqlite3` native binding in the sidecar.
- `apps/desktop/scripts/sync-dev-ledger.mjs` - pre-dev sync of the packaged ledger into the dev profile; newest-wins, snapshots the dev file first, and drops stale WAL/SHM.
- `apps/desktop/scripts/seed-demo.ts` - developer script for seeding local demo data.
- `apps/desktop/scripts/build-demo-ledger.ts` - script for building the packaged demo ledger resource.
- `apps/desktop/resources/icons` - shared desktop app icon sources and macOS `.icns` asset.
- `apps/desktop/src-tauri/icons/icon.ico` - generated Windows executable/installer resource icon required by `tauri-build`.
- `.github/workflows/ci.yml` - lint, format, type, architecture, docs, and test gates on every push.
- `.github/workflows/release.yml` - tag-triggered Tauri DMG/NSIS build and upload pipeline.
- `scripts/release.mjs` - release automation entrypoint behind `pnpm release <version>`; bumps package versions, commits, pushes `main`, tags, waits for CI, and validates the published release and updater manifest.

## Build

- `pnpm package:app` builds renderer + sidecar + Rust shell and writes
  `apps/desktop/src-tauri/target/release/bundle/macos/bubo.app` without updater artifacts, so
  it needs no signing key. `pnpm package` is the release variant and requires
  `TAURI_SIGNING_PRIVATE_KEY`.
- Build sidecars with Node 22 on the matching OS/architecture. The generated
  executable includes the `better-sqlite3` binding and requires no system Node.
- Desktop tests and sidecar packaging depend on the Node 22 ABI for `better-sqlite3`.

## Release

- Releases have no changelog file to edit: `pnpm release` requires a clean
  worktree, and the GitHub Release body is the tag's generated notes.
- Updater releases require the long-lived bubo signing key. Keep only its
  public key in `tauri.conf.json`; CI secrets hold the encrypted private key and
  password.
- The macOS release job must build both `app` and `dmg`, because the signed
  updater archive comes from the app bundle.
- Every release must publish signed updater artifacts plus a `latest.json`
  containing macOS ARM64 and Windows x64 entries.
