/**
 * @purpose Turn a real key press into a registrable shortcut string, and render it in symbols.
 * @role    Pure helpers behind the press-to-record shortcut control in settings.
 * @deps    DOM KeyboardEvent shape only — no React, no Tauri.
 * @gotcha  The Rust side parses `Modifier+Modifier+Key` where the key token is a `KeyboardEvent.code`
 *          (`KeyV`, `Digit1`, `Space`, `F5`). Never emit `event.key` for letters: it is layout
 *          dependent and `Shift+V` would arrive as `V`. Fn cannot be expressed at all — macOS
 *          keeps it for the globe/input-source key and Carbon hotkeys cannot bind it.
 */

export interface ShortcutKeyEvent {
  key: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** Keys that are modifiers on their own; pressing one is not a complete shortcut yet. */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "Fn"])

const MODIFIER_SYMBOLS: Record<string, string> = {
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  super: "⌘",
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
}

/** Key tokens that read badly as a raw code. */
const KEY_LABELS: Record<string, string> = {
  space: "空格",
  escape: "Esc",
  enter: "↩",
  return: "↩",
  tab: "⇥",
  backspace: "⌫",
  delete: "⌦",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  home: "Home",
  end: "End",
  pageup: "PgUp",
  pagedown: "PgDn",
  minus: "-",
  equal: "=",
  bracketleft: "[",
  bracketright: "]",
  backslash: "\\",
  semicolon: ";",
  quote: "'",
  comma: ",",
  period: ".",
  slash: "/",
  backquote: "`",
}

export function isModifierKey(event: Pick<ShortcutKeyEvent, "key">): boolean {
  return MODIFIER_KEYS.has(event.key)
}

/** `KeyV` → `V`, `Digit1` → `1`; anything else keeps its code name. */
function keyToken(event: ShortcutKeyEvent): string | null {
  const code = event.code ?? ""
  if (code.startsWith("Key") && code.length === 4) return code.slice(3)
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5)
  if (code.startsWith("Numpad")) return code
  if (code.length > 0) return code
  if (event.key.length === 1) return `Key${event.key.toUpperCase()}`
  return null
}

/**
 * Build the string the native layer can register, or null when the press cannot be used
 * (modifier only, or a bare key that a global hotkey is not allowed to swallow).
 */
export function shortcutFromKeyEvent(event: ShortcutKeyEvent): string | null {
  if (isModifierKey(event)) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push("Control")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")
  if (event.metaKey) parts.push("Super")
  if (parts.length === 0) return null

  const token = keyToken(event)
  if (token == null) return null
  parts.push(token)
  return parts.join("+")
}

/** `Control+Shift+KeyV` → `⌃⇧V`; unknown tokens fall through unchanged. */
export function formatShortcut(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return "未设置"
  const tokens = trimmed.split("+").filter((token) => token.length > 0)
  let text = ""
  for (const token of tokens) {
    const symbol = MODIFIER_SYMBOLS[token.toLowerCase()]
    if (symbol != null) {
      text += symbol
      continue
    }
    const lower = token.toLowerCase()
    const label = KEY_LABELS[lower]
    if (label != null) text += label
    else if (lower.startsWith("key") && token.length === 4) text += token.slice(3).toUpperCase()
    else if (lower.startsWith("digit") && token.length === 6) text += token.slice(5)
    else {
      // Unknown words (Fn, MediaPlayPause…) read better joined by a plus than glued on.
      if (text.length > 0) text += "+"
      text += token
    }
  }
  return text.length > 0 ? text : "未设置"
}

/** Shown under the recorder when macOS reserves the requested key. */
export const SHORTCUT_LIMITATION =
  "macOS 不允许把 Fn 作为全局快捷键（系统保留给地球键/输入法），也不允许单字母触发。请按住 ⌘ ⌃ ⌥ ⇧ 中的至少一个，再按一个字母或功能键。"
