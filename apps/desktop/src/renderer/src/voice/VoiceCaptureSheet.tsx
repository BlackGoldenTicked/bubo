/**
 * @purpose Capture one utterance or a pasted block of text, then confirm the parsed records one by one.
 * @role    System-level voice entry surface mounted in the root layout.
 * @deps    tRPC transcribe/parseIntent, the browser recorder, HeroUI modal primitives, the router,
 *          and the domain-scoped intent queue.
 * @gotcha  The model only proposes intents, and one input may produce several. Every record goes
 *          into the queue and is confirmed individually, so a batch never collapses into one
 *          entry. Text input sends `transcript` directly and skips ASR entirely. Nothing here
 *          writes to the ledger; the target page's own mutation stays the only writer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Button, Modal } from "@heroui/react"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { AppIcon, type AppIconName } from "@bubo/ui"
import type { VoiceIntent, VoiceIntentParseResult } from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { voiceCaptureOpenAtom } from "@/lib/state/uiAtoms"
import { MAX_RECORDING_MS, VoiceRecorder, type VoiceRecording } from "@/lib/voice/audioRecorder"
import {
  confirmQueuedIntent,
  dropQueuedVoiceIntent,
  queueVoiceIntents,
} from "@/lib/voice/intentHandoff"
import { useVoiceIntentQueue } from "@/lib/voice/useVoiceIntent"

type Phase = "idle" | "recording" | "working" | "review" | "done" | "error"

interface LogLine {
  id: number
  time: string
  text: string
  tone: "info" | "ok" | "warn" | "error"
}

const DOMAIN_ROUTE = {
  cashflow: "/imports",
  loan: "/loans",
  subscription: "/subscriptions",
  asset: "/assets",
  investment: "/investments",
} as const

const DOMAIN_LABEL: Record<VoiceIntent["domain"], string> = {
  cashflow: "流水",
  loan: "贷款",
  subscription: "订阅",
  asset: "资产",
  investment: "投资",
  unknown: "未识别",
}

const DOMAIN_ICON: Record<VoiceIntent["domain"], AppIconName> = {
  cashflow: "cashflow",
  loan: "loans",
  subscription: "subscriptions",
  asset: "assets",
  investment: "investments",
  unknown: "warning",
}

const HINT =
  "“中午吃饭花了三十八块五” · “招行卡里有八万” · “买十股苹果每股一百八” · “房贷月供五千八”"
const TEXT_PLACEHOLDER =
  "也可以直接粘贴一段账单或聊天记录，一行一笔，例如：\n早饭 8 块\n打车 26\n中午麻辣烫 38.5"

function clockNow(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`
}

/** One-line confirmation describing what the target page will show. */
function summarize(intent: VoiceIntent): string {
  switch (intent.domain) {
    case "cashflow":
      return (
        `${intent.flowKind === "income" ? "收入" : "支出"} ${intent.amount || "（金额待填）"} · ${intent.title}` +
        ` · 分类 ${intent.categoryName ?? "未识别"}`
      )
    case "loan":
      return `${intent.name} · 月供 ${intent.paymentAmount || "（待填）"}`
    case "subscription":
      return `${intent.name} · ${intent.amount || "（待填）"} / ${intent.billingCycle} · 分类 ${intent.categoryName ?? "未识别"}`
    case "asset":
      return `${intent.accountName} · ${intent.valueAmount || "（待填）"}`
    case "investment":
      return `${intent.side === "sell" ? "卖出" : "买入"} ${intent.symbol} × ${intent.quantity || "（待填）"}`
    default:
      return "未能判断要记录的对象"
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…（共 ${text.length} 字）`
}

const TRACE_FILE_HINT =
  "详细日志：~/Library/Application Support/com.chaordex.bubo/bubo-voice-trace.log"

export function VoiceCaptureSheet() {
  const [open, setOpen] = useAtom(voiceCaptureOpenAtom)
  const navigate = useNavigate()
  const queue = useVoiceIntentQueue()
  const head = queue[0] ?? null
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const logIdRef = useRef(0)
  const logRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const [text, setText] = useState("")
  const supported = VoiceRecorder.isSupported()

  const append = useCallback((line: string, tone: LogLine["tone"] = "info") => {
    logIdRef.current += 1
    setLog((lines) => [...lines, { id: logIdRef.current, time: clockNow(), text: line, tone }])
  }, [])

  useEffect(() => {
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [log])

  const transcribe = useMutation(trpc.voice.transcribe.mutationOptions())
  const parseIntent = useMutation(trpc.voice.parseIntent.mutationOptions())

  /**
   * Mirror the parse diagnostics into the log area: which category vocabulary went out,
   * what the model actually answered, and how each record's category came out.
   */
  const appendTrace = useCallback(
    (result: VoiceIntentParseResult) => {
      const trace = result.trace
      if (!trace) return
      const withExamples = trace.categories.filter((category) => category.示例).length
      append(`分类词表：${trace.categories.length} 个，带示例 ${withExamples} 个`)
      for (const attempt of trace.attempts) {
        if (attempt.ok) continue
        append(`模型弃用：${attempt.provider}/${attempt.model} — ${attempt.error ?? ""}`, "warn")
      }
      append(`模型原始返回：${clip(trace.raw, 220)}`)
      result.intents.forEach((intent, index) => {
        if (intent.domain !== "cashflow" && intent.domain !== "subscription") return
        append(
          `第 ${index + 1} 笔分类：${intent.categoryName ?? "未识别（模型没给，兜底也没命中）"}`,
          intent.categoryName ? "ok" : "warn",
        )
      })
      append(TRACE_FILE_HINT)
    },
    [append],
  )

  /** Shared tail for both input paths: queue every record, auto-hand a single one. */
  const handleIntents = useCallback(
    (intents: VoiceIntent[]) => {
      const usable = intents.filter((intent) => intent.domain !== "unknown")
      const ignored = intents.length - usable.length
      if (ignored > 0) append(`${ignored} 条无法归类，已跳过`, "warn")

      if (usable.length === 0) {
        const reason = intents.find((intent) => intent.domain === "unknown")?.reason
        append(reason ?? "没有识别出可记录的内容", "error")
        setPhase("error")
        return
      }

      queueVoiceIntents(usable)
      append(`识别到 ${usable.length} 条记录`, "ok")

      if (usable.length === 1) {
        const only = usable[0]!
        append(summarize(only), "ok")
        confirmQueuedIntent(only)
        void navigate({ to: DOMAIN_ROUTE[only.domain] })
        setOpen(false)
        return
      }

      append("逐条确认：可点“确认并填入”，也可跳过", "info")
      setPhase("review")
    },
    [append, navigate, setOpen],
  )

  const recognize = useCallback(
    async (recording: VoiceRecording) => {
      setPhase("working")
      append(`录音完成：${seconds(recording.durationMs)}`)

      let transcript = ""
      if (window.bubo.platform.isMac) {
        try {
          transcript = (await window.bubo.speechRecognize(recording.audioBase64)).trim()
          if (transcript.length > 0) append("系统语音识别完成", "ok")
        } catch (error) {
          append(
            `系统识别不可用：${error instanceof Error ? error.message : String(error)}，改用百炼`,
            "warn",
          )
        }
      }

      if (transcript.length === 0) {
        try {
          append("百炼语音识别中…（识别池优先）")
          const result = await transcribe.mutateAsync({
            audioBase64: recording.audioBase64,
            mimeType: recording.mimeType,
          })
          transcript = result.transcript
          append(`识别完成：${result.model}（${seconds(result.durationMs)}）`, "ok")
        } catch (error) {
          append(`识别失败：${error instanceof Error ? error.message : String(error)}`, "error")
          setPhase("error")
          return
        }
      }

      append(`听到：${transcript}`)
      append("大模型判断类别并逐笔抽取…（推理池优先）")
      try {
        const result = await parseIntent.mutateAsync({ transcript })
        append(`解析完成：${result.models.llm}（${seconds(result.timings.llmMs)}）`, "ok")
        appendTrace(result)
        handleIntents(result.intents)
      } catch (error) {
        append(`解析失败：${error instanceof Error ? error.message : String(error)}`, "error")
        setPhase("error")
      }
    },
    [append, appendTrace, handleIntents, parseIntent, transcribe],
  )

  /** Text path: no microphone, no ASR — the pasted block goes straight to the model. */
  const parseText = useCallback(async () => {
    const value = text.trim()
    if (value.length === 0) return
    setPhase("working")
    const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0).length
    append(`提交文本：${value.length} 字 / ${lines} 行，已跳过语音识别`)
    append("大模型逐笔抽取中…（推理池优先）")
    try {
      const result = await parseIntent.mutateAsync({ transcript: value })
      append(`解析完成：${result.models.llm}（${seconds(result.timings.llmMs)}）`, "ok")
      appendTrace(result)
      handleIntents(result.intents)
    } catch (error) {
      append(`解析失败：${error instanceof Error ? error.message : String(error)}`, "error")
      setPhase("error")
    }
  }, [append, appendTrace, handleIntents, parseIntent, text])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder?.isRecording) return
    try {
      const recording = recorder.stop()
      void recognize(recording)
    } catch (error) {
      append(`录音失败：${error instanceof Error ? error.message : String(error)}`, "error")
      setPhase("error")
    }
  }, [append, recognize])

  const startRecording = useCallback(async () => {
    setLog([])
    const recorder = recorderRef.current ?? new VoiceRecorder()
    recorderRef.current = recorder
    try {
      await recorder.start()
      setElapsedMs(0)
      setPhase("recording")
      append("开始录音…说完点“停止并识别”")
    } catch (error) {
      append(
        error instanceof Error && error.name === "NotAllowedError"
          ? "没有麦克风权限，请在系统设置中允许 bubo 使用麦克风"
          : error instanceof Error
            ? error.message
            : String(error),
        "error",
      )
      setPhase("error")
    }
  }, [append])

  // Recording timer, including the hard cap shared with the in-form recorder.
  useEffect(() => {
    if (phase !== "recording") return
    const timer = window.setInterval(() => {
      const recorder = recorderRef.current
      if (!recorder?.isRecording) return
      setElapsedMs(recorder.elapsedMs)
      if (recorder.elapsedMs >= MAX_RECORDING_MS) stopRecording()
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase, stopRecording])

  // Reopening with a parked batch resumes confirmation instead of showing a blank recorder.
  useEffect(() => {
    if (!open) return
    if (phase === "idle" && queue.length > 0) setPhase("review")
  }, [open, phase, queue.length])

  // Reset on close (this also cancels a live recording and clears the paste box).
  useEffect(() => {
    if (open) return
    recorderRef.current?.cancel()
    setPhase("idle")
    setElapsedMs(0)
    setLog([])
    setText("")
  }, [open])

  useEffect(
    () => () => {
      recorderRef.current?.cancel()
    },
    [],
  )

  // Global shortcut: ⌘⇧V / Ctrl⇧V opens capture from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (!meta || !event.shiftKey || event.key.toLowerCase() !== "v") return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  const confirmHead = useCallback(() => {
    if (!head || head.domain === "unknown") return
    append(`确认：${summarize(head)}`, "ok")
    confirmQueuedIntent(head)
    void navigate({ to: DOMAIN_ROUTE[head.domain] })
    setOpen(false)
  }, [append, head, navigate, setOpen])

  const skipHead = useCallback(() => {
    if (!head) return
    append(`已跳过：${summarize(head)}`, "warn")
    dropQueuedVoiceIntent(head)
    if (queue.length === 1) setPhase("done")
  }, [append, head, queue.length])

  const skipAll = useCallback(() => {
    for (const intent of queue) dropQueuedVoiceIntent(intent)
    append(`已跳过剩余 ${queue.length} 笔`, "warn")
    setPhase("done")
  }, [append, queue])

  const isRecording = phase === "recording"
  const isBusy = phase === "working"
  const reviewing = phase === "review" && head != null
  const actionLabel = isRecording ? "停止并识别" : isBusy ? "处理中…" : "开始说话"

  const toneClass: Record<LogLine["tone"], string> = {
    info: "text-[var(--ink-3)]",
    ok: "text-[var(--accent)]",
    warn: "text-[var(--red)]",
    error: "text-[var(--red)]",
  }

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) setOpen(false)
      }}
    >
      <Modal.Container>
        <Modal.Dialog style={{ maxWidth: 480 }}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <span className="flex items-center gap-2">
                <AppIcon name="voice" size={16} />
                语音 / 文本批量录入
              </span>
            </Modal.Heading>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
              说一句话，或粘贴一段文本；多笔记录会逐条确认后填入对应页面
            </p>
          </Modal.Header>
          <Modal.Body>
            {reviewing ? (
              <div className="rounded-[8px] border border-[var(--hair-2)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between text-[11px] text-[var(--ink-4)]">
                  <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
                    <AppIcon name={DOMAIN_ICON[head.domain]} size={13} />
                    {DOMAIN_LABEL[head.domain]}
                  </span>
                  <span>第 1 / {queue.length} 笔待确认</span>
                </div>
                <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink)]">
                  {summarize(head)}
                </div>
                {head.warnings.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {head.warnings.map((warning) => (
                      <li key={warning} className="text-[11px] text-[var(--red)]">
                        {warning}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" variant="primary" onPress={confirmHead}>
                    确认并填入
                  </Button>
                  <Button size="sm" variant="outline" onPress={skipHead}>
                    跳过
                  </Button>
                  {queue.length > 1 && (
                    <Button size="sm" variant="ghost" onPress={skipAll}>
                      全部跳过
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isRecording
                        ? "bubo-rec-dot bg-[var(--red)]"
                        : isBusy
                          ? "bubo-busy-dot bg-[var(--accent)]"
                          : phase === "done"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--ink-5)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1 text-[12.5px] text-[var(--ink)]">
                    {isRecording ? (
                      <>
                        正在录音
                        <span className="ml-1.5 font-mono text-[11.5px] text-[var(--red)]">
                          {seconds(elapsedMs)} / {seconds(MAX_RECORDING_MS)}
                        </span>
                      </>
                    ) : isBusy ? (
                      "识别与解析中"
                    ) : phase === "error" ? (
                      "处理失败，可重试"
                    ) : (
                      "说一句，或直接粘贴文本"
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isRecording ? "primary" : "outline"}
                    className="h-[28px] min-w-0 shrink-0 px-3 text-[12px]"
                    isDisabled={!supported || isBusy}
                    onPress={() => {
                      if (isRecording) stopRecording()
                      else void startRecording()
                    }}
                  >
                    {actionLabel}
                  </Button>
                </div>

                <div className="mt-1.5 text-[11px] leading-normal text-[var(--ink-4)]">
                  {supported ? HINT : "当前环境不支持麦克风录音，可直接粘贴文本解析。"}
                </div>

                <div className="mt-2.5">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault()
                        void parseText()
                      }
                    }}
                    rows={4}
                    placeholder={TEXT_PLACEHOLDER}
                    disabled={isBusy}
                    className="w-full resize-y rounded-[6px] border border-[var(--hair-2)] bg-[var(--surface-1)] px-2 py-1.5 text-[12px] leading-[1.7] text-[var(--ink)] outline-none placeholder:text-[var(--ink-5)] focus-visible:border-[var(--accent)]"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-[28px] px-3 text-[12px]"
                      isDisabled={isBusy || text.trim().length === 0}
                      onPress={() => void parseText()}
                    >
                      解析文本（⌘↵）
                    </Button>
                    <span className="text-[11px] text-[var(--ink-4)]">
                      跳过语音识别，直接交给模型逐笔抽取
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Fixed-height scrolling log so the dialog never jumps between stages. */}
            <div
              ref={logRef}
              className="mt-2.5 h-[120px] overflow-y-auto rounded-[6px] border border-[var(--hair-3)] bg-[var(--surface-1)] px-2 py-1.5"
            >
              {log.length === 0 ? (
                <div className="text-[11px] leading-[1.7] text-[var(--ink-4)]">
                  等待输入…这里会逐步显示识别、类别判断和逐笔抽取过程
                </div>
              ) : (
                log.map((line) => (
                  <div key={line.id} className="flex gap-1.5 text-[11px] leading-[1.7]">
                    <span className="shrink-0 font-mono text-[var(--ink-4)]">{line.time}</span>
                    <span className={`min-w-0 break-all ${toneClass[line.tone]}`}>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" onPress={() => setOpen(false)}>
              关闭
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
