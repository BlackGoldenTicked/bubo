# Renderer Surfaces

The renderer (`apps/desktop/src/renderer/src`) is where product behaviour is visible:它按页面
划分功能，页面只通过 `window.bubo` 取数，具体流程与保存仍由各自页面的 mutation 负责。
进程边界与窗口行为见 [desktop runtime](desktop-runtime.md)，卡片钱包见
[cards](cards.md)，语音录入见 [voice entry](voice-entry.md)，菜单栏采集见
[menu-bar capture](menu-bar-capture.md)。

## Feature Map

- `assets/` - present asset snapshot list, detail, edit, and archived-account workflows, including display-only unrealized P&L for investment-class accounts with a recorded cost basis.
- `analysis/` - long-range cashflow analysis for monthly income, expense, and net savings trends, with a history-aware back affordance for entry links from overview and imports.
- `budget/` - budget list/detail workflows, expense-category scope editing, and budget query invalidation helpers.
- `dashboard/` - cross-layer overview that composes cashflow, assets, and obligations in a
  widened left summary workbench beside a persistent recent-cashflow table. Its cashflow section
  uses one shared date-range selector above equal-weight expense, income, and savings totals, with
  clickable daily expense bars that open same-period cashflow detail drawers. Below the net-worth
  block sits a 投资动态 section: the last 30 days of investment activity (spot 建仓/清仓, contract
  开仓/平仓/爆仓) derived from `investments.positions` and `contracts.positions` rows — there is
  no investment event table, so dates come from `createdAt`/`updatedAt`/`openedAt`/`closedAt`.
- `imports/` - imported statement and cashflow event views, including `AddTxModal` manual entry, which accepts a prefilled form from a voice cashflow intent. The cashflow list query pushes the page's date bounds into `cashflow.list` (`dateFrom`/`dateTo`, `LIST_LIMIT`) so SQLite filters by window — a fixed small limit would silently hide every row outside the newest window and make older custom ranges render as 「共 0 笔」. The toolbar order is fixed (类型 → 分类 → 时间 → 搜索) and has no 来源 filter: source is currently a single-value dimension (现金), and quick ranges live in the date field's own menu, so a separate preset select would be redundant. Category dots use a random identifying color that reshuffles once per page entry (`CATEGORY_DOT_PALETTE` + Fisher–Yates, frozen for the visit via a ref) and is shared by the list dot and the breakdown segments; the stored category color is only a fallback.
- `investments/` - trade-driven holdings with manual price quotes. List rows lead with the invested
  amount (spot: cost basis; leveraged: margin, marked 估 when estimated) so the headline number does
  not drift with the market; market value and notional live in the detail panel and the summary.
  Surfaces include the open/closed position list,
  position detail with trade history, buy/sell and quote forms, and realized/unrealized P&L
  derived from the replayed position state. Linked accounts receive materialized system
  snapshots, and the surface stays explicit that market value is estimated from manual quotes.
  A top-level tab switches to `ContractsPanel`: leveraged contract rows grouped by
  open/closed/liquidated with create/update/close/delete forms whose P&L math mirrors
  `contract-rules.ts` and stays outside net worth. Liquidated rows render the symbol struck
  through, and an open contract can be marked 已爆仓 from the detail pane, which opens the
  close form preset to the 爆仓强平 outcome (realized loss = full margin).
- `loans/` - future loan obligation views and schedule calculations.
- `settings/` - ledger, category, and app configuration surfaces, including `AiVoiceSection` for the Bailian ASR and DeepSeek keys used by voice entry.
- `subscriptions/` - recurring future obligation views that project calendar/list dates from plans at
  read time and show explicitly linked cashflow as separate actual-deduction history.
- `apps/desktop/src/renderer/src` - React renderer routes, feature pages, providers, and app styles.
- `apps/desktop/src/renderer/index.html` - renderer entry HTML carrying the pre-paint theme boot script.
- `components/charts/` - renderer chart components; SVG text inherits the UI face through `var(--font-ui)` rather than naming a font family, so the bundled IBM Plex faces (Latin) plus the platform CJK fallback apply inside charts too.
- `components/layout/` - desktop shell, title bar, persistent top navigation, and banners; nav tabs carry a semantic icon from `@bubo/ui`'s `AppIcon` set alongside their label.
- `components/layout/SaveGlow.tsx` owns the save light in two shapes. `DialogSaveGlow` is the one 记一笔 and the batch window use: a WebGL shader sweeps a noise-warped iridescent front across the dialog itself (clipped by its radius), falling back to the CSS layers when WebGL is missing, and the dialog closes only after `SAVE_GLOW_DIALOG_MS` — so the feedback belongs to the form that saved. `SaveGlow` is the page-wide variant for saves without their own dialog (subscriptions, loans, assets, cards), deferred ~260ms so the closing dialog never sits on top of it. It is driven by `lib/saveGlow.ts`, which the global mutation cache calls for record-creating tRPC paths (`cashflow.create`, `subscriptions.update`, `assets.addSnapshot`, …) and coalesces within 700ms so a voice batch flashes once instead of once per row.
- `components/layout/TopNavigation.tsx` carries the 卡片 entry as the last primary tab, using the semantic `cards` glyph.
- `components/ui/` - renderer-local UI atoms, including `EmptyState` (optionally icon-led) that are more product-shaped than `@bubo/ui`, including `CurrencySelect` (autocomplete currency picker over the common-currency set), `MoneyAmount` (currency-aware amount with hide-amounts masking), `BackButton` (the one ghost back affordance — text variant `← 返回X` or icon-only — shared by every detail page/panel), `QueryState`/`QuerySkeleton`/`QueryErrorState` (shared pending/error states over a structural query shape), and `EmptyState` (title + hint + optional action, with a `compact` variant for small panes).
- `components/ui/BankSelect.tsx` - the card form's 发卡银行 control: a `@bubo/ui` Combobox over `COMMON_BANKS` that filters by name and alias (农行 → 农业银行) and shows each option's kind tag. `allowCustom` keeps 村镇银行/信用社 saveable, so the field is a searchable picker, not a closed enum.
- `components/ui/DeltaText.tsx` - signed delta atom: one colour and arrow rule for P&L and change, using the product's accent/green-up and red-down semantics.
- `lib/` - browser-safe renderer helpers, tRPC client wiring, command parsing, and UI state atoms; `lib/reportError.ts` is the single toast path for mutation/action failures (deduped by error identity), `lib/theme.ts` resolves the stored `light | dark | system` preference into `<html data-theme>` and the native window appearance, and `lib/useCurrentRates.ts` exposes the base currency and a `toDisplay` conversion helper used by cross-currency totals.
- `lib/domainDisplay.ts` also owns `sourceLabel`: an imported ledger's source value is data (filters and writes key on it), but the UI shows a neutral label instead of the exporting app's name.
- `lib/dateRanges.ts` owns the Chinese quick ranges (本周 / 本月 / 上个月 / 本季度 / 上个季度 / 半年 / 全年), their boundaries, the range text, and the preset a hand-picked range matches. There is no 自定义 entry: a custom range is made in the calendar, and `custom` survives only as the state marker. The imports toolbar, the overview chart, and the cashflow picker all read from it.
- `main.tsx` mounts `I18nProvider locale="zh-CN"`, which is what makes every react-aria surface Chinese and Monday-first; removing it silently reverts the whole app to en-US.
- `routes/` - TanStack Router route modules; `routeTree.gen.ts` is generated and intentionally excluded from file-header enforcement.
- `routes/__root.tsx` replays `.bubo-route-enter` on every navigation without remounting the subtree, so page transitions animate while queries and scroll state survive.
- `voice/VoiceCaptureSheet.tsx` is the global capture overlay (top-bar button and ⌘⇧V): recorder, batch textarea (parses text without ASR), and — for multi-record results — the window widens into `voice/VoiceBatchReview.tsx`, a tiled grid where every card is expanded and cashflow records can be edited and saved in one action. Each card names its category, and the log area mirrors the parse trace (vocabulary size, failed pool attempts, raw model answer, per-record category) so a missing category is explainable without a debugger.
- `lib/voice/audioRecorder.ts` captures microphone audio and encodes 16 kHz mono PCM WAV base64 for the voice entry mutation.
- `lib/voice/intentHandoff.ts` is the domain-scoped intent bus plus the ordered confirmation queue.
- `lib/voice/voiceQueueControl.ts` continues a batch after a save: same-domain next record first, otherwise it reopens the capture sheet so mixed-domain batches keep the tiled flow (hand-opened forms never advance it).
- `lib/voice/useVoiceIntent.ts` subscribes one feature page to its own domain and prefills that page's form.

Card wallet surfaces (`cards/CardsPage.tsx`, `CardVisual.tsx`, `CardStackList.tsx`,
`CardFormModal.tsx`, `useCardScan.ts`, `lib/desktop-runtime.ts` card hook) and the menu-bar
capture surfaces (`quick/QuickCapturePage.tsx`, `settings/ShortcutSection.tsx`,
`lib/shortcut.ts`) are documented in [cards](cards.md) and
[menu-bar capture](menu-bar-capture.md).

## Renderer-Wide Conventions

- Renderer CRUD forms should use React Hook Form for state and validation, with current HeroUI
  controls plus `components/ui/FormField.tsx` for field-level labels and error state.
- Renderer feature UI should prefer HeroUI controls and Tailwind utilities.
  Inline styles are reserved for dynamic runtime values, chart-library prop
  objects, and values Tailwind cannot express cleanly.
- Renderer copy is Chinese and lives inline; the app is local-only and has no
  i18n layer. Query pending/failure renders through `components/ui/QueryState.tsx`
  (or `QuerySkeleton`/`QueryErrorState` for partial regions) and empty states
  through `components/ui/EmptyState.tsx`, not inline 加载中 / 加载失败 text.
- Save feedback has one global path too: `MutationCache.onSuccess` in `lib/trpc.ts` decides from
  the mutation key whether the save glow replays (`lib/saveGlow.ts`), so pages never call it
  themselves and a batch save cannot fire one bloom per record. Settings → 外观 keeps a
  「保存动效预览」 row that plays it on demand.
- Jotai has exactly one store: `lib/state/store.ts` exports `appStore`, `TRPCProvider` passes it to
  `<JotaiProvider store={…}>`, and any imperative write outside React (`saveGlow`, voice queue
  control) targets the same instance. `getDefaultStore()` is a _different_ store and its writes are
  invisible to the UI — that is why the save glow silently did nothing when it wrote the default one.
- Mutation failures toast through one global path only: the `MutationCache.onError`
  in `lib/trpc.ts` calls `reportActionError` (`lib/reportError.ts`), which dedupes
  by error identity. Callers that need extra handling must reuse
  `reportActionError`, not `notify`, so the same error is not toasted twice.
  See [ADR 0017](../decisions/0017-unify-renderer-states-failures-and-copy-language.md).
- The renderer theme has one contract: `themePreferenceAtom` (`bubo.theme`, default
  `system`) is applied by `lib/theme.ts` to `<html data-theme>` and the native
  window via Tauri `setTheme`; `renderer/index.html` mirrors the same storage key
  before first paint. New surfaces use `--surface-1` for page/panel faces instead
  of `bg-white` (literal whites are only for content on colored fills), and every
  new bubo token needs both a `:root` and a `[data-theme="dark"]` value.
  See [ADR 0018](../decisions/0018-renderer-theme-system.md).
- `components/ui/DateInput.tsx` / `DateRangeField.tsx` are the only date controls: every modal, filter, and loan form routes through them, so no surface re-declares a calendar. `DateRangeField` keeps the calendar open state controlled and opens it on a click anywhere in the segment field (clicking a year/month/day segment must pop the calendar), and pins the calendar trigger to a fixed 22px width — HeroUI's `w-full` trigger otherwise collapses under the flex row and clips the calendar icon. Both range inputs are also forced shrinkable, because HeroUI's range layout keeps them `flex: none` and a long value otherwise pushes the calendar icon past the group's clipped right edge.
- Money renders through `useMoney` / `useSignedMoney` / `useCurrencyMoney` (in `@/lib/useMoney`),
  never the pure `@/lib/format` functions, so the hide-amounts preference re-renders them.
- Handwritten desktop source files carry AI headers. Generated files such as `routeTree.gen.ts` and ambient Vite declarations are skipped in `check-docs.config.json`.

## Page Rules

- Dashboard cashflow range selection is a renderer preference persisted in
  `localStorage`; it does not change the active ledger or database state.
- Dashboard loan debt is a read-time projection: the overview loads loan
  occurrence history and derives remaining principal from elapsed due dates so
  its debt figure matches the loans page. This does not mutate forecast rows,
  cashflow, or asset snapshots.
- Dashboard net worth trend points are month-end as-of asset snapshot totals:
  each account carries its latest known snapshot forward until a newer snapshot
  replaces it, while liabilities subtract from the total.
- The overview uses `TransactionTable` compact mode so its narrow right pane shows date,
  item, category, and amount. Full cashflow and detail surfaces keep the tag and source columns.
  Dashboard summaries should remain independently scrollable from the recent-cashflow table at
  reduced window heights.
- The imports toolbar filters by 类型 / 分类 / 时间 only; keyword search was removed, so `q` is no longer a filter param. The toolbar is sticky inside the table's scroll column, and the table header sticks to the toolbar's measured height — a hard-coded offset leaves the header floating over the first rows instead of pinning under the filters.
- The imports/cashflow page keeps its category breakdown interactive: clicking
  a donut segment or the adjacent category row must update the left-side
  category filter and URL-synced filter state.
- `AddTxModal`'s "fall back to the first chip" effect must read `getValues()`, never the `watch()` snapshot: it runs in the same commit as the `reset(initial)` effect, so the snapshot is still the previous (empty) form and the fallback silently overwrote a voice-prefilled category with 三餐. It also must not clear the category when the options list is temporarily empty — the category query is often still in flight right after a voice handoff navigates to `/imports`.
- Budget creation must work on an empty personal ledger by lazily creating the default budget set and current monthly period before inserting the first item. When a new month has no budget period but a previous monthly plan exists, overview and budget views prompt the user to generate the current month's budget from the latest plan; they must not create rollover periods without confirmation.
- Budget create/edit forms bind optional expense-category scopes through HeroUI
  multi-select controls. Leaving the selection empty means an overall expense
  budget; detail-page transaction lists must use the bound category ids returned
  by budget progress so they match the backend used amount.
- Asset account removal is an archive workflow. Archived accounts stay out of
  current asset totals, net worth, and asset composition, but remain viewable
  from the assets surface so users can inspect history or restore the account.
- Investment-class asset types (`brokerage` / `investment` / `fund` / `stock` / `crypto`) accept
  optional 「数量 / 成本基础」 inputs in the asset form. The assets page and asset detail panel derive
  「未实现盈亏」 and its return rate at display time via `assets/assetPnl.ts`; this is an estimate from
  manually maintained cost basis and never writes back into net worth, cashflow, or snapshot rows.
  Snapshots whose cost basis currency differs from the value currency show no P&L.
- Investment holdings are trade-driven: position rows are the replay of their buy/sell history
  (`replayTrades`), so quantity, cost, and P&L corrections belong in trades rather than direct
  edits, and quotes only reprice. Recording trades or quotes materializes the linked account's
  open market value into a same-day `system` snapshot for net worth, while a same-day manual
  balance still wins. Positions must match the linked account currency, and deleting the last
  open position clears the materialized snapshot.
- Contract positions are display-only: the contracts tab derives notional, margin, and P&L at
  render time via `investments/contractDisplay.ts`, never materializes snapshots, and never
  touches cashflow or the linked-account rules above. Closing records an outcome — `closed`
  requires an exit price, while `liquidated` realizes the posted margin as a loss. Only a margin
  balance the user records as an asset snapshot reaches net worth. See
  [ADR 0016](../decisions/0016-keep-contract-positions-display-only.md).
- UI copy and flows must preserve the separation between cashflow, assets, and obligations. The
  subscription detail separates read-time 「扣费计划」 from 「实际扣款流水」; subscription/loan
  details use `cashflow-links/LinkedCashflowDrawer` (bound flows + 解绑) and
  `cashflow-links/CashflowPickerModal` (filtered multi-select binding). These are read/link surfaces
  only: binding flows must never alter the forecast plan or its statistics. The picker reuses the
  shared filter controls extracted to `imports/filterControls.tsx`.
- Subscription schedules are browser-safe read-time projections from active plans. They are not
  written on ledger open or at a date boundary, and elapsed projected dates never count as actual
  deductions. Loan progress is a date-derived projection: non-skipped occurrences due on or
  before the local current date count as elapsed, regardless of stored forecast
  status or linked cashflow. `TauriLedgerStore` extends loan forecasts 60 days ahead on ledger open and
  at the next local date boundary.
  Generation is idempotent by plan and due date, and emits a renderer refresh
  hint after the maintenance pass. This workflow never creates cashflow,
  changes occurrence status or stored principal, or modifies asset snapshots.
- Multi-currency: single items render in their original currency symbol via `currencySymbol(entity.currency)` — this applies to list rows, detail panels (subscription/loan/asset detail), and per-loan widgets (e.g. the schedule bar). Aggregated totals (net worth, asset totals/treemap, subscription/loan summaries, future pressure) render in the base currency after conversion via `useCurrentRates().toDisplay`. The base currency is editable in settings, and opening a ledger triggers a background daily FX refresh. Past cashflow, imports, and budgets stay in native amounts and are not converted.
- Hide amounts: a global, persisted preference (`amountsHiddenAtom`) masks every money amount to `⋯⋯` (currency symbols/signs stay) for demos, screenshots, or onlookers. Toggle it from settings or the top navigation.
- Analysis charts summarize past cashflow only; keep them visually connected to
  cashflow review, not asset reconciliation or forecast planning.
- The demo ledger banner is intentionally non-dismissible while a demo ledger is active; the explicit exit is switching to a non-demo ledger.
