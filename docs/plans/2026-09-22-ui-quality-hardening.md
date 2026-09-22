# UI Quality Hardening: Dead Code, Feedback, A11y, Query States

## Context

A code-level review of the renderer found four classes of UI debt that the
visual design hides: dead/unwired infrastructure (an unused i18n layer, unused
command-panel atoms, dead settings rows, an undefined `--mono` token), missing
failure feedback (only one `onError` in the whole renderer, `ConfirmModal`
swallows rejections, queries render `¥0` on error), accessibility gaps (a
hand-rolled `div` toggle, no focus styles outside HeroUI internals), and
consistency debt (Settings page built from ~50 inline styles, three page
container conventions, no shared loading/error/empty states).

## Scope

1. P0 - Remove dead code: i18n layer (`i18n.ts`, `locales/`, its test,
   `.i18nrc.json`, `i18n:sync` script and `i18next`/`react-i18next`/
   `@lobehub/i18n-cli` deps), unused dashboard/command atoms in `uiAtoms.ts`,
   the three no-op settings rows, and define the missing `--mono` token.
2. P1.5 - Report every mutation failure through one global path: a
   `MutationCache.onError` handler that toasts via `notify.error`, with a
   shared `reportActionError` helper so `ConfirmModal` rejections surface once
   instead of becoming unhandled rejections.
3. Accessibility - Replace the hand-rolled settings `Toggle` with HeroUI
   `Switch` (keyboard reachable, `role="switch"`), and add a zero-specificity
   global `:focus-visible` outline so raw links/buttons without HeroUI classes
   show a visible focus ring.
4. Query states - Add `QueryState` (pending skeleton / error + retry / ready)
   and `EmptyState` primitives, and adopt them in the main list pages and
   detail panels so loading, failure, and empty are distinguishable.
5. Settings page - Convert the inline-style-heavy `SettingsPage.tsx` to the
   Tailwind plus `settings/components.tsx` conventions used elsewhere.

## Decisions

- Delete the i18n layer rather than wire it: bubo is a local-first zh-CN
  desktop app and the untranslated layer has been dead since it was added.
- Define `--mono` in `packages/ui/src/styles/globals.css` instead of editing
  its 11 call sites; the token is already used by loans, loan detail, and
  settings surfaces.
- Mutation failures toast globally; query failures stay inline via
  `QueryState` (a failing sidecar would otherwise fire one toast per query).
- The global focus rule uses `:where(...)` (zero specificity) so HeroUI's own
  `outline-style: none` focus-ring classes keep winning; only raw elements get
  the outline.
- `QueryState` accepts a structural query shape (`isPending` / `isError` /
  `error` / `refetch`) so it stays decoupled from TanStack Query internals.

## Verification

1. `pnpm format:check`, `pnpm check-types`, `pnpm lint`, `pnpm build`.
2. `NODE_OPTIONS=--no-experimental-webstorage pnpm test` (Node 26 workspace
   quirk) - trimmed `uiAtoms` test plus existing suites stay green.
3. `node scripts/check-docs.mjs` - no new hard failures.
4. Manual: with the dev app running, toggle amounts in Settings (keyboard
   focusable), trigger a failing mutation if reproducible, confirm loading and
   error panels render on list pages.

## Out Of Scope

- Imports page container/table refactors, chart masking behaviour while
  amounts are hidden, tab-implementation unification, keyboard shortcuts.
  These remain candidates from the same review.

## Outcome (2026-09-22)

Shipped as planned, with two scope extensions: `QueryState` / `EmptyState`
(plus `QuerySkeleton` / `QueryErrorState` for partial regions) also landed in
the assets list, loan and subscription detail panels, overview empty states,
and the settings categories page; the settings Tailwind conversion covered
`CategoriesPage.tsx` in addition to `SettingsPage.tsx` (settings directory:
56 inline styles down to 1, the shared `Modal.Dialog` width convention).

The durable decisions are recorded in
[ADR 0017](../decisions/0017-unify-renderer-states-failures-and-copy-language.md).

Verification: `oxfmt --check` on changed files, `pnpm check-types`, `pnpm lint`,
`pnpm test` (110 passed), `pnpm build`, and `check-docs` all green. Known
baseline noise unrelated to this change: `oxfmt --check` flags three
pre-existing files (`apps/web/components/FeatureShowcase.tsx`,
`bubo Design System.html`, `packages/api/.../imports-api.repository.ts`) plus
the untracked `crx-ui/` reference folder.
