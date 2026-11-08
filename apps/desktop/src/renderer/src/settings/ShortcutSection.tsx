/**
 * @purpose Configure the global shortcut that opens the menu-bar voice capture window.
 * @role    Settings surface for the desktop shell shortcut.
 * @deps    The Tauri bridge (`window.bubo.voiceShortcut`), the shortcut helpers, and settings rows.
 * @gotcha  Record the combination by pressing it — never ask the user to type "Ctrl+Shift+V".
 *          macOS cannot register the Fn key as a global hotkey, so the native layer ignores a
 *          stored Fn request and falls back to a registrable default; the row always reports what
 *          the OS actually accepted.
 */

import { useEffect, useState } from "react"
import { Button } from "@heroui/react"
import { notify } from "@bubo/ui"
import {
  SHORTCUT_LIMITATION,
  formatShortcut,
  isModifierKey,
  shortcutFromKeyEvent,
} from "@/lib/shortcut"
import { Row, SettingsGroup } from "./components"

interface ShortcutState {
  requested: string
  registered: string
  defaultShortcut: string
}

/** Live modifier preview while the user is still holding Ctrl/Alt/Shift/Command. */
function modifierPreview(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push("Control")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")
  if (event.metaKey) parts.push("Super")
  return parts.join("+")
}

export function ShortcutSection() {
  const [state, setState] = useState<ShortcutState | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState("")
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.bubo.voiceShortcut
      .get()
      .then((value) => {
        if (alive) setState(value)
      })
      .catch(() => {
        if (alive) setState(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!capturing) return
    function onKeyDown(event: KeyboardEvent) {
      // Capture phase: the rest of the app must not act on the combination being recorded.
      event.preventDefault()
      event.stopPropagation()

      if (event.key === "Escape") {
        setCapturing(false)
        setPreview("")
        setHint(null)
        return
      }
      if (isModifierKey(event)) {
        setPreview(formatShortcut(modifierPreview(event)))
        return
      }

      const combo = shortcutFromKeyEvent(event)
      if (combo == null) {
        setHint("需要一个修饰键：按住 ⌘ / ⌃ / ⌥ / ⇧ 中的至少一个，再按字母或功能键。")
        return
      }
      setCapturing(false)
      setPreview("")
      setHint(null)
      void apply(combo)
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
    // `apply` only closes over the bridge, so re-subscribing on every render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing])

  async function apply(value: string) {
    setBusy(true)
    try {
      const next = await window.bubo.voiceShortcut.set(value)
      setState(next)
      notify.success(`快捷键已改为 ${formatShortcut(next.registered)}`)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const live = state?.registered ?? ""
  const fellBack = state != null && state.registered !== state.requested

  return (
    <SettingsGroup title="快捷录音" icon="voice">
      <Row
        label="全局快捷键"
        sub={
          state
            ? `当前生效：${formatShortcut(live)}　按下后会在菜单栏图标下方弹出录音窗口`
            : "未连接桌面壳，无法注册全局快捷键"
        }
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={capturing ? "primary" : "secondary"}
            isDisabled={busy || !state}
            onPress={() => {
              setHint(null)
              setPreview("")
              setCapturing((value) => !value)
            }}
            aria-label="按下组合键录制快捷键"
          >
            {capturing ? (preview.length > 0 ? `${preview} …` : "请按下组合键…") : formatShortcut(live)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={busy || !state}
            onPress={() => void apply(state?.defaultShortcut ?? "Control+Shift+V")}
          >
            恢复默认
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!state}
            onPress={() => {
              void window.bubo.openQuickCapture()
            }}
          >
            试一下
          </Button>
        </div>
      </Row>

      <Row label="怎么设置" sub="点上面的按钮，然后直接按下你想用的组合键；按 Esc 取消。">
        <span className="text-[11px] text-[var(--ink-4)]">
          {state ? `默认 ${formatShortcut(state.defaultShortcut)}` : ""}
        </span>
      </Row>

      {(capturing || hint || fellBack) && (
        <Row label={fellBack ? "为什么不是 Fn+P" : "系统限制"} sub={hint ?? SHORTCUT_LIMITATION}>
          <span className="text-[11px] text-[var(--ink-4)]">
            {fellBack ? `已改用 ${formatShortcut(live)}` : ""}
          </span>
        </Row>
      )}
    </SettingsGroup>
  )
}
