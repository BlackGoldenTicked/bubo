# UI Package

## Responsibility

`packages/ui` owns reusable UI primitives, shared component helpers, and global styles that can be used by the desktop renderer.

## Key Files

- `packages/ui/src/components/ui/` - reusable primitives and shared control wrappers.
- `packages/ui/src/lib/utils.ts` - UI utility helpers.
- `packages/ui/src/styles/globals.css` - entry stylesheet: font import, base layer, and the `@import` of the token and primitive sheets.
- `packages/ui/src/styles/tokens.css` - the four style × mode token blocks (`[data-style="bubo"|"lumno"]` × light/dark) plus the compatibility aliases (`--surface-1/2/3`, `--hair*`, `--bg`, `--mono`, `--popover-shadow`).
- `packages/ui/src/styles/primitives.css` - hand-drawn component forms, every one branched on `[data-style]`.
- `packages/ui/components.json` - shadcn-style component configuration.

## Primitive Map

- `button.tsx` / `card.tsx` / `label.tsx` - layout and action primitives; the form (square vs pill, flat vs gradient, radius, press feedback) comes from CSS keyed on the active style.
- `input.tsx` / `select.tsx` / `combobox.tsx` / `checkbox.tsx` / `switch.tsx` / `segmented.tsx` - form controls, replacing the previous component-library versions.
- `modal.tsx` / `drawer.tsx` / `menu.tsx` / `notice.tsx` - overlay surfaces with portal, focus trap, and the style's own elevation and easing.
- `spinner.tsx` / `icons.tsx` - loading state and the hand-drawn glyphs used inside primitives.
- `app-icon.tsx` - the only icon surface product code should use: `AppIcon` maps semantic names
  (`dashboard`, `voice`, `eyeOff`, `income`…) onto QingIcon glyphs (Apache-2.0, `qingicon-react`),
  inherits `currentColor`, defaults to `1em`, and stays `aria-hidden` unless a `label` is passed.
  Adding an icon is a registry entry here, never a direct glyph import at a call site, so stroke,
  optical size, and accessibility stay consistent across both visual styles.
- `command.tsx` - command palette primitives based on `cmdk`.
- `kbd.tsx` - keyboard hint display.
- `scroll-area.tsx` - shared scroll area primitive.
- `simple-toast.tsx` - lightweight toast surface (Sonner, bottom-right). `notify` exposes `success`/`error`/`message`/`loading`/`dismiss` plus `action(title, { id, actionLabel, onAction })` for persistent toasts with a button.
- `lib/utils.ts` - class-name merging helper.
- `styles/*.css` - the token contract and the per-style primitive forms. Tokens cover surfaces, ink, brand and semantic colors, shape, elevation, inset highlights, and motion durations/easings. The `html` background paint prevents a first-frame flash, and a zero-specificity `:where(...):focus-visible` outline styles raw interactive elements without overriding a primitive's own focus treatment. Desktop window dragging is declared explicitly by the Tauri title-bar component rather than by global runtime-specific selectors.

## Date Surfaces

- `DateInput.tsx` is the only single-date control: it wraps HeroUI `DatePicker`/`Calendar`, stores
  `YYYY-MM-DD` strings, and takes its Chinese headings (`2026年11月`) and Monday week start from the
  `zh-CN` `I18nProvider` mounted in the renderer entry. Never re-declare those labels locally.
- `DateRangeField.tsx` is the only range control. The field itself is editable; the chevron next to
  it opens the shared quick ranges (本周 / 本月 / 上个月 / 最近一个季度 / 上个季度 / 半年 / 全年 /
  自定义) and `自定义` simply moves focus into the start segments. Shortcuts live in a `Dropdown`
  because HeroUI owns the calendar popover's open state — an outside pointer event would also close
  the surrounding modal.
- Both are style-agnostic: the popover chrome comes from HeroUI + our tokens, so bubo and Lumno
  differ only in surrounding primitives.

## Style Contract

`<html>` carries `data-style` (`bubo` = green brand, tight radius, flat hairline forms; `lumno` = blue brand, gray canvas with white cards, pill and gradient forms) and `data-theme` (`light`/`dark`). Components never branch on the style in TypeScript; only CSS does. A primitive that defines one branch renders unstyled in the other, so both branches plus the dark branch are mandatory. See [ADR 0019](../../decisions/0019-dual-visual-languages-and-drawn-primitives.md).

## Shared State And Numeric Utilities

- `.bubo-row` is the one interactive-row treatment: hover uses `--row-hover`, `aria-selected="true"`
  uses `--row-selected` plus an inset accent bar, and `:focus-visible` draws an inset outline.
  Both tokens exist in all four style × mode blocks; rows supply their own height and divider.
- `.bubo-num` sets tabular figures (and `--font-mono` via `.bubo-num--mono`) so amounts keep
  their column width as digits change. Amounts also use the `--font-mono` alias rather than a
  literal font stack.
- Motion comes from `--dur-*` / `--ease-*`: `.bubo-route-enter` replays a 6px page entrance on
  navigation, `.bubo-rec-dot` / `.bubo-busy-dot` animate live capture states, and the
  `prefers-reduced-motion` block at the end of `primitives.css` disables all of them.

## Data Flow

The renderer imports primitives from `@bubo/ui` and composes them into product-specific pages and panels under `apps/desktop/src/renderer/src`.

## Interfaces

Consumers import from `@bubo/ui`.

## Watchouts

- Keep product-specific finance logic out of this package.
- Match [design.md](../../../design.md) and the surrounding renderer style before adding new primitives.
- Do not create duplicate primitives when an existing component can be extended safely.
- Shared UI source files carry AI headers; keep header `@gotcha` notes about package-level reuse, not one-off page behavior.
