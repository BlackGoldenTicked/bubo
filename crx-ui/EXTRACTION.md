# Lumno 扩展 · UI 设计组件与引导页效果抽取

> 目标：从 `lumno-extension` 代码结构中原样抽取（1）可复用的 UI 设计组件，（2）引导页（onboarding）的全部动画与交互，便于后续复刻相同或相近的美观度与体验。

抽取产物位于 `docs/extraction/`：

| 文件 | 作用 |
|---|---|
| `onboarding-replica.html` | **高保真引导页复刻**（v2，双击即开）。使用**真实 en blueprint、真实图片资源、真实动画时长**：5 屏分页切换 + 复制淡入淡出 + 标题轮播词 + 分段进度条 + 4 类交互行 + 手风琴 + 演示光标（含跨屏连续性）+ 5 类视觉面板（打字/结果展开/hover 循环）+ 水印 + 深色模式 / `prefers-reduced-motion`。 |
| `components-gallery.html` | **组件陈列室**。把下面清单里的组件全部可视化渲染 + 一键复制代码，用于挑选与落地复用。 |
| `ui-components.css` | 去扩展化的设计系统与组件样式库（design tokens + 18 类组件类）。 |
| `ui-components.js` | 去扩展化的组件行为库（Tooltip / MenuSurface / Checkbox / Shortcut 四大模块）。 |
| `EXTRACTION.md` | 本说明：组件清单 + 引导页复刻指南。 |

---

## 1. UI 设计组件清单（抽取结果）

所有组件均来自 `src/shared/*` 与 `src/onboarding/*`，下表给出“源码 → 抽取位置”的精确映射。

| 组件 | 源码文件 | 抽取到 | 关键设计点 / 选择器 |
|---|---|---|---|
| 行动按钮（胶囊） | `onboarding.html` `.onboarding-action-button` | `ui-components.css` `.lbtn` | 三态：`--primary`(深色渐变+内高光) / `--secondary`(白底描边) / `--ghost`(右对齐无边框)；`:active` 下沉 `translateY(1px) scale(.98)`；含 `::before` 内阴影层。 |
| 分段进度条 | `onboarding.html` `.page-strip` | `ui-components.css` `.page-strip` | 5px 圆角段；整条 `strip-enter` 模糊上移入场，逐段 `strip-seg-enter` 以 `--i`  stagger 延迟（`80ms + i*55ms`）缩放展开。 |
| 旋转色调词 | `onboarding.html` `.title-rotator` | `ui-components.css` `.title-rotator` | 词被 `.t-resize` 包裹，按 `data-tone` 切换浅色底+彩色字（bookmark/history/top-sites/settings 四套）；宽度用隐藏 `.title-rotator__measure` 测量后平滑过渡。 |
| 动画原语 | `onboarding.html` `.t-text-swap / .t-copy-swap / .t-panel-slide / .t-resize` | `ui-components.css` | 统一的 `is-exit` / `is-enter-start` 状态机：translateY + blur + opacity 三段式；`t-panel-slide` 用 `grid-template-rows:0fr→1fr` 做高度展开。 |
| 交互行 / 手风琴 | `onboarding.html` `.interaction-slot` | `ui-components.css` `.interaction-slot` | 18px 图标栅格；手风琴 `data-expanded` 控制 chevron 旋转 `rotate(-90deg)` 与面板网格展开。 |
| 浏览器头像组 | `onboarding.html` `.browser-avatar-group` | `ui-components.css` | 重叠头像 `margin-left:-6px` + 描边/阴影。 |
| 快捷键键帽 | `onboarding.html` `.shortcut-keycap` | `ui-components.css` | 黑边 + `linear-gradient` + 底部投影；深色模式转双渐变 border-box 描边。 |
| Tooltip 浮层 | `shared/tooltip.{js,css}` | `ui-components.css` `.l-tooltip` + `ui-components.js` `Tooltip` | fixed 浮层，视口智能避让（top/bottom/left/left-above + 边界夹取），多行 + `────────` 分隔符；`bind/bindAll` 声明式绑定 `[data-tooltip]`。 |
| 菜单浮层 | `shared/menu-surface.{js,css}` | `ui-components.css` `.l-menu-surface` + `ui-components.js` `MenuSurface` | `data-open` 驱动 `scale(.96,.86)→1` + 透明度；弹性缓动 `cubic-bezier(.2,1.45,.35,1)`；支持 content-width 自适应。 |
| 复选框 | `shared/checkbox.{js,css}` | `ui-components.css` `.l-checkbox` + `ui-components.js` `Checkbox` | 自定义 `appearance:none` 盒子；`createRequiredGroup` 保证至少一项勾选；对勾 `rotate(-45deg) scale(0→1)`。 |
| 自定义下拉 | `shared/custom-select.{js,css}` | `ui-components.css` `.l-select-*` | trigger + menu + option；`data-open` 翻转箭头、展开选中态；对齐 left/middle/right、icon-only 模式。 |
| 搜索输入 | `shared/search-input.{js,css}` | `ui-components.css` `.l-search*` | 圆角容器 + 左侧图标 + 右侧图标(hover 缩放/变色) + 模式徽标（如“GitHub”）；`caret-color` 强调色；`@supports corner-shape` 圆角微调。 |
| 光标跟随 Tooltip | `shared/cursor-tooltip.{js,css}` | `ui-components.css` `.l-cursor-tag` | 跟随指针的胶囊标签，内嵌键帽（`.l-cursor-tag__key`）；深色键帽双渐变描边。 |
| **Feature hint（新手引导气泡）** | `shared/feature-hints.{js,css}` | `ui-components.css` `.l-hint` | 教练标记浮层：`#fff→#f7f9fc` 渐变 + `rgba(214,219,227,.95)` 描边 + 双层阴影，radius 12px，最大宽 280px；`__badge`（半透明药丸 + 内高光）+ `__text` + `__link` + `__close`；`__arrow-tip`（border 9px / fill 8px）；`data-visible` 触发 `translateY(6px) scale(.98)→0/1`，180ms；`data-width-mode` / `data-align-mode` 控制换行与对齐。API：`createFeatureHint()` → `{element, dismiss, isDismissed, setVisible, updateLanguage}`。 |
| **Favicon 视图** | `shared/favicon-view-core.js` | `ui-components.css` `.l-favicon` | 三级降级链：图片 → 首字母瓦片 → 虚线占位；`data-load-state`/`data-state` 控制，尺寸由 `--favicon-size` 驱动。API：`createFaviconViewCore()` → `createImage / setFaviconLoadState / setFallbackNodeVisible / setFaviconSrcWithAnimation / restoreWorkingFaviconOrFallback / warmIconCache …` |
| **Page notice（页面横幅）** | `newtab/page-notice.js` | `ui-components.css` `.l-notice` | 图标 + 文案 + 主按钮 + 关闭；`l-notice-in` 220ms 上浮淡入。API：`renderPageNotice()` → `{dismiss()}`。 |
| **Suggestion row（建议行）** | `overlay/suggestions-view.css` + `shared/suggestion-action-model.js` | `ui-components.css` `.l-suggestion` | 左（favicon + 标题`<mark>`高亮 + 路径）右（动作标签 + 键帽 / 访问按钮）；激活态 `rgba(37,99,235,.1)` 且图标 `0 0 0 2px rgba(37,99,235,.28)` 聚焦环。动作决策层：`createSearchActionModel()` 输出 `actionTags / visitButtonAction / hasActionTags`。 |
| **Feature card（功能卡）** | `onboarding.html` `.feature-card` | `ui-components.css` `.l-feature-card` | 298×222、radius 12px；`::before` 三重径向渐变着色（`--accent-rgb`，pip `#2563eb` / newtab `#0f766e`），`::after` inset 高光+暗边；入场 560ms `--feature-card-delay = 260 + i*90ms`。 |
| 新标签页栅格/布局 | `newtab/layout.js` | —（参考不内置） | `getAdaptiveGridColumnCount` / `getResponsiveContentWidth` / `updateBottomDockLayout` 自适应列数与底部 dock 高度计算。 |
| Toast | `newtab/toast.js` | —（参考不内置） | `createToastController` `show/hide/destroy`，`data-show` 控制显隐与自动消失。 |

> 说明：`newtab/layout.js`、`newtab/toast.js`、`newtab/dock.js` 属“应用逻辑”而非“设计组件外观”，故仅列出可复用算法/API，未并入组件样式库；其视觉样式可通过在源码 DOM 上套用本库 `.l-*` 类获得一致观感。
> `suggestion-action-model.js` 是纯决策逻辑（无视觉），已作为“建议行”的动作层一并归档。

---

## 2. 引导页（onboarding）效果复刻指南

### 2.1 架构（对应 `onboarding.js` + `onboarding-content.js`）

- **Blueprint（数据）**：`onboarding-content.js` 的 `getOnboardingBlueprint(locale)` 返回 `{ slides: [...], runtimeCopy, shell }`。每屏 `slide` 含 `copy`（eyebrow/title/titleLines/titleLogo/titleCycle/body）、`visualKind`、`interactionRows/Kinds`、`actions`、`cursor`。复刻版内置了同构的 `BLUEPRINT`。
- **State（状态机）**：`reduceOnboardingState(state, {type:'NEXT'|'PREV'|'GOTO'|'HOME'|'END'})` 返回 `{index, previousIndex, direction, count}`，`direction` 为 `forward|back|none`。
- **Render（渲染）**：`commit(state)` 把 `slide.id/index/direction/cursorReady/visualVisible` 写到 shell 的属性上——**CSS 正是读这些属性驱动动画**（复刻版完全沿用同一套 `data-*` 属性协议）。

### 2.2 切换动画时间线（精确还原）

以“前进一屏”为例，`dispatch` → `reduceOnboardingState` → `animateCopySwap`：

1. **Phase 1 · 退场（exit）**：给 `.title` / `.body` 加 `.t-copy-swap` 与 `.is-exit`（translateY `-8px` + blur `2px` + opacity 0）。持续 `--text-swap-dur`（**200ms**，可用 `--text-swap-dur` 覆盖）。
2. 若离开 `bookmark-focus` 进入 `lumno-web-wordmark`，给 `.visual-stage` + `.cursor-layer` 加 `.is-visual-exit`（190ms `visual-blur-exit` 模糊淡出）。
3. **`setTimeout(200ms)`** 后：`commit(next)` 真正换 DOM 文本；随后给新 `.title`/`.body` 加 `.t-copy-swap` + `.is-enter-start`（瞬时置于入场前状态），强制 reflow（`void el.offsetHeight`），再移除 `is-enter-start` → 播放入场过渡。
4. 视觉面板每次 `renderVisual` 都**重新挂载**，故各 surface 根类的入场 `@keyframes`（`nt-rise` / `fc-in` / `ss-in` / 蝴蝶 `butterfly-flutter` 等）自动重放。

> 后退（back）走同一状态机，仅 `data-direction` 不同（源码中方向用于偏移方向，复刻版已保留属性，可按需扩展方向差异化过渡）。

### 2.3 标题旋转词（intro 屏）

- `renderTitleCycle` 渲染 `prefix + .title-rotator(.t-resize)[data-tone] > .title-rotator__text(.t-text-swap) + .title-rotator__measure`。
- 首次延迟 `TITLE_CYCLE_FIRST_DELAY_MS = 520ms`，之后每 `TITLE_CYCLE_INTERVAL_MS = 1900ms` 切换。
- 切换：`is-exit` 退场 → 200ms 后改 `data-tone` + 文本 + 用 `measure` 节点测宽并 `rotator.style.width` 平滑改变 → `is-enter-start` 入场。
- 四套 tone 配色（bookmark/history/top-sites/settings）见 `ui-components.css` `.title-rotator[data-tone=...]`。

### 2.4 分段进度条（page-strip）

- `renderPageStrip`：第 0 屏隐藏；离开第 0 屏首次出现时置 `data-entering="true"` 触发整条+逐段 stagger 入场；每段 `--i` 决定延迟，`data-active` 标记当前段；点击段 → `GOTO`。

### 2.5 交互行（4 类，非只有手风琴）

`onboarding-content.js` 里 5 屏的交互行**并不只有手风琴**，完整类型如下（v2 复刻版已全部实现）：

| 屏 | 行类型 | 内容 |
|---|---|---|
| intro | `trust-row` | 图标 + 文案 + **linkButton**（GitHub repo 外链胶囊） |
| intro | `browser-row` | 图标 + 「Works in」+ **重叠浏览器头像组**（Chrome/Edge/Dia/Comet）+ infoTooltip |
| intro | `compatibility-row` | 图标 + 文案 + **infoTooltip**（hover 显示兼容性说明） |
| setup | `accordion-row` ×2 | `dia-browser`（Dia 快捷键需改 Global）、`local-file-search`（文件 URL 权限） |
| search | `segmented-control` + `inline-action` | **灰色骨架行**（`skeleton-line--label` 168px + `--meta` 96px）而非文字 |
| newtab | `choice-list` + `inline-action` | 同上，骨架行 |
| finish | — | 无交互行 |

手风琴机制：点击 `.interaction-accordion-trigger` 翻转 `data-expanded` 与 `.interaction-accordion-panel[data-open]`，面板 `grid-template-rows:0fr→1fr`（220ms ease），chevron `rotate(-90deg)`。

### 2.6 演示光标（含跨屏连续性）

- `renderVisual` 时设置 `cursorLayer[data-cursor-enabled]` 与 `[data-cursor-mode]=slide.id`。**轨迹本身是 CSS `@keyframes`**，JS 只切 layer 开关与模式。真实关键帧与时长：

| 屏 | keyframes | 时长 / 延迟 |
|---|---|---|
| intro | `onboarding-cursor-logo-wander` | 8600ms ease-in-out，delay 180ms，infinite |
| setup | `onboarding-cursor-type` → `onboarding-cursor-hover-loop` | 2600ms delay 1640ms（both）→ 9600ms linear delay 4240ms infinite |
| search | `newtab-triangle-loop` | 4060ms linear，delay 1500ms，infinite |
| newtab | `site-search-idle` | 7200ms，delay 120ms，infinite |
| finish | `idle-drift` | 7200ms，delay 120ms，infinite |

- **跨屏连续性（v2 新增）**：`captureCursorTransitionStart(next)` 在 200ms 退场后、commit 前执行，仅对 `intro→setup / setup→search / search→newtab / newtab→finish` 正向切换生效。它读取当前 `.demo-cursor` 的 computed `left/top`，换算成 `cursorLayer` 宽高的百分比（clamp 0–100），写入 `#onboarding-root` 的三个内联变量：`--onboarding-cursor-transition-left`、`--onboarding-cursor-transition-top`（`toFixed(2)` + `%`）、`--onboarding-cursor-transition-transform`。新屏关键帧的 `0%` 段用 `var(--onboarding-cursor-transition-left, <fallback>)` 承接，实现光标“不跳变”。反向切换或 `reduce-motion` 时 `clearCursorTransitionStart()` 清除。

### 2.7 视觉面板（5 类 surface，真实结构）

| visualKind | 真实结构 | 关键动画与时长 |
|---|---|---|
| `lumno-web-wordmark-surface` | `.logo-wordmark-wrap`（`--wordmark-width: clamp(188px,28vw,260px)`，高 `w*47/165`）+ 文字 logo SVG + `.logo-butterfly-stage`（left `w*152/165`、top 6px、`w*20/165 × w*22/165`、`rotate(-4deg)`、`origin 24% 77%`），内含前/后两翼（opacity .22 / .34）+ `.seo-wordmark-text`（1px 隐藏 SEO 文本） | 翅膀 SMIL `<animate attributeName="d" dur="2800ms">` 形变 + 前翼 `<animateTransform rotate -1.5→0>`；**无入场动画、无 hover loop** |
| `bookmark-focus-surface` | `.bookmark-focus-ui > .browser-window-clip > .browser-window`（故意放大到 176%×162% 再裁切）含 `.browser-bar`（红绿灯/标签/地址栏/操作点）+ 页面骨架（hero 标题+3 行 + 4 行列表 + 侧栏）；上层叠加 `.lumno-overlay-panel`：搜索输入（图标/文本/光标/右图标/分割线/模式徽标）+ 5 行 `.overlay-result` | browser `onboarding-browser-enter 680ms cubic-bezier(.22,1,.36,1) 80ms`；面板 `onboarding-overlay-enter 760ms cubic-bezier(.2,1,.36,1) delay 760ms`；结果容器 `onboarding-overlay-results-reveal 980ms delay 1900ms`（max-height 0→330px）；行 `onboarding-overlay-row-enter 500ms delay calc(1940ms + --result-index*170ms)`；打字字符 `calc(1640ms + --typing-char-delay)`；光标 `onboarding-caret-blink 950ms steps(2,start) infinite` |
| | **hover loop**（`startLumnoOverlayHoverLoop`） | 首次 3200ms 后激活第 0 行，之后每 1600ms 下移一行，循环回绕时多等 1600ms；切换 `data-active` / `data-emphasis` / 动作标签 `data-visible` |
| `newtab-preview-surface` | `--newtab-preview-page-scale: .84`；背景浏览器窗 + 前景页（wordmark → 搜索面板 → 建议层 → 底部 dock） | 整体 `onboarding-newtab-preview-enter 760ms cubic-bezier(.16,1,.3,1) 140ms`；各段 `onboarding-newtab-section-rise`：wordmark 520ms/310ms、搜索 560ms/420ms、建议层 560ms/560ms、dock 520ms/780ms |
| | dock 内含 3 张 `.nt-bookmark-card`（文件夹预览 4 个 favicon，各自 `rotate((i-1.5)*2deg)`）+ 4 张 `.nt-recent-card` | **hover loop**（`startNewtabPreviewHoverLoop`）：1500ms 后启动 4 步循环 `recent 1200ms → 空 520ms → bookmark 1200ms → 空 1140ms`；recent 悬浮 `rotate(-3deg) scale(1.01,1.005)`，bookmark 悬浮 `translateY(-2.5px)` |
| `site-search-demo-surface` | 2 张 `.site-search-demo-card`（`--case-delay = index*760ms`），每张含搜索条（触发词 + 逐字 prompt + 光标 + 模式前缀 + `Tab` 提示键帽）+ 分割线 + 1 行结果 | 卡片 `onboarding-newtab-section-rise 560ms delay calc(240ms + --case-delay)`；触发词退场 `site-search-demo-trigger-exit 220ms delay calc(case-delay + 2320ms)`；模式前缀 `site-search-demo-prefix-enter 300ms`；输入壳展开 `onboarding-overlay-input-shell-expand 980ms`（padding-right → `--mode-padding` 126px / AI 156px）；结果行 delay `case-delay + 3620ms`；内建延迟变量 `--tab-hint-delay:1500ms` `--mode-switch-delay:2320ms` `--prompt-type-delay:2620ms` `--results-delay:3460ms` |
| `feature-cards-surface` | 顶部 3 个 `.feature-award`（左右各一个麦穗 `onboarding-wheat.svg` 遮罩 + 两行标签）+ 下方 2 张 `.feature-card`（298×222） | award `520ms delay 180 + i*80ms`；card `560ms delay 260 + i*90ms`；卡片 `::before` 三重径向渐变着色（pip `37,99,235` / newtab `15,118,110`），`::after` inset 高光+暗边；**无 hover loop** |

### 2.8 其它细节（v2 已补齐）

- **水印**：`.onboarding-newtab-watermark`（`lumno-wordmark.svg`，opacity .16）仅 `data-active-slide="intro"` 时显示，切换时 420ms 淡入淡出。
- **titleLogo**：`createTitleLogoMark` 生成 `<img class="title-logo-mark">`（1.08em、`border-radius:.22em`、`rotate(7deg)`、蓝色 drop-shadow），附加到**标题最后一行**（intro 轮播路径下附加到**第二行**）。
- **bodyNote**：结构上存在 `#onboarding-body-note.body-note`，但 5 屏**均未设置 `note`**，故 `.body-note:empty{display:none}` 恒不显示。
- **快捷键键帽**：body 含 `{shortcut}` 时拆成 prefix / 键帽组 / suffix；多字符 token 的 `min-width = max(24, round(len*7.5+14))px`。
- **无版本徽标**：源码 `updateVersionChip()` 查询的 `#onboarding-version-text` 在 HTML 中不存在，属防御性死代码。
- **深色模式 / 减弱动效**：主题纯 CSS `prefers-color-scheme: dark` 覆盖设计令牌（含四套 tone 的深色变体）；`prefers-reduced-motion` 下 JS 用 `prefersReducedMotion()` 短路 swap / cycle / hover-loop，CSS 侧对 `.t-*`、`page-strip`、`menu-surface` 置 `transition:none`。

---

## 3. 如何使用抽取产物

**复刻引导页**：直接用浏览器打开 `onboarding-replica.html`（无需构建、无 Chrome API 依赖）。键盘 `←/→/Home/End` 翻页；可点行动按钮、分段条、手风琴、info 提示、GitHub 链接；视觉面板会自动播放打字 / 结果展开 / hover 循环。图片资源经 `../../assets/` 相对引用真实素材。

**浏览组件库**：打开 `components-gallery.html`，18 类组件均有实时演示，每段附可一键复制的 HTML/JS 片段。

**复用组件库**：
```html
<link rel="stylesheet" href="ui-components.css">
<div class="lumno-ui">
  <button class="lbtn lbtn--primary">Get started</button>
  <div class="page-strip" style="--count:4">…</div>
</div>
<script src="ui-components.js"></script>
<script>
  const tip = LumnoUI.Tooltip.createController({});
  tip.bind(document.querySelector('[data-tooltip]'));
  LumnoUI.MenuSurface.open(document.querySelector('.l-menu-surface'));
  console.log(LumnoUI.Shortcut.format('Ctrl+Shift+K')); // ⌃⇧K (Mac) / Ctrl+Shift+K
</script>
```

## 4. 抽取原则与边界

- **去扩展化**：原 `src/shared/*` 使用带 `_unique_` 后缀的全局类名（避免扩展内冲突）。抽取库统一改为语义化 `l-*` / `.lumno-ui` 作用域类，便于直接落地到其它项目。
- **保留设计保真**：颜色、圆角、阴影、缓动曲线、时长、stagger 延迟均按源码原值迁移，未做“美化改写”，以保证复刻一致性。
- **仍建议直接引用原文件（未内置）**：`newtab/layout.js`（自适应列数 / dock 高度算法）、`newtab/toast.js`、`newtab/dock.js`、`newtab/wallpaper*.js`（壁纸效果与自适应色调）、`options/options.*`（设置页整页）。它们与应用逻辑强耦合，复制不如引用。
- **可扩展**：如要完全 1:1 还原，将 `onboarding-replica.html` 的 `BLUEPRINT` 替换为 `onboarding-content.js` 的真实多语言 blueprint 即可（现有 `BLUEPRINT` 已是 `en` 的真实内容）。

---

## 5. 第二轮补充记录（相对首版的遗漏）

首版交付后经代码复核，发现并已补齐以下缺口：

| # | 首版遗漏 | 补充内容 |
|---|---|---|
| 1 | 引导页用的是**自造简化 copy**，非真实文案 | v2 内置 `onboarding-content.js` 的**真实 en blueprint**：5 屏 `id` 顺序 `intro→setup→search→newtab→finish`，真实 `titleLines` / `body` / `titleCycle` / `titleLogo` / 各屏 actions |
| 2 | 视觉面板是**简化近似**（占位方块） | v2 按真实 DOM 重建 5 类 surface，含浏览器窗口骨架裁切、overlay 面板打字+结果展开、新标签页 dock（文件夹 favicon 旋转 `(i-1.5)*2deg`）、site-search 双卡片与 Tab 提示、feature 卡片与麦穗奖项 |
| 3 | **缺演示光标跨屏连续性** | 补 `captureCursorTransitionStart()`：读取实时 `left/top` → 百分比 → 写入 `--onboarding-cursor-transition-{left,top,transform}`，关键帧 `0%` 段用 `var(..., fallback)` 承接；仅正向 4 组切换生效 |
| 4 | **缺 hover loop** | 补 overlay hover loop（首 3200ms、步进 1600ms、回绕 +1600ms）与新标签页 hover loop（首 1500ms，4 步 `1200/520/1200/1140ms`） |
| 5 | 交互行只实现了手风琴 1 种 | 补齐 4 类：`trust-row`（GitHub 链接按钮）、`browser-row`（重叠浏览器头像 + info tooltip）、`compatibility-row`（info tooltip）、`accordion-row`；并补 search/newtab 的**灰色骨架行** |
| 6 | 缺水印 / titleLogo / 键帽细节 | 补 intro 专属水印（opacity .16，420ms 淡入淡出）、`.title-logo-mark`（1.08em / rotate(7deg) / 蓝色 drop-shadow）、`{shortcut}` 键帽拆分 |
| 7 | 组件库缺 5 类组件 | 新增 **feature-hint（引导气泡）**、**favicon 视图（三级降级）**、**page notice**、**suggestion row**、**feature card**，共 18 类 |
| 8 | 组件库“只有代码、不能看” | 新增 `components-gallery.html`：实时渲染 + 一键复制代码片段 |

> 一处**源码事实更正**：首版文档称 intro 屏有 `note` 文案，实际 5 屏均未设置 `note`，`.body-note` 恒为空并 `display:none`；另外源码 `updateVersionChip()` 查询的 `#onboarding-version-text` 在 HTML 中并不存在，属防御性死代码——v2 文档已据此修正。
