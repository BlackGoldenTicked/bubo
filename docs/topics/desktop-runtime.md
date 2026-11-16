# Desktop Runtime: Shell, IPC, And Updates

`apps/desktop` is a Tauri v2 shell around a private Node sidecar, so the renderer can only
reach app data through narrow commands. This document owns the process boundary, the
`window.bubo` surface, window/drag rules, the sidecar-owned ledger lifecycle, and updates.
Page behaviour lives in [renderer surfaces](renderer-surfaces.md), packaging in
[desktop build](desktop-build.md), and the tray/quick-capture window in
[menu-bar capture](menu-bar-capture.md).

## Key Files

- `apps/desktop/src-tauri/src/lib.rs` - Tauri composition root, narrow commands, and managed sidecar lifecycle.
- `apps/desktop/src-tauri/src/shell.rs` - tray icon and menu, close-to-tray behaviour, the reused `quick-capture` window, and global-shortcut registration. The capture window is placed under the menu-bar icon when macOS reports it, otherwise docked under the menu bar on that side, and any position the user drags to is persisted in `quick-window.json`. The same shortcut toggles recording (`quick-capture:start` / `quick-capture:toggle`).
- `apps/desktop/src-tauri/src/speech.rs` - Apple Speech framework bridge behind the `speech_recognize` command (macOS).
- `apps/desktop/src-tauri/tauri.conf.json` - production identity, window, resource, external binary, and bundle configuration.
- `apps/desktop/src-tauri/tauri.dev.conf.json` - isolated `bubo Dev` identity overlay.
- `apps/desktop/src-tauri/Info.plist` - merged macOS bundle metadata, including the microphone usage description.
- `apps/desktop/src/tauri-sidecar/index.ts` - NDJSON process entry point.
- `apps/desktop/src/tauri-sidecar/ledger-store.ts` - ledger registry, migrations, one active SQLite connection, and `@bubo/api` facade.
- `apps/desktop/src/tauri-sidecar/ledger-backup.ts` - pre-open ledger snapshot (`VACUUM INTO`, newest 7), so every schema migration has a rollback file.
- `apps/desktop/src/main/local-ledger-change-server.ts` - local socket listener for external commit refresh hints.
- `apps/desktop/src/main/trpc/router.ts` - tRPC router exposed through the private sidecar.
- `apps/desktop/src/main/trpc/transport.ts` - compact sidecar request dispatcher.
- `apps/desktop/src/main/trpc/ledger-service.ts` - runtime-neutral ledger lifecycle contract.
- `apps/desktop/src/renderer/src/env.d.ts` - typed `window.bubo` renderer contract.
- `apps/desktop/src/renderer/src/lib/desktop-runtime.ts` - Tauri adapter for native commands, import/reveal, external refresh, version, signed updates, and manual download fallback.

Voice and card service contracts (`main/trpc/voice-service.ts`, `main/trpc/card-service.ts`)
belong to [voice entry](voice-entry.md) and [cards](cards.md). The sidecar boundary and the
native ABI are covered by [Tauri sidecar and tRPC](tauri-sidecar-trpc.md) and
[Tauri Node sidecar](tauri-node-sidecar.md).

## Process Boundary

```text
React renderer -> window.bubo adapter -> Tauri Command -> private NDJSON
sidecar -> shared tRPC router -> @bubo/api -> @bubo/db -> SQLite
```

The sidecar owns the connection and ledger lifecycle. Rust serializes requests
through one managed process; the renderer does not receive shell, filesystem,
or raw SQL access. There is one SQLite implementation and no LocalStorage data
compatibility layer.

The renderer should never open SQLite directly and should not import Node-only sidecar code.

## `window.bubo` Interface

- `window.bubo.trpcRequest(operation)`
- `window.bubo.getDatabasePath()`
- `window.bubo.databaseExists()`
- `window.bubo.onLedgerChanged(callback)` - renderer event hook used to invalidate cached queries after an external commit against the active ledger.
- `window.bubo.getAppVersion()` - resolves the running Tauri application version.
- `window.bubo.checkForUpdate()` - checks signed production release metadata.
- `window.bubo.installUpdate(callback)` - downloads, verifies, installs, and relaunches after explicit confirmation.
- `window.bubo.openDownloadPage()` - opens the latest GitHub Release as a fallback.

Tauri's official dialog/opener/updater/process plugins provide ledger import,
file reveal, signed updates, relaunch, and the manual download fallback. The
sidecar receives external refresh hints and the renderer polls the narrow
Rust drain command while subscribed.

Update `apps/desktop/src/renderer/src/env.d.ts` whenever the `window.bubo` contract changes.

## Window, Drag, And Navigation

- Primary route navigation belongs to the root renderer shell. Feature pages must not mount
  their own navigation.
- `TitleBar` is the outermost renderer DOM boundary: its 24px top band and the non-interactive
  parts of the 52px navigation row use CSS `app-region: drag`; only concrete links and buttons
  use `app-region: no-drag`. Never wrap the route tree in a no-drag ancestor and then try to
  restore dragging below it. Do not add imperative window-drag event handlers; Tauri's
  declarative `data-tauri-drag-region` still requires the `core:window:allow-start-dragging`
  capability. The navigation row uses the same 28px horizontal inset as overview content.
- `routes/__root.tsx` short-circuits `#/quick-capture` to the quick capture page, so the capture
  window never mounts the shell, navigation, or the in-app voice sheet.
- `lib/mouseHistoryNavigation.ts` maps side buttons, browser history keys, and macOS
  Command+[ / Command+] to TanStack Router history on Tauri.

## Ledger Lifecycle (Sidecar-Owned)

Ledger switching changes the active SQLite connection in the sidecar, not a renderer-side
filter. After any successful switch, renderer code must clear query state, route to a stable
screen, show a short transition state, and reload the window so already-mounted pages cannot
keep showing data from the previous ledger. Invalidating one route's queries is not enough;
use the shared renderer switch helper so cache clearing, transition UI, navigation, and reload
stay consistent.

The two built-in ledger files are described in the [module overview](../modules/desktop/README.md#built-in-ledgers).

## External Commit Refresh

When the desktop app is running, it opens a local ledger-change socket in the app data
directory. A local writer that commits to the ledger outside the app sends a best-effort
`ledger.changed` event to that socket; the sidecar queues events only when the changed database
path matches the current active ledger. The renderer then invalidates React Query state so open
screens refetch without reloading.

The socket is only a refresh hint. Do not use it for writes or direct renderer database access.

## Identity And Updates

- Keep the desktop-visible app name `bubo` and production identifier `com.chaordex.bubo` stable so existing data stays in place.
- Tauri development uses `com.chaordex.bubo.dev` / `bubo Dev`; do not test writes through the production identity.
- Tauri dialog/opener capabilities stay limited to file selection and revealing a known ledger
  path. Selected files are migrated and registered inside the sidecar; the renderer never opens
  them.
- Sidecar stdout is the NDJSON protocol. All diagnostics, including local socket startup
  messages, must go to stderr or be suppressed.
- Updates are signed: `tauri.conf.json` carries only the public key, CI holds the encrypted
  private key, and every release publishes signed artifacts plus a `latest.json`. See
  [desktop build](desktop-build.md#release) for the release-side rules.
