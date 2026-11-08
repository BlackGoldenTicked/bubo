# Third-Party Notices

bubo Desktop is MIT-licensed (see [LICENSE](./LICENSE)). It builds on third-party
software whose licenses are reproduced by each package in `node_modules` when installed.
This file records the components that carry attribution obligations beyond a plain MIT
notice, plus the direct dependencies worth knowing about.

## Attribution required (Apache-2.0)

These components are licensed under Apache License 2.0. Redistributing a built app keeps
their `LICENSE`/`NOTICE` obligations: do not remove the copyright lines, and keep this file
in the repository.

| Component                                                                                                      | Version | License    | Copyright             |
| -------------------------------------------------------------------------------------------------------------- | ------- | ---------- | --------------------- |
| [QingIcon](https://github.com/asorn/qingicon-open) (`qingicon-react`)                                          | 2.0.4   | Apache-2.0 | QingIcon contributors |
| [React Aria](https://github.com/adobe/react-spectrum) (`react-aria`, `react-aria-components`, `react-stately`) | 3.x     | Apache-2.0 | Adobe                 |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm)                                                     | 0.4x    | Apache-2.0 | Drizzle Team          |

The icon set reaches the UI only through `packages/ui/src/components/ui/app-icon.tsx`, which
maps semantic names onto QingIcon glyphs. If you swap the icon set, keep an equivalent
notice for whatever replaces it.

## Direct dependencies (MIT)

MIT requires keeping the copyright and permission notice with the distributed software.
The notable ones:

- [HeroUI](https://github.com/heroui-inc/heroui) (`@heroui/react`, `@heroui/styles`)
- [React](https://react.dev), [React DOM](https://react.dev)
- [TanStack Query / Router](https://tanstack.com), [Jotai](https://jotai.org)
- [tRPC](https://trpc.io), [Zod](https://zod.dev)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Sonner](https://sonner.emilkowal.ski), [react-hook-form](https://react-hook-form.com),
  [cmdk](https://cmdk.paco.me), [Radix UI](https://radix-ui.com)

## Fonts

Latin text is set in **IBM Plex Sans** and **IBM Plex Mono**, bundled locally from
`@fontsource/*` (SIL Open Font License 1.1). Chinese text falls back to the platform UI face
(PingFang SC on macOS, Microsoft YaHei on Windows); no CJK font is bundled.

The **desktop app** does not fetch fonts, scripts, or stylesheets from a CDN at runtime —
IBM Plex is bundled through `@fontsource` and CJK text uses the platform face. If you add a
webfont to the desktop renderer, package it and update this section. (The marketing site
under `apps/web` is a separate Next.js surface and may load webfonts normally.)

## Rust crates

The Tauri shell depends on crates under MIT and/or Apache-2.0 (Tauri, Tao, Wry, serde,
tokio). `apps/desktop/src-tauri/Cargo.lock` pins exact versions; cargo records each crate's
license in its `Cargo.toml`.

## Regenerating this list

```bash
node -e "const {execSync}=require('child_process');console.log(execSync('pnpm licenses list --prod --json',{encoding:'utf8'}))" > /tmp/licenses.json
```

Review the output whenever a dependency is added or replaced.
