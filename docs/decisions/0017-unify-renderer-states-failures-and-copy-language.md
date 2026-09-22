# 0017. Unify Renderer States, Failures, And Copy Language

- Status: Accepted
- Date: 2026-09-22

## Context

The renderer carried four kinds of quality debt. The i18n scaffold (i18next, react-i18next, `@lobehub/i18n-cli`, and en/zh JSON bundles) translated a single-language local desktop app, and `useTranslation` had zero call sites. Mutation failures reached the user through at most one local `onError`, so most rejected writes died silently. List and detail surfaces re-implemented 加载中 / 加载失败 / empty-state markup inline on every page. Settings surfaces used hand-written inline styles that duplicated tokens and metrics outside the Tailwind conventions the rest of the renderer follows.

## Decision

- The renderer is single-language Chinese: UI copy is written inline, there is no i18n layer, and no translation bundles are maintained. Reintroducing i18n requires a new decision.
- Every mutation failure reports through one global path: `MutationCache.onError` in `lib/trpc.ts` calls `reportActionError` (`lib/reportError.ts`), which toasts through `notify.error` and dedupes by error-object identity (WeakSet). Local handlers that need extra behavior route through `reportActionError` too, never `notify` directly.
- Pending/error/empty states render through shared primitives: `components/ui/QueryState.tsx` (`QueryState`, `QuerySkeleton`, `QueryErrorState`) accepting a structural `{ isPending, isError, error, refetch }`, and `components/ui/EmptyState.tsx` (title + hint + optional action). Pages pass their query objects directly.
- Settings surfaces follow the same conventions as the rest of the renderer: HeroUI controls plus Tailwind utilities driven by `globals.css` tokens (`--ink-*`, `--hair-*`, `--mono`). Inline styles remain only for dynamic runtime values and library prop objects (e.g. the shared `Modal.Dialog` width convention).
- Raw interactive elements get one keyboard focus ring from a zero-specificity `:where(...):focus-visible` rule in `globals.css`, so HeroUI's own component focus-ring classes keep winning.

## Rationale

i18n was pure maintenance weight: a local-only app with one language and zero translation call sites, where scaffold files had to be validated and synced for no user-visible benefit. A global mutation error hook is the only structure that scales — per-mutation `onError` relies on every future call site remembering, which the codebase had already failed at — and identity dedupe still yields one toast when a caller also observes the same error. QueryState turns "what does loading/failure/empty look like" into a per-surface choice with one implementation instead of N divergent ones. The `:where()` wrapper is deliberately zero-specificity so the global ring styles raw elements without overriding HeroUI's own focus-ring system.

## Consequences

- New surfaces must render query pending/failure through `QueryState` (or `QuerySkeleton` / `QueryErrorState` for partial regions such as a detail body) and empty states through `EmptyState`; inline 加载中 / 加载失败 text is a review finding.
- Mutation call sites no longer need `onError` for plain failure toasts. When a caller needs extra handling (inline field errors, keep-modal-open behavior), it must still route the toast through `reportActionError` so the same error is not reported twice.
- Settings copy and styling changes stay inline and token-driven; there is no translation file to update.
- `QueryState` stays a structural type (`QueryLike`): any query-shaped object works, keeping it decoupled from TanStack Query internals.
