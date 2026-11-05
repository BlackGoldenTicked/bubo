/**
 * @purpose Configure voice AI: the Bailian ASR key, the DeepSeek fallback key, and the free-tier model pool.
 * @role    Settings surface for voice entry providers and the LLM rotation list.
 * @deps    tRPC voice queries/mutations, settings row primitives, HeroUI inputs, and file dialogs.
 * @gotcha  Keys are stored by the sidecar and never read back; a blank key field keeps the saved
 *          key. Pool models share the Bailian key and are tried before DeepSeek: soonest expiry
 *          first, larger quota first; expired rows stay listed but dimmed and are never attempted.
 */

import { useEffect, useState } from "react"
import { Button, Input } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { trpc } from "@/lib/trpc"
import { Row, RowShell, SettingsGroup } from "./components"

function statusLabel(configured: boolean, keyHint: string | null): string {
  if (!configured) return "未配置"
  return keyHint ? `已配置 ${keyHint}` : "已配置"
}

function formatDateKey(value: string): string {
  return value.replace(/-/g, "/")
}

function LlmPoolSection() {
  const queryClient = useQueryClient()
  const modelsQuery = useQuery(trpc.voice.models.list.queryOptions())
  const models = modelsQuery.data ?? []
  const [importNote, setImportNote] = useState("")

  const refresh = (view: typeof models) =>
    queryClient.setQueryData(trpc.voice.models.list.queryKey(), view)

  const importModels = useMutation(
    trpc.voice.models.import.mutationOptions({
      onSuccess: (view) => {
        refresh(view)
        setImportNote(`已导入 ${view.filter((entry) => entry.active).length} 个可用模型`)
      },
    }),
  )
  const removeModel = useMutation(trpc.voice.models.remove.mutationOptions({ onSuccess: refresh }))

  const PURPOSE_LABELS: Record<string, string> = {
    llm: "推理",
    asr: "语音识别",
    tts: "语音合成",
    translate: "实时翻译",
    vision: "视觉",
    embedding: "向量",
    other: "其它",
  }

  const groups: Array<{ purpose: string; title: string; hint: string }> = [
    {
      purpose: "llm",
      title: "推理池",
      hint: "语音记账语义解析，快到期先用，DeepSeek 兜底",
    },
    {
      purpose: "asr",
      title: "语音识别池",
      hint: "未走系统识别时优先使用，默认 qwen3-asr-flash 兜底",
    },
  ]
  const otherPurposes = ["tts", "translate", "vision", "embedding", "other"]

  function renderRows(purpose: string): React.ReactNode {
    const rows = models.filter((entry) =>
      purpose === "other" ? otherPurposes.includes(entry.purpose) : entry.purpose === purpose,
    )
    if (rows.length === 0) return null
    return rows.map((entry, index) => (
      <RowShell key={entry.model} first={index === 0}>
        <div className="min-w-0">
          <div
            className={`font-mono text-[12.5px] ${entry.active ? "text-[var(--ink)]" : "text-[var(--ink-4)] line-through"}`}
          >
            {entry.model}
          </div>
          <div className="mt-[2px] text-[11px] text-[var(--ink-4)]">
            {entry.active
              ? `免费额度内 · ${PURPOSE_LABELS[entry.purpose] ?? entry.purpose}`
              : "已过期，仅展示"}
          </div>
        </div>
        <div className="ml-auto text-right text-[11.5px] text-[var(--ink-3)]">
          <div>额度 {entry.quota}</div>
          <div className="text-[var(--ink-4)]">至 {formatDateKey(entry.expiresAt)}</div>
        </div>
        <button
          type="button"
          aria-label={`删除 ${entry.model}`}
          onClick={() => removeModel.mutate({ model: entry.model })}
          className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-[15px] leading-none text-[var(--ink-4)] transition-colors hover:text-[var(--danger)]"
        >
          ×
        </button>
      </RowShell>
    ))
  }

  return (
    <SettingsGroup title="模型池" icon="investments">
      {models.length > 0 ? (
        groups.map((group) => (
          <div key={group.purpose}>
            <div className="pb-1 pt-1 text-[11px] font-medium text-[var(--ink-3)]">
              {group.title}
              <span className="ml-1 font-normal text-[var(--ink-4)]">· {group.hint}</span>
            </div>
            {renderRows(group.purpose) ?? (
              <div className="pb-1 text-[11.5px] text-[var(--ink-4)]">暂无模型</div>
            )}
          </div>
        ))
      ) : (
        <RowShell first>
          <div className="text-[12px] leading-normal text-[var(--ink-4)]">
            还没有导入模型。推理与语音识别都优先用池内模型（快到期先用），失败后走默认模型兜底。
          </div>
        </RowShell>
      )}
      <RowShell>
        <div className="min-w-0 text-[11.5px] leading-normal text-[var(--ink-4)]">
          {importModels.error?.message ??
            (importNote ||
              "Excel 需含 模型 / 额度 / 剩余时间（或到期日）列；重复导入同名模型会更新其额度。")}
        </div>
        <div className="ml-auto shrink-0">
          <Button
            size="sm"
            variant="outline"
            isDisabled={importModels.isPending}
            onPress={() => {
              setImportNote("")
              importModels.mutate({})
            }}
          >
            {importModels.isPending ? "导入中…" : "导入 Excel"}
          </Button>
        </div>
      </RowShell>
    </SettingsGroup>
  )
}

export function AiVoiceSection() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(trpc.voice.settings.queryOptions())
  const [asrKey, setAsrKey] = useState("")
  const [asrModel, setAsrModel] = useState("")
  const [llmKey, setLlmKey] = useState("")
  const [llmModel, setLlmModel] = useState("")
  const [savedNote, setSavedNote] = useState("")

  const settings = settingsQuery.data

  useEffect(() => {
    if (!settings) return
    setAsrModel(settings.asr.model)
    setLlmModel(settings.llm.model)
  }, [settings])

  const saveSettings = useMutation(
    trpc.voice.saveSettings.mutationOptions({
      onSuccess: (snapshot) => {
        queryClient.setQueryData(trpc.voice.settings.queryKey(), snapshot)
        setAsrKey("")
        setLlmKey("")
        setSavedNote("已保存到本机")
      },
    }),
  )

  const asrLabel = settings ? statusLabel(settings.asr.configured, settings.asr.keyHint) : "读取中…"
  const llmLabel = settings ? statusLabel(settings.llm.configured, settings.llm.keyHint) : "读取中…"

  return (
    <>
      <SettingsGroup title="语音记账" icon="voice">
        <Row first label="百炼 API Key" sub={`语音识别与大模型池 · ${asrLabel}`}>
          <Input
            variant="secondary"
            type="password"
            autoComplete="off"
            placeholder={settings?.asr.configured ? "留空则不修改" : "sk-…"}
            value={asrKey}
            onChange={(event) => setAsrKey(event.target.value)}
            className="w-[190px]"
          />
        </Row>
        <Row label="百炼模型" sub="ASR 默认 qwen3-asr-flash">
          <Input
            variant="secondary"
            autoComplete="off"
            value={asrModel}
            onChange={(event) => setAsrModel(event.target.value)}
            className="w-[190px]"
          />
        </Row>
        <Row label="DeepSeek API Key" sub={`兜底推理 · ${llmLabel}`}>
          <Input
            variant="secondary"
            type="password"
            autoComplete="off"
            placeholder={settings?.llm.configured ? "留空则不修改" : "sk-…"}
            value={llmKey}
            onChange={(event) => setLlmKey(event.target.value)}
            className="w-[190px]"
          />
        </Row>
        <Row label="DeepSeek 模型" sub="默认 deepseek-chat">
          <Input
            variant="secondary"
            autoComplete="off"
            value={llmModel}
            onChange={(event) => setLlmModel(event.target.value)}
            className="w-[190px]"
          />
        </Row>
        <RowShell>
          <div className="min-w-0 text-[12px] leading-normal text-[var(--ink-3)]">
            {saveSettings.error?.message ??
              (savedNote ||
                "密钥只保存在这台设备上。系统语音识别与模型池推理均在本机发起，DeepSeek 仅接收文字。")}
          </div>
          <div className="ml-auto shrink-0">
            <Button
              size="sm"
              variant="primary"
              isDisabled={saveSettings.isPending || !settings}
              onPress={() => {
                setSavedNote("")
                saveSettings.mutate({
                  asr: { apiKey: asrKey.trim(), model: asrModel.trim() },
                  llm: { apiKey: llmKey.trim(), model: llmModel.trim() },
                })
              }}
            >
              {saveSettings.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </RowShell>
      </SettingsGroup>

      <LlmPoolSection />
    </>
  )
}
