# 0003 Desktop App Icon Assets

- Status: Accepted (runtime integration amended 2026-08-08)
- Date: 2026-06-16

## Context

bubo needs a branded desktop app icon in packaged macOS and Windows builds.
Tauri reads the configured macOS `.icns` and PNG sources, while its Windows
resource build also requires the conventional `src-tauri/icons/icon.ico` file.

macOS bundled app icons leave transparent padding around the visible rounded
tile. In local checks, a full-canvas tile appears oversized in the Dock even
when the internal mark is visually smaller. bubo keeps a more restrained tile
with a geometric size of about 78% of the icon canvas.

## Decision

Keep app icon assets under `apps/desktop/resources/icons`:

- `bubo.icns` is the packaged macOS icon referenced by Tauri.
- `bubo.iconset/` keeps the source PNG sizes used to rebuild the `.icns`.
- The visible rounded tile is inset to about 78% of the 1024px canvas.
- The mark uses three clean shortened offset plates without marker dots.

Generate `apps/desktop/src-tauri/icons/icon.ico` from
`bubo.iconset/icon_512x512@2x.png` and list it in Tauri's `bundle.icon` array.

## Consequences

Packaged builds use the same source artwork through platform-specific Tauri
assets. Updating the app icon requires regenerating the iconset PNGs,
`bubo.icns`, and `src-tauri/icons/icon.ico`, then verifying:

- `sips -g pixelWidth -g pixelHeight apps/desktop/resources/icons/bubo.icns`
- `iconutil -c iconset apps/desktop/resources/icons/bubo.icns -o /tmp/bubo-icon-verify.iconset`
- the 1024px PNG keeps the rounded tile close to the 78% geometric canvas ratio
