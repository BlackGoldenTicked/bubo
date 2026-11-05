/**
 * @purpose Capture one utterance anywhere in the app and open the matching page with its form filled.
 * @role    System-level voice entry surface mounted in the root layout.
 * @deps    tRPC transcribe/parseIntent, the browser recorder, HeroUI modal primitives, the router,
 *          and the domain-scoped intent handoff bus.
 * @gotcha  The model only proposes an intent: this sheet never writes to the ledger. It logs each
 *          stage (record → ASR → reasoning → domain) so a slow provider still looks alive, then
 *          navigates and hands the intent to the page, whose existing mutation stays the only writer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Button, Modal } from "@heroui/react"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useAtom } from "jotai"
import type { VoiceIntent } from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { voiceCaptureOpenAtom } from "@/lib/state/uiAtoms"
import { MAX_RECORDING_MS, VoiceRecorder, type VoiceRecording } from "@/lib/voice/audioRecorder"
import { deliverVoiceIntent } from "@/lib/voice/intentHandoff"

type Phase = "idle" | "recording" | "working" | "done" | "error"

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

const DOMAIN_LABEL = {
  cashflow: "流水",
  loan: "贷款",
  subscription: "订阅",
  asset: "资产",
  investment: "投资",
} as const

const HINT =
  "“中午吃饭花了三十八块五” · “招行卡里有八万” · “买十股苹果每股一百八” · “房贷月供五千八” · “Netflix 每月六十”"

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
      return `已填入记账表单：${intent.title} ${intent.amount || "（金额待填）"}`
    case "loan":
      return `已打开贷款页：${intent.name} 月供 ${intent.paymentAmount || "（待填）"}`
    case "subscription":
      return `已打开订阅页：${intent.name} ${intent.amount || "（待填）"} / ${intent.billingCycle}`
    case "asset":
      return `已打开资产页：${intent.accountName} ${intent.valueAmount || "（待填）"}`
    case "investment":
      return `已打开投资页：${intent.side === "sell" ? "卖出" : "买入"} ${intent.symbol} × ${intent.quantity}`
    default:
      return "未能判断要记录的对象"
  }
}

export function VoiceCaptureSheet() {
  const [open, setOpen] = useAtom(voiceCaptureOpenAtom)
  const navigate = useNavigate()
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const logIdRef = useRef(0)
  const closingRef = useRef<number | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const supported = VoiceRecorder.isSupported()

  const append = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    logIdRef.current += 1
    setLog((lines) => [...lines, { id: logIdRef.current, time: clockNow(), text, tone }])
  }, [])

  useEffect(() => {
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [log])

  const transcribe = useMutation(trpc.voice.transcribe.mutationOptions())
  const parseIntent = useMutation(trpc.voice.parseIntent.mutationOptions())

  const finish = useCallback(
    (intent: VoiceIntent) => {
      if (intent.domain === "unknown") {
        append(intent.reason, "error")
        setPhase("error")
        return
      }
      append(`识别为${DOMAIN_LABEL[intent.domain]}`, "ok")
      for (const warning of intent.warnings) append(warning, "warn")
      append(summarize(intent), "ok")
      setPhase("done")
      // Let the log line paint before the sheet closes and the route changes.
      closingRef.current = window.setTimeout(() => {
        deliverVoiceIntent(intent)
        void navigate({ to: DOMAIN_ROUTE[intent.domain] })
        setOpen(false)
      }, 320)
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
      append("大模型判断类别并抽取字段…（推理池优先）")
      try {
        const result = await parseIntent.mutateAsync({ transcript })
        append(`解析完成：${result.models.llm}（${seconds(result.timings.llmMs)}）`, "ok")
        finish(result.intent)
      } catch (error) {
        append(`解析失败：${error instanceof Error ? error.message : String(error)}`, "error")
        setPhase("error")
      }
    },
    [append, finish, parseIntent, transcribe],
  )

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

  // Reset when the sheet closes (also cancels a live recording) and clean up the close timer.
  useEffect(() => {
    if (open) return
    if (closingRef.current != null) {
      window.clearTimeout(closingRef.current)
      closingRef.current = null
    }
    recorderRef.current?.cancel()
    setPhase("idle")
    setElapsedMs(0)
    setLog([])
  }, [open])

  useEffect(
    () => () => {
      if (closingRef.current != null) window.clearTimeout(closingRef.current)
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

  const isRecording = phase === "recording"
  const isBusy = phase === "working"
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
        <Modal.Dialog style={{ maxWidth: 460 }}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>语音录入</Modal.Heading>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
              说一句话，自动判断记到流水、资产、投资、订阅还是贷款
            </p>
          </Modal.Header>
          <Modal.Body>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isRecording
                    ? "animate-pulse bg-[var(--red)]"
                    : isBusy
                      ? "animate-pulse bg-[var(--accent)]"
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
                ) : phase === "done" ? (
                  "已打开对应页面"
                ) : phase === "error" ? (
                  "处理失败，可重试"
                ) : (
                  "说一句要记录的事"
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
              {supported ? HINT : "当前环境不支持麦克风录音。"}
            </div>

            {/* Fixed-height scrolling log so the dialog never jumps between stages. */}
            <div
              ref={logRef}
              className="mt-2.5 h-[132px] overflow-y-auto rounded-[6px] border border-[var(--hair-3)] bg-[var(--surface-1)] px-2 py-1.5"
            >
              {log.length === 0 ? (
                <div className="text-[11px] leading-[1.7] text-[var(--ink-4)]">
                  等待录音…这里会逐步显示识别、类别判断和字段抽取过程
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
