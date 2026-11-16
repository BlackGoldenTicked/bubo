# Dark Theme with Settings Switching

## Context

bubo ships a single light palette: brand tokens live in `:root` of
`packages/ui/src/styles/globals.css`, HeroUI v3 already ships a full
`[data-theme="dark"]` token set that nothing activates, and the renderer
hardcodes `bg-white`/`"white"` page surfaces across ~25 files. The `crx-ui/`
reference library (Lumno) demonstrates the token-override dark pattern the
user wants to adopt — neutral gray scale (page `#111111`, surface `#191919`,
soft `#202020`, inverted `rgba(255,255,255,.12)` borders) — but it can only
follow the OS via `prefers-color-scheme` and cannot be switched manually.

## Scope

1. Token layer — add a page-surface token `--surface-1` (light `#ffffff`) and
   a `[data-theme="dark"]` override block in
   `packages/ui/src/styles/globals.css`: crx-ui neutral grays plus dark-mode
   brand colors (accent and semantic colors lifted for contrast).
2. Theme state — `themePreferenceAtom` (`light` | `dark` | `system`, persisted
   as `bubo.theme`) in `lib/state/uiAtoms.ts`, and a new `lib/theme.ts` with a
   pure `resolveTheme` helper plus a `useThemeEffect` hook that writes
   `data-theme` on `<html>`, listens to `prefers-color-scheme` while the
   preference is `system`, and syncs the native window appearance via Tauri
   `setTheme`.
3. No-flash boot — inline pre-hydration script in `index.html` that applies
   the stored preference before first paint.
4. Settings UI — a `主题` row in the 显示偏好 group with a three-way `SegTabs`
   (浅色 / 深色 / 跟随系统).
5. Surface cleanup — replace `bg-white`/`"white"`/chart tooltip whites with
   `--surface-1`, and lift the repeated chart popover shadow into a
   `--popover-shadow` token.

## Decisions

- Use HeroUI's own `[data-theme="dark"]` contract instead of a custom class:
  the library already switches every semantic token (~68 selectors), so all
  HeroUI components follow for free.
- bubo brand tokens must be re-declared inside `[data-theme="dark"]`:
  unlayered `:root` overrides beat HeroUI's `@layer theme`, so the light
  accent would otherwise leak into dark mode.
- The dark palette adopts the crx-ui neutral grays (user choice); the brand
  green stays the accent, lifted to a dark-readable value.
- Window appearance syncs through `core:window:allow-set-theme`; the `system`
  preference maps to `setTheme(null)` so macOS keeps following the OS.
- Keep the `--bg: transparent` shell token untouched; give `html` the
  `--surface-1` background so the first dark frame never flashes white.

## Verification

1. `pnpm format:check`, `pnpm check-types`, `pnpm lint`, `pnpm build`.
2. `NODE_OPTIONS=--no-experimental-webstorage pnpm test` — new `resolveTheme`
   and atom tests plus existing suites.
3. `node scripts/check-docs.mjs`.
4. Manual (dev app): switch all three modes in Settings; restart with dark
   stored and confirm no white flash; scan page surfaces in dark (tables,
   charts, modals, settings); confirm traffic lights follow.

## Out Of Scope

- Porting crx-ui component styles into bubo (bubo keeps its HeroUI-based
  design system; crx-ui is the palette reference).
- High-contrast variants, custom accent colors, or per-ledger themes.

## Outcome

Implemented on 2026-09-22 (`docs/decisions/0018-renderer-theme-system.md`).

- Verification: `pnpm check-types` 7/7, `pnpm build` 7/7, `pnpm test`
  19 files / 114 tests passed (including new `theme.test.ts` and the
  extended `uiAtoms.test.ts`), `node scripts/check-docs.mjs` all checks
  passed, `node scripts/check-architecture.mjs` OK, `pnpm format:check`
  clean for every touched file.
- Baseline noise unrelated to this work: `pnpm lint` reports 2 warnings
  from the untracked `crx-ui/ui-components.js` reference file, and
  `pnpm format:check` still flags the pre-existing baseline files plus the
  same untracked `crx-ui/` folder.
- Manual acceptance still pending in the dev app: switch all three modes in
  Settings, restart with dark stored to confirm no white flash, scan dark
  surfaces (tables, charts, modals, settings), and confirm the traffic
  lights follow the window theme.
