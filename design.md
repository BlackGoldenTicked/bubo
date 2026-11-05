# bubo Desktop Design System

bubo is a work-focused personal finance desktop app. The UI should feel calm, dense enough for repeated review, and clear about which finance layer the user is editing.

## Tokens

- Color: use the style tokens from `packages/ui` first. Reserve semantic colors for money direction, risk, and destructive actions. Literal whites are only for content sitting on colored fills.
- Typography: use compact headings inside panels and tables. Avoid hero-scale type in product surfaces.
- Spacing: default to the existing 4px/8px rhythm. Keep toolbars, forms, and tables stable when data changes.
- Shape: radius, elevation, borders, and motion come from style tokens (`--radius-*`, `--shadow-*`, `--dur-*`, `--ease-*`). Do not hardcode a radius per component; the bubo style stays tight (8px or less) while the Lumno style is rounder by token.

## Layout

- The app is a desktop workbench first. Prefer predictable navigation, scan-friendly tables, and side/detail panels over marketing-style sections.
- Keep primary routes in one persistent top tab bar; feature pages must not repeat or float
  their own navigation controls.
- Reserve a dedicated title-bar drag band above the route tabs. Keep the tab row aligned to the
  overview content inset instead of shifting the whole navigation around macOS traffic lights.
- On the overview, keep cross-layer summaries in a left workbench and past cashflow in a
  separate right-hand table so proximity never implies reconciliation.
- Repeated finance items belong in tables, lists, or compact cards. Avoid cards nested inside cards.
- Fixed-format controls such as nav items, icon buttons, tabs, and counters need stable dimensions so hover/loading states do not shift layout.

## Components

- Reuse components from `packages/ui` and local renderer UI before creating new primitives.
- Common controls (buttons, inputs, selects, comboboxes, checkboxes, switches, tabs, modals, drawers, menus, tooltips) come from the `packages/ui` primitives, not from a component library. Their form is CSS-driven per `[data-style]`, so one primitive must render correctly in both bubo and Lumno.
- Formatting and appearance must never be overridden per call site (for example inline `borderRadius`); those overrides break the other style. See [ADR 0019](docs/decisions/0019-dual-visual-languages-and-drawn-primitives.md).
- In renderer UI, prefer Tailwind utility classes for layout, spacing,
  typography, borders, radius, shadows, and token colors. Use inline `style` only
  for dynamic runtime values, chart-library prop objects, or CSS values that
  Tailwind cannot express cleanly.
- Use icons for common actions such as add, edit, delete, save, download, search, and navigation.
- Forms should expose loading, empty, error, dirty, and success states where the workflow needs them.
- Destructive actions need confirmation when they can remove user-entered financial data.

## Interaction

- Keep the three bubo layers visible in language and placement: cashflow, assets, and obligations are related but independent.
- Do not imply reconciliation when the product model does not require it.
- Use concise labels. Avoid in-app explanatory text about implementation details or shortcuts.

## Accessibility

- Preserve keyboard reachability for navigation, dialogs, and row/detail workflows.
- Maintain visible focus styles and semantic labels on icon-only controls.
