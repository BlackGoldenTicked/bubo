# bubo 定制方案：品牌重塑、模块增删与投资记录

- Date: 2026-09-22
- Related spec: none
- Plane: 实施前需为每个阶段单独建工作项（见「实施前置」）

## 背景与目标

在现有 bubo（Tauri + React + Node sidecar + Drizzle/SQLite 的非对称记账应用）基础上，定制一个属于自己的记账工具，三个方向：

1. **品牌与界面**：改应用名/图标/主题色/文案，做成自己的产品。
2. **功能模块增删**：去掉不需要的模块，或调整导航。
3. **投资记录（重点）**：新增股票、基金、加密货币、合约等投资追踪。

本方案只做设计，不改代码。所有阶段都必须守住 [asymmetric-finance-model](../topics/asymmetric-finance-model.md) 红线与 [conventions](../conventions.md) 的分层边界（`pnpm check-architecture` 会强制校验）。

## 现状调研结论

### 全链路改动路径

新增/修改一个业务领域，从下往上贯穿以下文件（以现有 assets 领域为参照）：

| 层       | 路径                                                                   | 职责                                    |
| -------- | ---------------------------------------------------------------------- | --------------------------------------- |
| Schema   | `packages/db/src/schema/index.ts`                                      | Drizzle 表定义（唯一真源）              |
| 迁移     | `packages/db/migrations/`                                              | `pnpm -F @bubo/db db:generate` 生成     |
| 领域规则 | `packages/api/src/domain/<area>/`                                      | 纯计算，不碰持久化                      |
| 仓储     | `packages/api/src/infrastructure/db/repositories/<area>.repository.ts` | Drizzle 持久化                          |
| 用例     | `packages/api/src/use-cases/<area>/<area>-api.ts`                      | 禁止 import Drizzle/`@bubo/db`          |
| 映射     | `packages/api/src/presentation/mappers/`                               | row → DTO                               |
| 门面     | `packages/api/src/index.ts`                                            | `BuboApi` 接口 + 输入/输出类型          |
| 契约     | `packages/shared/src/contracts/<area>/`                                | 浏览器安全 DTO 类型                     |
| 路由     | `apps/desktop/src/main/trpc/router.ts`                                 | tRPC 暴露给渲染层                       |
| 页面路由 | `apps/desktop/src/renderer/src/routes/<area>.tsx`                      | file-based，`routeTree.gen.ts` 自动生成 |
| 页面组件 | `apps/desktop/src/renderer/src/<area>/`                                | React + HeroUI + Tailwind               |
| 展示配置 | `apps/desktop/src/renderer/src/lib/domainDisplay.ts`                   | 标签/分组/颜色                          |
| 导航     | `apps/desktop/src/renderer/src/components/layout/TopNavigation.tsx`    | `PRIMARY_NAV` 数组                      |

手写源码文件需带 AI header（`@purpose/@role/@deps/@gotcha`），`pnpm check-docs` 强制。

### 投资类资产现状（关键）

- `AssetType` 已内置 `brokerage / fund / stock / crypto`；契约还有 `AssetSnapshotType = AssetType | "investment"`，`normalizeAssetType()` 把 `investment` 归一到 `brokerage`。
- `asset_snapshots` 已有 `quantityAmount / quantityUnit / costBasisAmount / costBasisCurrency` 字段（**schema 支持，但 `AddAssetModal` 表单未暴露**）。
- `domainDisplay.ts` 里 `ASSET_GROUPS` 已把投资类归为「投资」分组，有独立颜色。
- 净资产 = 各账户最新快照市值（`liability` 类型计为负债）+ 活跃贷款未偿本金，见 `getNetWorthSnapshot()`。

**结论**：现状只支持「账户级手动市值快照」，缺标的级持仓、买卖交易、行情现价、自动盈亏、合约。

### 品牌/本地化现状

- 品牌集中在 `apps/desktop/src-tauri/tauri.conf.json`（`productName`、`identifier`、`version`、`icon[]`、updater `endpoints`/`pubkey`、窗口 `title`）。
- 图标资源：`apps/desktop/resources/icons/bubo.iconset/*.png`、`bubo.icns`、`src-tauri/icons/icon.ico`。
- 主题走 CSS 变量（`--ink`、`--hair`、`--accent`、`--red`、`--surface-2` 等），设计系统见 `packages/ui` 的 token 与 primitive 契约。
- 文案绝大多数是**硬编码中文**；i18next 已接入（`renderer/src/i18n.ts`，支持 en-US/zh-CN）但只覆盖极少数 key。

---

## Part A：品牌与界面定制

低风险、可独立完成，不碰数据模型。

### 任务

1. **改名与标识符**：编辑 `tauri.conf.json` 的 `productName`、`app.windows[].title`、`identifier`。
   - ⚠️ `identifier` 决定 app-data 目录（`~/Library/Application Support/<identifier>`）。改了会读不到旧 `bubo.sqlite3`。若要保留旧数据，需迁移目录或保持 `identifier` 不变只改 `productName`。
   - 同步 `tauri.dev.conf.json`（dev 用 `<identifier>.dev`）。
2. **换图标**：替换 `resources/icons/bubo.iconset/*` 与 `bubo.icns`、`src-tauri/icons/icon.ico`（保持文件名，避免改 `tauri.conf.json` 的 `icon[]` 路径）。
3. **主题色**：改全局 CSS 变量定义（renderer 全局样式 + `packages/ui`），集中在 `--accent` 等 token；对照设计系统 token 保持「仪器感、数字为主角」的克制风格。
4. **更新源**：`plugins.updater.endpoints` 指向自己的 Release 仓库；`pubkey` 换成自己的签名公钥（私钥入 CI secrets，见 ADR 0012）。
5. **文案本地化（可选，工作量大）**：若要真正双语，需把硬编码中文逐步抽成 i18n key。建议新写的投资模块直接用 i18n，存量文案按需迁移。

### 影响文件

- `apps/desktop/src-tauri/tauri.conf.json`、`tauri.dev.conf.json`
- `apps/desktop/resources/icons/**`、`apps/desktop/src-tauri/icons/icon.ico`
- renderer 全局样式 + `packages/ui/src/**`（主题 token）
- `.github/workflows/release.yml`、`scripts/release.mjs`（发布/签名，若换仓库）

---

## Part B：功能模块增删

### 移除一个模块（如贷款/订阅）

1. 从 `TopNavigation.tsx` 的 `PRIMARY_NAV` 删除对应项。
2. 删除 `routes/<area>*.tsx` 与 `renderer/src/<area>/` 页面文件夹（`routeTree.gen.ts` 会重新生成）。
3. 从 `router.ts` 移除对应 tRPC 子路由；从 `BuboApi` 门面移除相关方法（或保留但不暴露）。
4. **数据表建议保留**：删表要写破坏性迁移，风险高。可只隐藏 UI/API，schema 表留着（参考 `subscription_occurrences` 已 `@deprecated` 但保留兼容）。
5. 注意跨域耦合：净资产 `getNetWorthSnapshot()` 叠加了贷款本金；移除贷款需同步这段聚合逻辑。

### 新增一个模块

走「全链路改动路径」13 层。投资模块即此情形的完整示例（Part C）。

---

## Part C：投资记录模块（重点）

分三阶段递进，建议**先做阶段 1 验证手感，再决定是否上阶段 2/3**。核心原则：投资市值进入净资产只能有**单一来源**，避免和现有资产快照重复计算。

### 阶段 1 — 复用增强（低风险，1～2 天）

不建新表，把现有资产层「升级」为标的级记录：

1. **暴露已有字段**：在 `AddAssetModal.tsx` 增加「数量 / 成本价（或成本基础）/ 现价」输入，写入 `asset_snapshots` 的 `quantityAmount / costBasisAmount / valueAmount`。
2. **标的级建模**：每个标的一个 `asset_item`（`assetType` = `stock/fund/crypto`，`name` = 代码如 `AAPL`，`institution` = 券商/交易所）。
3. **展示盈亏**：在 `AssetDetailPanel` / `AssetsPage` 用展示层计算 `未实现盈亏 = valueAmount − costBasisAmount`、`收益率 = 盈亏 / 成本`，不改净资产聚合（市值已计入）。
4. `domainDisplay.ts` 已有投资分组与标签，几乎零改动。

**优点**：完全符合非对称模型（手动快照）、改动最小、无迁移。
**局限**：无买卖交易历史、无自动成本摊薄、无行情、无合约。

### 阶段 2 — 独立投资领域（中风险，1～2 周）

> 实施注记（2026-09-22）：已按本节落地，最终决策见 [ADR 0015](../decisions/0015-route-investment-value-through-system-snapshots.md)。与草案的差异：交易表未加 `cashflowEventId`（买卖与现金流的关联保持解释性、不建列）；持仓表新增 `realizedPnlAmount`；行情为纯手动，未定义 `PriceProvider`；净资产按「物化 system 快照」接入。

新建 `investments` 领域，支持交易驱动的持仓与自动盈亏。

#### 数据模型草案（Drizzle，加入 `packages/db/src/schema/index.ts`）

```ts
// 持仓（标的级，移动加权平均成本）
export const investmentPositions = sqliteTable("investment_positions", {
  id: text("id").primaryKey(),
  assetItemId: text("asset_item_id"), // 可选：关联到资金账户
  symbol: text("symbol").notNull(), // AAPL / 005827 / BTC-USDT
  name: text("name"),
  instrumentKind: text("instrument_kind", {
    enum: ["stock", "fund", "crypto", "etf", "bond", "other"],
  }).notNull(),
  currency: text("currency").notNull().default("CNY"),
  quantity: text("quantity").notNull().default("0"),
  avgCostPrice: text("avg_cost_price"), // 平均成本价
  costBasisAmount: text("cost_basis_amount"), // 成本基础总额
  status: text("status", { enum: ["open", "closed"] })
    .notNull()
    .default("open"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

// 买卖交易
export const investmentTransactions = sqliteTable("investment_transactions", {
  id: text("id").primaryKey(),
  positionId: text("position_id")
    .notNull()
    .references(() => investmentPositions.id, { onDelete: "cascade" }),
  side: text("side", { enum: ["buy", "sell"] }).notNull(),
  quantity: text("quantity").notNull(),
  price: text("price").notNull(),
  feeAmount: text("fee_amount"),
  executedAt: text("executed_at").notNull(),
  cashflowEventId: text("cashflow_event_id"), // 可选：解释性关联，不自动改现金流
  note: text("note"),
  createdAt: text("created_at").notNull(),
})

// 行情（手动或 provider 拉取，参考 FX provider 模式）
export const priceQuotes = sqliteTable("price_quotes", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  price: text("price").notNull(),
  currency: text("currency").notNull().default("CNY"),
  quotedAt: text("quoted_at").notNull(),
  source: text("source").notNull().default("manual"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
})
```

#### 领域规则（`packages/api/src/domain/investments/`）

- 买入：`新平均成本 = (旧成本基础 + 买入额 + 费用) / (旧数量 + 买入数量)`。
- 卖出：`已实现盈亏 = (卖价 − 平均成本) × 卖出数量 − 费用`，按卖出比例减少成本基础。
- 未实现盈亏：`(现价 − 平均成本) × 持仓数量`；现价来自最新 `priceQuotes`。

#### 净资产接入（关键决策）

- **推荐**：持仓市值定期物化为一条 `asset_snapshots`（`sourceKind: "system"`），复用现有净资产聚合，保持单一来源。
- **备选**：在 `getNetWorthSnapshot()` 里像贷款那样叠加投资层（跨域聚合留在门面）。二选一，避免重复计算。

#### 行情 provider

复用 FX 的 `FxRateProvider` 模式（`createFrankfurterFxProvider`），定义 `PriceProvider` 接口，默认 `manual`，可接交易所/行情 API。**注意**：行情仅用于估值展示，不写现金流、不违反非对称模型。

#### 新增/修改文件清单

- Schema：`packages/db/src/schema/index.ts` + `pnpm -F @bubo/db db:generate`
- 领域：`packages/api/src/domain/investments/investment-rules.ts`
- 仓储：`packages/api/src/infrastructure/db/repositories/investments.repository.ts`
- 用例：`packages/api/src/use-cases/investments/investments-api.ts`
- 映射：`packages/api/src/presentation/mappers/sqlite-row-mappers.ts`
- 门面：`packages/api/src/index.ts`（新增 `listPositions/createTransaction/...`）
- 契约：`packages/shared/src/contracts/investments/investment.contract.ts`
- 路由：`apps/desktop/src/main/trpc/router.ts`（新增 `investments` 子路由）
- 页面：`routes/investments.tsx` + `renderer/src/investments/**`
- 导航：`TopNavigation.tsx` 的 `PRIMARY_NAV` 加「投资」
- 展示：`domainDisplay.ts`（标的类型标签/颜色）
- Seed：`packages/api/src/default-seed.ts`（可选，加示例持仓）

### 阶段 3 — 合约/衍生品（高风险，谨慎）

> 实施注记（2026-09-22）：已按本节落地，最终决策见 [ADR 0016](../decisions/0016-keep-contract-positions-display-only.md)。与草案的差异：不存 `unrealized_pnl` 列，盈亏全部派生；无 `asset_item_id`，合约纯展示、不物化，保证金余额仅经用户手动资产快照计入净资产；新增 `exit_price` 列；币种默认 USD（USDT 不在精选货币列表，不能经 CurrencySelect 选择）；杠杆存 `leverage_bps` 并校验 1x–125x。

加密合约（永续/期货）本质是衍生品，不是「持有资产」。需要独立子模型：

```ts
export const contractPositions = sqliteTable("contract_positions", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["long", "short"] }).notNull(),
  marginMode: text("margin_mode", { enum: ["isolated", "cross"] }),
  leverageBps: integer("leverage_bps"), // 杠杆倍数 ×10000
  quantity: text("quantity").notNull(),
  entryPrice: text("entry_price").notNull(),
  markPrice: text("mark_price"),
  liquidationPrice: text("liquidation_price"),
  marginAmount: text("margin_amount"), // 占用保证金
  unrealizedPnl: text("unrealized_pnl"),
  status: text("status", { enum: ["open", "closed", "liquidated"] })
    .notNull()
    .default("open"),
  currency: text("currency").notNull().default("USDT"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
})
```

- **保证金余额**作为 `asset_snapshots`（现价）计入净资产；**持仓多空/杠杆/未实现盈亏**作为独立交易层展示，不直接改净资产。
- 未实现盈亏方向由 `side` 决定：`long = (mark − entry) × qty`，`short = (entry − mark) × qty`。
- 风险最高，建议阶段 1/2 稳定后再单独立项。

---

## 任务分解

1. [ ] **A 品牌**：名称/标题（`bubo`）、图标（`bubo.iconset`/`bubo.icns`）、主题 token（`--accent` 等）均已完成；**剩余：更新源与签名**（暂缓）——updater `endpoints` 已按 [ADR 0013](../decisions/0013-rename-brand-to-bubo.md) 移除，待自有 Release 仓库后恢复并换自有签名公钥（私钥入 CI secrets）。
2. [x] **A 数据目录决策**（已随品牌重塑执行 2026-09-22，见 [ADR 0013](../decisions/0013-rename-brand-to-bubo.md)）：identifier 定为 `com.chaordex.bubo`；旧数据（`com.flowm.desktop/flowm.sqlite3`）需手动拷贝重命名，不自动读取。
3. [x] **B 模块增删**（已决策：不移除任何模块）：导航/路由/页面/数据表全部原样保留，无需删改。
4. [x] **C 阶段 1**：`AddAssetModal` 暴露数量/成本/现价；展示层算盈亏。验证手感。（已完成 2026-09-22，见 [ADR 0014](../decisions/0014-display-asset-pnl-from-cost-basis.md)）
5. [x] **C 阶段 2**（已完成 2026-09-22，见 [ADR 0015](../decisions/0015-route-investment-value-through-system-snapshots.md)）：建投资领域三表 + 全链路 + 导航；净资产按「物化 system 快照」接入；行情先纯手动。
6. [x] **C 阶段 3**（已完成 2026-09-22，见 [ADR 0016](../decisions/0016-keep-contract-positions-display-only.md)）：合约子模型单独立项；合约纯展示、盈亏全派生、无物化。
7. [x] 每阶段补测试 + 文档（C 阶段 1/2/3 已补齐：ADR 0014/0015/0016、`docs/modules/*` 与 file header、合约新增 22 个测试，全套 112 测试通过）。

## 风险

- **改 `identifier` 会丢失旧数据可见性**：数据目录基于 identifier，务必先决策。
- **净资产重复计算**：投资市值若同时存在于 `asset_snapshots` 和投资层聚合，会翻倍。必须单一来源。
- **破坏分层边界**：用例层误 import Drizzle/`@bubo/db` 会被 `pnpm check-architecture` 拦下；契约层不能引入 Node/DOM/DB。
- **违反非对称模型**：行情/交易不得自动推断资产余额或生成实际现金流；买卖与现金流的关联只能是解释性 link。
- **合约复杂度**：杠杆/爆仓/资金费率语义多，容易做错，建议最后做。
- **i18n 债务**：存量硬编码中文多，全量双语成本高。

## 验证

- `pnpm check-types`、`pnpm test`、`pnpm check-architecture`、`pnpm check-docs`、`pnpm build`。
- 迁移后手动开 `bubo Dev`（dev 标识符，不动生产账本）验证：新建标的、录入买卖、盈亏与净资产正确、多币种换算正确。
- 品牌改动后 `pnpm -F desktop package` 出包，确认图标/名称/窗口标题生效。

## 实施前置

- 本项目有**强制 Plane 工作流**（见仓库协作约定）：每个阶段开工前需在 Plane `bubo` 项目建工作项、写范围与验收标准、置为 In Progress。
- 阶段 2/3 属于durable 架构变更，建议在 `docs/decisions/` 补一份 ADR（如「投资层与净资产的单一来源策略」）。
