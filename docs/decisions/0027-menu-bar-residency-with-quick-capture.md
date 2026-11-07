# 0027. Menu-Bar Residency With a Quick Capture Window

- Status: Accepted
- Date: 2026-11-08

## Context

Voice entry existed but lived inside the main window: the user had to find the app, then press a
combination that only works while it is focused. For a ledger, the common case is "I just paid for
something, record it now" — an interaction that should start from anywhere and finish in seconds.

## Decision

1. The app keeps a **tray icon** (a monochrome wallet template image) and stays alive when the main
   window closes. `CloseRequested` is prevented; only the tray's 退出 exits.
2. Tray left click toggles the main window; the menu exposes 打开主窗口 / 语音录入 / 退出.
3. A **global shortcut** opens a dedicated capture window. The default request is `Fn+P`, persisted
   in the app config directory. Because macOS cannot register Fn as a global hotkey, the native
   layer falls back to `Control+Shift+V` → `Alt+Shift+V` → `Control+Alt+V` and reports the value it
   actually registered. The settings row shows that value and explains the substitution; a rejected
   combination is never persisted.
4. The capture window is a **reused** frameless `quick-capture` window, 400×560, always on top,
   positioned under the menu bar. Showing it emits `quick-capture:start`, so the page resets instead
   of the window being recreated.
5. The flow is record → ASR → LLM (`voice.parseIntent`) → save card → hide. Saving calls the same
   domain mutation the page would; asset and investment intents are handed to the main window via
   `bubo://voice-intent` because they need an account or position that the capture window does not
   own.
6. The root route short-circuits `#/quick-capture` to a bare page: no shell, no navigation, no voice
   sheet.

## Rationale

A menu-bar app must not lose the user's data when they close a window, and a capture window must be
one gesture from the keyboard. Reusing the window keeps the recorder and its permission state warm;
handing complex domains back to their own pages preserves the rule that each domain's form is the
only writer.

## Consequences

- The process now outlives its windows: memory stays resident, and "quit" is a tray action.
- `Fn` cannot be a global modifier on macOS. The requested value is kept as intent, the registered
  value is the truth, and the UI must never claim otherwise.
- The capture window owns a second webview with its own tRPC cache; after a save the main window
  refreshes through its normal ledger-change polling rather than shared state.
- Recording permission is still requested per webview on first use.
