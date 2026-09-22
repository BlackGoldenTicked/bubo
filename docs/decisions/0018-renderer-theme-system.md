# 0018. Renderer Theme System With Dark Mode

- Status: Accepted
- Date: 2026-09-22

## Context

The renderer shipped a single light palette. HeroUI v3 already carries a full
`[data-theme="dark"]` token set, but nothing activated it; bubo's own tokens
(`--ink-*`, `--hair-*`, `--surface-2/3`) lived only in `:root`, and ~25 files
hardcoded `bg-white`/`"white"` page surfaces. The `crx-ui/` reference library
(Lumno) demonstrated the token-override dark pattern and neutral gray scale
(page `#111111`, surface `#191919`, soft `#202020`), but could only follow the
OS — no manual switching.

## Decision

- The theme contract is HeroUI's own attribute: `document.documentElement`
  carries `data-theme="light" | "dark"`. HeroUI's ~68 dark selectors switch
  every semantic component token for free; bubo re-declares its brand and
  custom tokens inside a `[data-theme="dark"]` block in
  `packages/ui/src/styles/globals.css` because unlayered `:root` overrides
  beat HeroUI's `@layer theme` values.
- The dark palette uses the crx-ui neutral scale (`#111111` page,
  `#191919` surface, `#202020` soft) with bubo brand colors lifted for
  contrast (accent `#2fa36c`, danger `#dd6b55`, amber `#d6a54e`).
- Preference is stored as `bubo.theme` (`light | dark | system`, default
  `system`) through `themePreferenceAtom` in `lib/state/uiAtoms.ts` and
  applied by `useThemeEffect` in `lib/theme.ts`, which also follows live OS
  changes while `system` and syncs the native window via Tauri `setTheme`
  (`null` keeps macOS following the OS).
- A pre-hydration script in `renderer/index.html` applies the stored
  preference before first paint so dark mode never flashes white; `html`
  paints `--surface-1`.
- Page surfaces, chart tooltips/popovers, sticky headers, and inputs use
  `--surface-1`; the repeated popover shadow is `--popover-shadow`. Colors
  that sit on colored fills (badge text, treemap labels) stay literal.

## Rationale

Using HeroUI's `data-theme` contract avoids re-implementing component theming:
every HeroUI control (Switch, Modal, Tabs, calendar) responds with zero
component changes. Re-declaring bubo tokens in the dark block is required
because CSS cascade layers do not participate in the unlayered `:root`
comparison — without it the light accent would leak into dark. The inline boot
script is the only way to avoid a light flash before React mounts, and
`setTheme(null)` keeps the macOS title bar honest in `system` mode.

## Consequences

- New surfaces must use tokens (`--surface-1` for page/panel faces) instead
  of `bg-white`; literal whites are reserved for content on colored fills.
- Any new bubo token must be defined for both `:root` and
  `[data-theme="dark"]`.
- Manual theme changes go through `themePreferenceAtom` only; the boot script
  in `index.html` and `useThemeEffect` both read the same storage key and
  must stay in sync.
- `resolveTheme` stays pure so theme resolution is unit-testable without a
  DOM or matchMedia mock.
