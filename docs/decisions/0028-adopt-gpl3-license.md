# 0028. Adopt GPL-3.0 Because The Lumno Style Is GPL-Derived

- Status: Accepted
- Date: 2026-11-09

## Context

The repository was about to be published on GitHub under MIT, with an explicit
acknowledgements section. The audit that produced the acknowledgements surfaced a license
conflict: the `lumno` visual style (`[data-style="lumno"]` in `packages/ui/src/styles/`) and
the theme palette from [ADR 0018](0018-renderer-theme-system.md) were **ported** from the
design language of [kubai087/lumno-extension](https://github.com/kubai087/lumno-extension)
(the `crx-ui/` reference folder recorded in ADR 0019), and that project is licensed
**GPL-3.0**.

A port of a GPL-3.0 stylesheet is a derivative work. Under MIT that derivative cannot be
relicensed, so publishing would have made the distribution non-compliant no matter how
thorough the attribution was.

## Decision

Adopt **GPL-3.0-only** for the whole repository (`LICENSE`, `license` field in
`package.json`, README, THIRD-PARTY-NOTICES), crediting lumno-extension's authorship of the
Lumno design language.

## Rationale

- Compliance is immediate and unconditional: the derivative CSS and the rest of the work are
  licensed consistently.
- The source is published anyway, so GPL's source obligations cost the project nothing.
- Rewriting the Lumno CSS to be an independent expression would keep MIT but risk a finding
  of derivation anyway, and would visibly drift the style. Removing the Lumno style would
  delete a deliberate product feature (dual visual languages, ADR 0019).
- Apache-2.0 dependencies (QingIcon, React Aria, Drizzle) are one-way compatible with
  GPL-3.0; MIT dependencies are compatible.

## Consequences

- Derivatives of bubo must be GPL-3.0 and keep lumno-extension's copyright notice with the
  ported style.
- Published installers must ship or link their source (the GitHub release already points at
  this repository).
- The npm-published CLI inherits the license; its package metadata must state it before
  publishing.
- Future code must not be copied from permissively-licensed sources that forbid GPL
  conversion (none known today).
