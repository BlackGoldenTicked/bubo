# Dual Style Themes - bubo And crx-ui (Lumno)

- Date: 2026-09-22
- Related spec: none
- Supersedes: `2026-09-22-theme-switching.md` (that plan ported only the crx-ui
  dark palette; this one ports the crx-ui design language and keeps both styles)

## Context

The `crx-ui/` reference library (Lumno) is a complete design language, not a
palette: neutral page/surface layering, translucent borders, multi-layer
`--shadow-shell`, pill buttons with gradient + inset highlight and an
`:active` press, gradient popover surfaces with a spring easing, and 18
component classes with shared motion tokens. The shipped dark theme only copied
its color values into `[data-theme="dark"]`, so the app still renders the old
bubo component forms in dark colors.

User decisions for this work:

1. **Two independent styles, switchable, never mixed** - bubo (green brand,
   current flat/hairline forms) and Lumno (crx-ui blue brand, pill/gradient/
   elevated forms) each keep their own light and dark variant.
2. **Full hand-drawn component replacement** - the renderer stops depending on
   HeroUI; every control becomes a `packages/ui` primitive whose form is driven
   by the active style.

Current scale: 38 files import `@heroui/react` (Button 17, Input 11, Modal 9,
DateField 4, Tabs 3, Calendar 3, Select/Drawer/ListBox/Label 2 each,
DatePicker/DateRangePicker/RangeCalendar/ComboBox/Switch/Dropdown 1 each),
across 14 routes and 10 feature folders.

## Approach

### Theme state becomes two-dimensional

```
themeStyleAtom     : "bubo" | "lumno"            persisted as bubo.style
themePreferenceAtom: "light" | "dark" | "system" persisted as bubo.theme
                   → <html data-style="lumno" data-theme="dark">
```

`resolveTheme` stays pure and gains a sibling `resolveStyle`; `useThemeEffect`
writes both dataset keys and still maps only the resolved mode to the native
window via Tauri `setTheme`. The `index.html` pre-paint script applies both
keys so neither style nor mode flashes.

### One React primitive, two CSS forms

Primitives render stable semantic class names (`bubo-btn`, `bubo-card`,
`bubo-field`, `bubo-pop`); all form differences live in CSS keyed on
`[data-style="bubo"]` / `[data-style="lumno"]`. No component branches on the
active style in TypeScript, so the two styles cannot drift apart in behavior
and stay independently editable.

### Token layer with a compatibility alias

Both styles publish the same semantic token names, so pages never hardcode a
style:

- surfaces: `--page-bg`, `--surface`, `--surface-soft`, `--surface-border`
- ink: `--ink`, `--ink-2` … `--ink-5`
- brand/semantic: `--accent`, `--accent-foreground`, `--accent-soft`,
  `--danger`, `--success`, `--green`, `--red`, `--amber`
- shape/elevation: `--radius-sm|md|lg|pill`, `--shadow-shell`, `--shadow-pop`,
  `--inset-highlight`, `--inset-shade`
- motion: `--dur-fast|base|slow`, `--ease-out`, `--ease-spring`

The existing `--surface-1/2/3`, `--hair`, `--hair-2/3`, `--bg`, `--mono`,
`--popover-shadow` names stay as **aliases** assigned inside each style block.
That keeps all 38 currently-styled files rendering correctly from phase 1 and
lets later phases migrate them to the semantic names without a big-bang rewrite.

Style values:

| token              | bubo light | bubo dark | lumno light                            | lumno dark                          |
| ------------------ | ---------- | --------- | -------------------------------------- | ----------------------------------- |
| `--page-bg`        | `#ffffff`  | `#111111` | `#f3f5f7`                              | `#111111`                           |
| `--surface`        | `#ffffff`  | `#191919` | `#ffffff`                              | `#191919`                           |
| `--surface-soft`   | `#f7f9f7`  | `#202020` | `#f8fafc`                              | `#202020`                           |
| `--surface-border` | `#e6eae6`  | `#2d2d2d` | `rgba(17,24,39,.1)`                    | `rgba(255,255,255,.12)`             |
| `--accent`         | `#14794a`  | `#2fa36c` | `#2563eb`                              | `#5b9bff`                           |
| `--radius-lg`      | `8px`      | `8px`     | `12px`                                 | `12px`                              |
| `--shadow-shell`   | none       | none      | `0 32px 64px -34px rgba(15,23,42,.22)` | `0 34px 68px -34px rgba(0,0,0,.56)` |

## Files And Modules

- `packages/ui/src/styles/globals.css` - becomes the entry: font import, base
  layer, `@import` of the token and primitive sheets.
- `packages/ui/src/styles/tokens.css` - new: four style × mode token blocks
  plus the compatibility aliases.
- `packages/ui/src/styles/primitives.css` - new: hand-drawn component styles
  with `[data-style]` form branches (button, card, field, checkbox, switch,
  select, tabs, pop, tooltip, notice, keycap, table skin).
- `packages/ui/src/components/ui/*.tsx` - new primitives: `button`, `card`,
  `input`, `textarea`, `checkbox`, `switch`, `select`, `combobox`, `listbox`,
  `modal`, `drawer`, `tooltip`, `menu`, `tabs`, `spinner`, `notice`, `keycap`,
  `datepicker`, `calendar`.
- `packages/ui/src/lib/popover.ts` - new: positioning/flip/clamp helper ported
  from `crx-ui/ui-components.js` (Tooltip + MenuSurface behavior).
- `packages/ui/src/index.ts` - export the new primitives.
- `apps/desktop/src/renderer/src/lib/state/uiAtoms.ts` - add `themeStyleAtom`
  and the `ThemeStyle` type.
- `apps/desktop/src/renderer/src/lib/theme.ts` - `resolveStyle`, apply
  `data-style`, extend tests.
- `apps/desktop/src/renderer/index.html` - pre-paint script applies style too.
- `apps/desktop/src/renderer/src/settings/components.tsx` - re-point `Toggle`
  and `SegTabs` at the new primitives.
- `apps/desktop/src/renderer/src/settings/SettingsPage.tsx` - add an
  `界面风格` row (bubo / Lumno) next to the existing `主题` row.
- `apps/desktop/src/renderer/src/components/layout/{Shell,TitleBar,TopNavigation}.tsx`
  - page/surface layering and nav form per style.
- 38 HeroUI-consuming files - migrate to the new primitives (phases 2-4).
- `design.md`, `docs/modules/ui/README.md`, `docs/modules/desktop/README.md`,
  `docs/decisions/00NN-dual-style-themes.md` - sync the radius rule, the
  "prefer HeroUI" rule, and the new theme contract.

## Tasks

Status: phase 1 and phase 2 landed in `9f34745` (token layer, alias
compatibility, theme/style state, settings style row, and the hand-drawn
button/card/field/checkbox/switch/select/combobox/menu/modal/drawer/notice/
spinner/segmented primitives with settings as the migrated pilot surface).
Phases 3-5 are open; see
[ADR 0019](../decisions/0019-dual-visual-languages-and-drawn-primitives.md).
Checkboxes below are ticked as each phase closes.

### Phase 1 - theme architecture and tokens

1. [ ] Split `globals.css` into entry + `tokens.css`; write the four
       style × mode blocks and the alias layer.
2. [ ] Add `themeStyleAtom` / `ThemeStyle` / `resolveStyle`; extend
       `useThemeEffect` to write `data-style`; update the `index.html`
       pre-paint script.
3. [ ] Add the `界面风格` settings row; extend `theme.test.ts` and
       `uiAtoms.test.ts`.
4. [ ] Verify: switching style + mode renders all four combinations with no
       flash and no layout shift; existing pages keep their current look under
       `data-style="bubo"`.

### Phase 2 - hand-drawn primitives (no HeroUI)

5. [ ] `button` / `icon-button` (pill + gradient + inset highlight + press in
       Lumno; square + flat in bubo), `card`, `spinner`, `keycap`, `notice`.
6. [ ] `input` / `textarea` / `field` / `label`, `checkbox`, `switch`,
       `select`, `combobox`, `listbox`, `tabs`.
7. [ ] `popover.ts` + `tooltip`, `menu`, `modal`, `drawer` (portal, focus
       trap, spring easing, translucent gradient surfaces).
8. [ ] `primitives.css` form branches for every primitive; migrate
       `settings/components.tsx` and the shared `components/ui/*` wrappers.
9. [ ] Verify: each primitive in a gallery route across all four
       style × mode combinations, keyboard reachable, ARIA intact.

### Phase 3 - shell, navigation, pages

10. [ ] `Shell` / `TitleBar` / `TopNavigation`: page-bg vs surface layering,
        nav form per style, drag regions preserved.
11. [ ] Migrate the 14 routes and their feature folders off HeroUI onto the
        primitives; keep table/panel rhythm stable.
12. [ ] Charts: tooltip, grid, and series colors read style tokens.
13. [ ] Verify: every route in all four combinations; no HeroUI imports left
        outside phase 4 controls.

### Phase 4 - date controls

14. [ ] `calendar` / `datepicker` / `date-range-picker` hand-drawn (keyboard
        navigation, month paging, range selection, locale formatting).
15. [ ] Verify parity with the replaced HeroUI behavior in imports, budget,
        loans, and analysis filters.

### Phase 5 - cleanup and docs

16. [ ] Remove the `@heroui/*` dependencies; confirm the bundle and sidecar
        still build.
17. [ ] Update `design.md` (radius rule, component rule, style contract),
        module READMEs, and add the ADR.
18. [ ] Full verification and a manual pass of both styles.

## Risks

- **Scale**: phases 2-4 touch nearly every renderer file. Mitigation: the alias
  token layer keeps pages correct after phase 1, and each phase ends in a
  runnable, verified state.
- **Behavior regressions** from dropping HeroUI (focus trap, typeahead select,
  calendar keyboard model). Mitigation: phase 4 is isolated and verified
  against the flows that use it; `popover.ts` is ported from the reference
  behavior library rather than reinvented.
- **design.md conflict**: the current rules say "prefer HeroUI" and "8px radius
  or less". Both must be rewritten in phase 5 (radius becomes a style token),
  and `scripts/check-architecture.mjs` may need the new `packages/ui` files
  allow-listed.
- **Two styles drifting**: a primitive styled only for one style silently
  renders unstyled in the other. Mitigation: every primitive class must define
  both branches, checked by a gallery route review in phase 2.
- **Native window**: Tauri `setTheme` only carries light/dark; the style
  choice is DOM-only and must not leak into window chrome expectations.

## Verification

1. `pnpm check-types`, `pnpm lint`, `pnpm test`, `pnpm build`,
   `node scripts/check-docs.mjs`, `node scripts/check-architecture.mjs`
   after every phase.
2. Manual in `pnpm dev`: all four combinations (bubo/lumno × light/dark) on
   every route; restart with each stored combination to confirm no flash;
   keyboard-tab through nav, tables, modals, and forms; confirm traffic lights
   and window chrome follow the mode.
3. Phase gate: no `@heroui` import remains after phase 4.

## Out Of Scope

- Per-ledger or per-page themes, custom accent pickers, high-contrast variants.
- Porting the crx-ui onboarding animations (page strip, title rotator, demo
  cursor) - those are marketing surfaces, not product UI.
- Mobile (`apps/mobile`) and web (`apps/web`) styling.
