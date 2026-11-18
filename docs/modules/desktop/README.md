# Desktop App

## Responsibility

`apps/desktop` owns the Tauri v2 shell, bundled Node data sidecar, React
renderer, routing, local app resources, and desktop packaging configuration.

## Module Map

这个模块文档只保留总览与跨领域不变量；细节按主题拆到 `docs/topics/`：

| 主题           | 文档                                                                                                               | 覆盖内容                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 运行期         | [desktop-runtime](../../topics/desktop-runtime.md)                                                                 | 进程边界、`window.bubo` 契约、窗口与拖拽、账本生命周期、外部提交刷新、更新与身份                                  |
| 渲染层         | [renderer-surfaces](../../topics/renderer-surfaces.md)                                                             | 页面功能图、渲染层通用约定、各页面规则、保存光效（`SaveGlow` + 全局 mutation 回调）                               |
| 构建与发布     | [desktop-build](../../topics/desktop-build.md)                                                                     | renderer/sidecar/bundle 构建、CI、签名与更新产物                                                                  |
| 菜单栏与快采   | [menu-bar-capture](../../topics/menu-bar-capture.md)                                                               | 托盘常驻、全局快捷键、快采窗口                                                                                    |
| 卡片钱包       | [cards](../../topics/cards.md)                                                                                     | 卡片身份数据、扫描图、卡片视图                                                                                    |
| 语音录入       | [voice-entry](../../topics/voice-entry.md)                                                                         | ASR、意图解析、模型池、诊断日志、批量平铺确认与一键保存（[ADR 0030](../../decisions/0030-tiled-batch-review.md)） |
| sidecar 与 IPC | [tauri-sidecar-trpc](../../topics/tauri-sidecar-trpc.md)、[tauri-node-sidecar](../../topics/tauri-node-sidecar.md) | tRPC 边界、Node SEA 打包与原生 ABI                                                                                |

Key entry points stay here: `src-tauri/src/lib.rs` (composition root),
`src/tauri-sidecar/index.ts` (NDJSON process), `src/main/trpc/router.ts` (tRPC surface),
`src/renderer/src/main.tsx` (renderer root).

## Data Flow

```text
React renderer -> window.bubo adapter -> Tauri Command -> private NDJSON
sidecar -> shared tRPC router -> @bubo/api -> @bubo/db -> SQLite
```

The sidecar owns the connection and ledger lifecycle; the renderer never receives
shell, filesystem, or raw SQL access. Details and the `window.bubo` contract live in
[desktop runtime](../../topics/desktop-runtime.md).

## Built-In Ledgers

On first launch, `TauriLedgerStore` materializes two SQLite files under the production `com.chaordex.bubo` app-data directory:

- `bubo-demo.sqlite3` - copied from the packaged demo resource and used for the full sample ledger.
- `bubo.sqlite3` - migrated in place and seeded as the user's editable personal ledger with default categories plus small starter budgets, assets, subscriptions, and loans.

Fresh installs start on the demo ledger, while the personal ledger is already present so the user can switch out of demo mode without landing on an empty database. Switching rules are in
[desktop runtime](../../topics/desktop-runtime.md#ledger-lifecycle-sidecar-owned).

## Watchouts

- Keep the sidecar boundary intact: SQLite access stays behind Rust commands and the private
  sidecar; the renderer never gets sidecar execution, raw SQL, Node, or filesystem access.
- Sidecar stdout is the NDJSON protocol. All diagnostics, including local socket startup
  messages, must go to stderr or be suppressed.
- Do not overwrite `bubo.sqlite3` when it already exists; that file is user data, even if the starter seed changes later.
- New non-demo ledgers created from settings use the same personal starter seed as `bubo.sqlite3`.
- Keep the desktop-visible app name `bubo` and production identifier `com.chaordex.bubo` stable so existing data stays in place; development uses `com.chaordex.bubo.dev`.
- Handwritten desktop source files carry AI headers. Generated files such as `routeTree.gen.ts` and ambient Vite declarations are skipped in `check-docs.config.json`.
