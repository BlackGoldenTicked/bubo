# `apps/web` — bubo marketing site

Next.js (App Router) + Tailwind CSS v4 + TypeScript landing page for bubo.

The blog (MDX articles, Velite content pipeline, R2 image pipeline) is **not part of this
repository** — its author-owned content and credentials live outside it. The routes, sitemap,
and navigation no longer reference it.

## Commands

```bash
pnpm -F web dev          # next dev (http://localhost:3000)
pnpm -F web build        # next static export (writes apps/web/out)
pnpm -F web deploy:pages # build and deploy apps/web/out to bubomoney.pages.dev
pnpm -F web start        # serve the static export locally
pnpm -F web check-types  # tsc --noEmit
```

## Layout

- `app/` — App Router entry (`layout.tsx`, `page.tsx`, `globals.css`), plus `/releases` and
  the `/app-preview` demo surface.
- `components/` — landing sections (`Nav`, `Hero`, `ThreeLayers`, `Features`, `Privacy`,
  `Creed`, `CTA`, `Footer`) plus `primitives` and `SectionHead`.
- `components/releases/ReleaseTimeline.tsx` — public release notes data and UI.
  `pnpm release <version>` validates that the first entry matches the target version and
  carries the only `badge: "latest"`.
- `appmock/` — verbatim copies of renderer surfaces rendered as a product preview; they import
  via the `@mock/*` alias configured in `next.config.mjs`.

## Styling

Theme tokens live in `app/globals.css` under the Tailwind v4 `@theme` block
(colors, fonts, the `blink` animation). `@heroui/styles` bundles Tailwind v4 and
the HeroUI theme; both `@heroui/styles` and `tailwindcss` come from the workspace
pnpm catalog (`pnpm-workspace.yaml`), shared with `apps/desktop`.
