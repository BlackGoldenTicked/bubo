# 0019. Dual Visual Languages And Hand-Drawn Primitives

- Status: Accepted
- Date: 2026-09-22

## Context

ADR 0018 shipped a light/dark theme by copying the `crx-ui/` reference palette
into `[data-theme="dark"]`. That left the reference library's actual design
language untouched: the app still rendered bubo's flat hairline forms in dark
colors. The reference (`crx-ui/`, product name Lumno) is a full visual system —
gray canvas with floating white cards, translucent borders, multi-layer
`--shadow-shell`, pill buttons with gradient plus inset highlight and an
`:active` press, spring-eased popovers, and shared motion tokens.

Two constraints made a palette-only answer wrong:

1. The user wanted to compare and keep both looks, not replace one with the
   other: bubo (green brand, flat) and Lumno (blue brand, elevated), each with
   its own light and dark variant.
2. HeroUI v3 could not express both forms from one component tree without
   per-style overrides scattered across 38 consuming files.

## Decision

- **Two independent visual languages, never mixed.** `<html>` carries
  `data-style="bubo" | "lumno"` (persisted as `bubo.style`) alongside
  `data-theme="light" | "dark"` (persisted as `bubo.theme`). Four combinations
  must each be complete: a surface styled for one style must also define the
  other branch.
- **One React primitive, two CSS forms.** Controls live in
  `packages/ui/src/components/ui/*` and emit stable semantic classes
  (`bubo-btn`, `bubo-card`, `bubo-field`, `bubo-pop`). All form differences live
  in `packages/ui/src/styles/primitives.css` keyed on `[data-style=...]`. No
  component branches on the active style in TypeScript, so behavior cannot drift
  between styles.
- **Token layer with a compatibility alias.** `packages/ui/src/styles/tokens.css`
  publishes the same semantic names per style and mode (`--page-bg`,
  `--surface`, `--surface-soft`, `--surface-border`, `--ink-1..5`, `--accent`,
  `--radius-*`, `--shadow-shell`, `--shadow-pop`, `--inset-*`, `--dur-*`,
  `--ease-*`). The pre-existing names (`--surface-1/2/3`, `--hair*`, `--bg`,
  `--mono`, `--popover-shadow`) survive as aliases assigned inside each block so
  untouched pages keep rendering during migration.
- **The renderer stops depending on HeroUI.** Common controls, including date
  pickers and calendars, become `packages/ui` primitives. The `@heroui/*`
  dependencies are removed once the migration completes.
- **The native window takes only the mode.** Tauri `setTheme` is driven by the
  resolved light/dark value; the style choice is DOM-only and must not be
  expected to change window chrome.

## Rationale

A single primitive tree with CSS-driven forms is the only version that keeps the
two languages independently editable without forking components or duplicating
behavior (focus traps, typeahead, keyboard models). The alias layer decouples the
architecture change from the mechanical, high-risk part of the migration, so
each phase can end in a verified, runnable state.

## Consequences

- `design.md` and [conventions](../conventions.md) no longer say "prefer
  HeroUI" or "8px radius or less". Radius, elevation, border, and motion come
  from style tokens; hand-drawn primitives are the default for shared controls.
- Any new control must ship both `[data-style]` branches plus a dark branch.
  A missing branch renders unstyled rather than falling back to a library
  default.
- Inline `style={{ borderRadius: 5 }}` and similar overrides defeat the pill
  form under Lumno; use token-driven classes instead.
- New semantic tokens are declared in all four style × mode blocks in
  `tokens.css`, not in `:root`.
- `scripts/check-architecture.mjs` may need new `packages/ui` files
  allow-listed as the primitive surface grows.

## Migration Status

Plan: [2026-09-22-dual-style-themes.md](../plans/2026-09-22-dual-style-themes.md).
Landed in `9f34745`:

- Phase 1 (theme state, `tokens.css`, alias layer, settings style row) — done.
- Phase 2 (button/card/field/checkbox/switch/select/combobox/menu/modal/drawer/
  notice/spinner/segmented primitives and their CSS branches) — done; settings
  surface migrated as the visual pilot.

Open:

- Phase 3 (shell, navigation, 14 routes, charts) and phase 4 (calendar,
  date picker, range picker). 27 renderer files still import `@heroui/react`.
- Phase 5 (remove `@heroui/*` dependencies, final doc pass).
