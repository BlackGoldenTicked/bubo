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

- Default request is **Fn+P**, stored in `<app config>/voice-shortcut.json`.
- macOS cannot bind the Fn key as a global hotkey (Carbon hotkeys do not see it), so the native
  layer falls back in order: `Control+Shift+V` → `Alt+Shift+V` → `Control+Alt+V`.
- The settings row 快捷录音 shows **what is actually registered**, not what was requested, and
  says why when the two differ. `恢复默认` re-requests Fn+P.
- Registration is all-or-nothing: a combination the OS refuses is reported to the settings UI and
  never persisted, so a broken shortcut cannot survive a restart.

## Capture Flow

1. Shortcut (or tray menu) shows the `quick-capture` window — 400×560, frameless, always on top,
   positioned under the menu bar where the tray icon lives. It is **reused**: showing it emits
   `quick-capture:start` so the page resets and re-arms the recorder.
2. The window records the microphone, then calls `voice.parseIntent` in one shot: the sidecar does
   ASR and then LLM reasoning, returning one intent per record.
3. The parsed record renders as a compact save card — domain, amount or headline, date, category,
   and any model warnings.
4. **保存** writes through the domain mutation (cashflow / subscription / loan), then the window
   hides. Multiple records queue: save one, the next card shows; the window closes when the queue
   drains.
5. Asset and investment intents need an existing account or position, so they are handed to the
   main window through `bubo://voice-intent` and the capture window closes. The main window's page
   listener prefills its own form; that form stays the only writer.

The root route short-circuits `#/quick-capture` to the bare page: this window has no shell, no
navigation, and no voice sheet of its own.

## Boundaries

- The capture window never navigates and never shows the ledger.
- Nothing is written on recognition; a save is always an explicit press.
- The tray icon is a monochrome template image (`src-tauri/icons/tray-wallet.png`), so it follows
  the menu-bar appearance in light and dark mode.
