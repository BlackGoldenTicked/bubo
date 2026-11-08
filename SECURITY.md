# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for anything security-related.

- Preferred: GitHub's private advisory flow —
  <https://github.com/BlackGoldenTicked/bubo-desktop/security/advisories/new>
- Or email the maintainer listed on the GitHub profile of
  [@BlackGoldenTicked](https://github.com/BlackGoldenTicked).

Include the version (`bubo → 关于`), the platform, steps to reproduce, and what an attacker
gains. Expect an initial reply within about a week; this is a single-maintainer project.

## Supported versions

Only the latest released version receives fixes. There are no maintenance branches.

## What the app stores, and where

Knowing the data layout is usually enough to judge whether something is a vulnerability.

| Data                             | Location                                                                                                         | Notes                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ledger database                  | `~/Library/Application Support/com.chaordex.bubo/bubo.sqlite3` (macOS), `%APPDATA%\com.chaordex.bubo\` (Windows) | SQLite, owned by the sidecar process only                                                               |
| Rolling DB snapshots             | same directory, `bubo.sqlite3.bak-*`                                                                             | 7 newest kept, taken before each open; **they do not include card scans**                               |
| Card scans                       | `…/com.chaordex.bubo/card-images/`                                                                               | Plain files; the DB stores only the file name                                                           |
| AI provider keys (optional)      | `…/bubo-voice.json`                                                                                              | Plaintext JSON, file mode `0600`; never logged, never returned to the renderer (only a `••••abcd` hint) |
| Voice shortcut / window position | `…/voice-shortcut.json`, `…/quick-window.json`                                                                   | Local preferences                                                                                       |
| Dev builds                       | `…/com.chaordex.bubo.dev/`                                                                                       | Separate identity and directory; does not touch production data                                         |

There is **no** telemetry, analytics, crash reporting, or account system. The app does not
fetch fonts, scripts, or stylesheets from a CDN, and it has no inbound network listener. The
only outbound traffic comes from features you explicitly use: the AI voice transcription
provider you configure, and the update check against this repository's releases.

## Threat model

In scope:

- Anything that leaks ledger data or card scans to a third party, or to another local user
  (file permissions).
- Anything that lets a malicious import (statement, XLSX, ledger backup) execute code or read
  arbitrary files, e.g. path traversal through an imported `file_name`.
- Bypasses of the Tauri boundary: renderer getting direct filesystem or SQLite access, or a
  command that accepts an unchecked path.
- XSS in the renderer that reaches native capabilities.
- Update-chain weaknesses: a way to install a build that is not signed by the project key.

Out of scope / by design:

- An attacker who already has read access to your user account can read the SQLite file and
  the scans — the app does not encrypt the ledger at rest.
- API keys are stored in a `0600` file rather than the OS keychain (tracked as a known
  limitation, not a vulnerability).
- The demo ledger shipped with the app is synthetic.

## Disclosure

Once a fix ships, the advisory is published with credit unless you ask otherwise.
