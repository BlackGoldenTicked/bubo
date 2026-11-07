/**
 * @purpose Configure the global shortcut that opens the menu-bar voice capture window.
 * @role    Settings surface for the desktop shell shortcut.
 * @deps    The Tauri bridge (`window.bubo.voiceShortcut`) and the settings row primitives.
 * @gotcha  macOS cannot register the Fn key as a global hotkey, so the native layer falls back
 *          to a registrable combination. Never pretend "Fn+P" is live: always show what the OS
 *          actually registered, and keep the requested value visible so the intent is clear.
 */

import { useEffect, useState } from "react"
import { Button, Input } from "@heroui/react"
import { notify } from "@bubo/ui"
import { Row, SettingsGroup } from "./components"

interface ShortcutState {
  requested: string
  registered: string
  defaultShortcut: string
}

export function ShortcutSection() {
  const [state, setState] = useState<ShortcutState | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.bubo.voiceShortcut
      .get()
      .then((value) => {
        if (!alive) return
        setState(value)
        setDraft(value.requested)
      })
      .catch(() => {
        if (alive) setState(null)
      })
    return () => {
      alive = false
    }
  }, [])

  async function apply(value: string) {
    setBusy(true)
    try {
      const next = await window.bubo.voiceShortcut.set(value)
      setState(next)
      setDraft(next.requested)
      notify.success(`已更新为 ${next.registered}`)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const fellBack = state != null && state.registered !== state.requested

  return (
    <SettingsGroup title="快捷录音" icon="voice">
      <Row label="全局快捷键" sub={state ? `当前生效：${state.registered || "未注册"}` : "未连接桌面壳"}>
        <div className="flex items-center gap-2">
          <Input
            variant="secondary"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={state?.defaultShortcut ?? "Fn+P"}
            className="w-[150px]"
            aria-label="全局快捷键"
          />
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => void apply(draft)}>
            保存
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={busy || !state}
            onPress={() => void apply(state?.defaultShortcut ?? "Fn+P")}
          >
            恢复默认
          </Button>
        </div>
      </Row>
      <Row label="菜单栏图标" sub="关闭主窗口后驻留在菜单栏，点击图标可展开">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            void window.bubo.openQuickCapture()
          }}
        >
          立即试听
        </Button>
      </Row>
      {fellBack && (
        <Row label="系统限制" sub={`${state?.requested} 无法注册为全局热键（Fn 由系统保留），已自动使用 ${state?.registered}`}>
          <span className="text-[11px] text-[var(--ink-4)]">可改成 ⌥/⌃/⇧ 组合</span>
        </Row>
      )}
    </SettingsGroup>
  )
}
