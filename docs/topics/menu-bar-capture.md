# Menu-Bar Residency And Quick Capture

bubo keeps a **wallet icon in the macOS menu bar** and can record a thought without opening the
main window. The two features are one shell: the tray keeps the process alive, the shortcut opens
a small capture window, and saving closes it again.

## Window Lifecycle

| Action                  | Result                                           |
| ----------------------- | ------------------------------------------------ |
| Close (⌘W / red button) | Window hides; the process kept alive by the tray |
| Tray left click         | Toggle the main window                           |
| Tray menu → 打开主窗口  | Show + focus                                     |
| Tray menu → 语音录入    | Open the capture window                          |
| Tray menu → 退出 bubo   | The only real exit                               |

`CloseRequested` is always prevented in the Rust shell (`src-tauri/src/shell.rs`); a window that
should disappear calls `hide()`, never `close()`.

## Shortcut

- The default is **⌃⇧V** (`Control+Shift+V`), stored in `<app config>/voice-shortcut.json`.
- **Fn cannot be used.** macOS keeps the Fn key for the globe / input-source switch, and Carbon
  hotkeys — the only mechanism a sandboxed app has for a system-wide shortcut — cannot bind it.
  An earlier build shipped "Fn+P" as the default; that value is now treated as unset instead of
  registering a fallback on every launch.
- The settings row 快捷录音 **records a real key press**: press the button, hold the modifiers,
  press one key, done. No typing "Ctrl+Shift+V". Esc cancels, modifier-only presses are ignored,
  and a bare letter is rejected (a global hotkey that swallows every keystroke would be unusable).
  The stored string uses `KeyboardEvent.code` (`Control+Shift+KeyV`) because `event.key` is
  layout-dependent.
- Registration is exact and all-or-nothing: a combination the OS refuses is reported inline and
  never persisted, and the previous binding is restored so the app never ends up with none.

## Capture Flow

1. Shortcut (or tray menu) shows the `quick-capture` window — 400×560, frameless, always on top —
   and **recording starts by itself** as soon as the window appears. The same shortcut pressed
   again stops it and parses (`quick-capture:toggle`), so one key drives the whole capture. The
   window is reused: showing it emits `quick-capture:start`, which drops any live recording and
   re-arms the recorder.
2. Placement is anchored, not cornered. A position the user drags the window to is persisted in
   `<app config>/quick-window.json` and reused on every later open. Without one, the window hangs
   just under the menu-bar icon; when macOS does not report an icon frame (macOS 26 hosts status
   items in Control Center and returns a degenerate `68×0` rect at the origin for the Tauri tray
   API and for AppKit's conversion), it docks under the menu bar on the icon's side of the screen —
   never in a far corner, and never below the menu bar.
3. The window records the microphone, then calls `voice.parseIntent` in one shot: the sidecar does
   ASR and then LLM reasoning, returning one intent per record.
4. The parsed record renders as a compact save card — domain, amount or headline, date, category,
   and any model warnings.
5. **保存** writes through the domain mutation (cashflow / subscription / loan), then the window
   hides. Multiple records queue: save one, the next card shows; the window closes when the queue
   drains.
6. Asset and investment intents need an existing account or position, so they are handed to the
   main window through `bubo://voice-intent` and the capture window closes. The main window's page
   listener prefills its own form; that form stays the only writer.

The root route short-circuits any URL containing `quick-capture` to the bare page: this window has
no shell, no navigation, and no voice sheet of its own. Every string in it is Chinese, including
microphone-failure messages (permission, no device, device busy) — browser errors never leak out.

## Boundaries

- The capture window never navigates and never shows the ledger.
- Nothing is written on recognition; a save is always an explicit press.
- The tray icon is a monochrome template image (`src-tauri/icons/tray-wallet.png`), so it follows
  the menu-bar appearance in light and dark mode.
