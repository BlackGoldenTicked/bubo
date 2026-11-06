# bubo Desktop

bubo Desktop is the Tauri + React implementation of bubo. This workspace
also carries the web site and a Flutter mobile app shell around the same bubo
product model.

## Architecture

- Desktop runtime shell: Tauri v2 (Rust) with a bundled Node 22 sidecar
- Mobile runtime shell: Flutter for Android/iOS
- UI: React, TanStack Router, Zustand, Tailwind CSS, HeroUI, shadcn-style local primitives
- Business layer: TypeScript packages under `packages/*`
- Data: SQLite owned by the private Node sidecar behind narrow Tauri commands

The workspace is organized as:

```text
apps/
  desktop/   Tauri shell, private Node sidecar, and React renderer
  mobile/    Flutter Android/iOS app shell
  web/       Next.js marketing site
packages/
  api/       Product facade used by the renderer
  cli/       Ledger inspection and guarded agent patch CLI
  config/    Shared TypeScript package configuration
  db/        Drizzle schema, migrations, and typed database handle
  shared/    Shared types and utilities
  ui/        Shared UI primitives and styles
```

At runtime, the renderer reaches app data only through the typed `window.bubo`
adapter: React UI -> narrow Rust commands -> private NDJSON Node sidecar (tRPC
router backed by `@bubo/api` and `@bubo/db`) -> SQLite. The sidecar owns the
only SQLite connection; there is no Electron IPC. On first launch it
materializes two files under the production app-data directory:

```text
~/Library/Application Support/com.chaordex.bubo/bubo.sqlite3
~/Library/Application Support/com.chaordex.bubo/bubo-demo.sqlite3
```

Development uses the `com.chaordex.bubo.dev` identity and a separate directory.

## Commands

```bash
pnpm install
pnpm dev
pnpm check-types
pnpm check-docs
pnpm test
pnpm build
pnpm package
```

Flutter mobile commands run from `apps/mobile`:

```bash
cd apps/mobile
flutter pub get
flutter run
flutter analyze
flutter test
```

`pnpm test` runs Vitest on Node 22, the same runtime and `better-sqlite3` ABI
used by the sidecar and CLI builds.

## Agent Harness Docs

Agents should start at [docs/](docs/). Detailed run, testing, design,
module, topic, and decision docs live under [docs/](docs/). The documentation
sensor is:

```bash
pnpm check-docs
```

The renderer entry and route shell live in:

```text
apps/desktop/src/renderer/src/App.tsx
apps/desktop/src/renderer/src/routes/__root.tsx
```
