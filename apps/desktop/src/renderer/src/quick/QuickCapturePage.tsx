/**
 * @purpose Record one utterance from the menu bar, parse it, and let the user save it in place.
 * @role    Renderer surface for the floating quick-capture window.
 * @deps    tRPC voice/cashflow/subscription/loan mutations, the recorder, and the Tauri event bus.
 * @gotcha  This window is the whole flow: mic → ASR → intent → save → hide. It must never
 *          navigate, because there is no shell here. Non-cashflow domains that need an existing
 *          account or position hand the intent back to the main window through
 *          `bubo://voice-intent` and close, so the page's own form stays the only writer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@heroui/react"
import { useMutation } from "@tanstack/react-query"
import { AppIcon, notify } from "@bubo/ui"
import { currencySymbol } from "@bubo/shared"
import type { VoiceIntent } from "@bubo/shared/contracts"
import { trpc, trpcClient } from "@/lib/trpc"
import { MAX_RECORDING_MS, VoiceRecorder } from "@/lib/voice/audioRecorder"

type Phase = "idle" | "recording" | "working" | "review" | "done" | "error"

const DOMAIN_LABEL: Record<VoiceIntent["domain"], string> = {
  cashflow: "流水",
  loan: "贷款",
  subscription: "订阅",
  asset: "资产",
  investment: "投资",
  unknown: "未识别",
}

const DOMAIN_HINT: Record<VoiceIntent["domain"], string> = {
  cashflow: "记一笔收支",
  loan: "新贷款或还款计划",
  subscription: "周期性扣费",
  asset: "账户余额",
  investment: "买入或卖出",
  unknown: "没有听清",
}

export function QuickCapturePage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [status, setStatus] = useState("按快捷键开始说话")
  const [transcript, setTranscript] = useState("")
  const [intents, setIntents] = useState<VoiceIntent[]>([])
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const startedRef = useRef(false)

  const createCashflow = useMutation(trpc.cashflow.create.mutationOptions())
  const createSubscription = useMutation(trpc.subscriptions.create.mutationOptions())
  const createLoan = useMutation(trpc.loans.create.mutationOptions())

  const start = useCallback(async () => {
    if (recorderRef.current?.isRecording) return
    const recorder = recorderRef.current ?? new VoiceRecorder()
    recorderRef.current = recorder
    try {
      await recorder.start()
      setPhase("recording")
      setStatus("正在收音…再按一次结束")
      setIntents([])
      setTranscript("")
      setElapsed(0)
    } catch (error) {
      setPhase("error")
      setStatus(error instanceof Error ? error.message : "无法使用麦克风")
    }
  }, [])

  const stopAndParse = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder?.isRecording) return
    setPhase("working")
    setStatus("识别中…")
    let recording
    try {
      recording = await recorder.stop()
    } catch (error) {
      setPhase("error")
      setStatus(error instanceof Error ? error.message : "录音失败")
      return
    }
    try {
      const result = await trpcClient.voice.parseIntent.mutate({
        audioBase64: recording.audioBase64,
        mimeType: recording.mimeType,
        language: "zh",
      })
      setTranscript(result.transcript)
      const usable = result.intents.filter((intent) => intent.domain !== "unknown")
      if (usable.length === 0) {
        setPhase("error")
        setStatus("没有识别出可保存的记录，换个说法再试一次")
        return
      }
      setIntents(usable)
      setPhase("review")
      setStatus(usable.length > 1 ? `识别到 ${usable.length} 笔，逐笔保存` : "确认后保存")
    } catch (error) {
      setPhase("error")
      setStatus(error instanceof Error ? error.message : "解析失败")
    }
  }, [])

  const toggle = useCallback(() => {
    if (phase === "recording") void stopAndParse()
    else void start()
  }, [phase, start, stopAndParse])

  /** The shortcut (or the tray menu) re-arms the window instead of mounting a new one. */
  useEffect(() => {
    let dispose: (() => void) | null = null
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        dispose = await listen("quick-capture:start", () => {
          setPhase("idle")
          setStatus("按快捷键开始说话")
          setIntents([])
          setTranscript("")
          void start()
        })
      } catch {
        // Running outside Tauri (tests): the manual button still works.
      }
    })()
    return () => dispose?.()
  }, [start])

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      void start()
    }
  }, [start])

  useEffect(() => {
    if (phase !== "recording") return
    const timer = window.setInterval(() => {
      const ms = recorderRef.current?.elapsedMs ?? 0
      setElapsed(ms)
      if (ms >= MAX_RECORDING_MS) void stopAndParse()
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase, stopAndParse])

  const head = intents[0] ?? null

  function advance() {
    const rest = intents.slice(1)
    setIntents(rest)
    if (rest.length === 0) void closeWindow()
    else setStatus(`还剩 ${rest.length} 笔`)
  }

  async function closeWindow() {
    setPhase("idle")
    setStatus("按快捷键开始说话")
    try {
      await window.bubo.hideQuickCapture()
    } catch {
      // ignore: the window may already be closing
    }
  }

  async function saveHead() {
    if (!head) return
    try {
      if (head.domain === "cashflow") {
        await createCashflow.mutateAsync({
          eventDate: head.eventDate,
          title: head.title,
          counterparty: head.title,
          amount: head.amount,
          direction: head.flowKind === "income" ? "in" : "out",
          flowKind: head.flowKind,
          categoryId: head.categoryId ?? null,
          sourceKind: "manual",
          sourceName: "语音",
          userNote: head.note ?? null,
          includeInAnalytics: true,
          classificationSource: "manual",
        })
      } else if (head.domain === "subscription") {
        await createSubscription.mutateAsync({
          name: head.name,
          amount: head.amount,
          currency: head.currency,
          billingCycle: head.billingCycle,
          intervalCount: head.intervalCount,
          nextChargeDate: head.nextChargeDate,
          autoRenew: head.autoRenew,
          note: head.note ?? null,
        })
      } else if (head.domain === "loan") {
        await createLoan.mutateAsync({
          name: head.name,
          lender: head.lender ?? null,
          currency: head.currency ?? "CNY",
          principalAmount: head.principalAmount || null,
          paymentAmount: head.paymentAmount,
          annualRateBps:
            head.annualRatePercent.trim().length > 0
              ? Math.round(Number(head.annualRatePercent) * 100)
              : null,
          startDate: head.startDate,
          termMonths: head.termMonths ?? null,
          paymentDay: head.paymentDay ?? null,
          note: head.note ?? null,
        })
      } else {
        await handOff(head)
        return
      }
      notify.success(`已保存${DOMAIN_LABEL[head.domain]}`)
      advance()
    } catch {
      // The global mutation cache already surfaced the error toast.
    }
  }

  async function handOff(intent: VoiceIntent) {
    try {
      const { emit } = await import("@tauri-apps/api/event")
      await emit("bubo://voice-intent", intent)
      await window.bubo.showMainWindow()
      await closeWindow()
    } catch {
      notify.error("无法交接给主窗口")
    }
  }

  const amountValue = head && head.domain === "cashflow" ? head.amount : null

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden border border-[var(--hair)] bg-[var(--surface-1)] text-[var(--ink)]"
      style={{ fontFamily: "inherit" }}
    >
      <header
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-2 border-b border-[var(--hair-2)] px-4 py-3"
      >
        <AppIcon name="voice" size={14} className="text-[var(--accent)]" />
        <span className="text-[12.5px] font-semibold">语音录入</span>
        <span className="ml-auto text-[10.5px] text-[var(--ink-4)]">
          {phase === "recording" ? `${(elapsed / 1000).toFixed(1)}s` : "Esc 关闭"}
        </span>
        <button
          type="button"
          aria-label="关闭"
          onClick={() => void closeWindow()}
          className="text-[var(--ink-4)] transition-colors hover:text-[var(--ink)]"
        >
          ✕
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4">
        <button
          type="button"
          onClick={toggle}
          disabled={phase === "working"}
          className="mx-auto flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full border transition-colors"
          style={{
            borderColor: phase === "recording" ? "var(--red)" : "var(--hair)",
            background:
              phase === "recording"
                ? "color-mix(in srgb, var(--red) 12%, transparent)"
                : "var(--surface-2)",
            color: phase === "recording" ? "var(--red)" : "var(--accent)",
          }}
        >
          <AppIcon name="voice" size={30} />
        </button>

        <div className="text-center text-[12px] text-[var(--ink-2)]">{status}</div>

        {transcript && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--hair-2)] px-3 py-2 text-[11.5px] text-[var(--ink-3)]">
            「{transcript}」
          </div>
        )}

        {head && phase === "review" && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--hair-2)] px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--row-selected)] px-2 py-[2px] text-[10.5px] text-[var(--accent)]">
                {DOMAIN_LABEL[head.domain]}
              </span>
              <span className="text-[10.5px] text-[var(--ink-4)]">{DOMAIN_HINT[head.domain]}</span>
              {intents.length > 1 && (
                <span className="ml-auto text-[10.5px] text-[var(--ink-4)]">
                  共 {intents.length} 笔
                </span>
              )}
            </div>

            <div className="text-[15px] font-semibold tabular-nums">
              {amountValue ? `${currencySymbol("CNY")}${amountValue}` : describe(head)}
            </div>
            <div className="text-[11.5px] text-[var(--ink-2)]">{summarize(head)}</div>

            {head.warnings.length > 0 && (
              <div className="text-[10.5px] text-[var(--orange,var(--ink-3))]">
                {head.warnings.join("；")}
              </div>
            )}

            <div className="mt-auto flex items-center gap-2 pt-2">
              <Button size="sm" variant="primary" onPress={() => void saveHead()}>
                保存
              </Button>
              <Button size="sm" variant="ghost" onPress={advance}>
                跳过
              </Button>
              {head.domain === "asset" || head.domain === "investment" ? (
                <Button size="sm" variant="ghost" onPress={() => void handOff(head)}>
                  去主窗口
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function describe(intent: VoiceIntent): string {
  switch (intent.domain) {
    case "subscription":
      return `${intent.name} · ${intent.amount}`
    case "loan":
      return `${intent.name} · 月供 ${intent.paymentAmount}`
    case "asset":
      return `${intent.accountName || "账户"} · ${intent.valueAmount}`
    case "investment":
      return `${intent.symbol} · ${intent.quantity} × ${intent.price}`
    default:
      return "待确认"
  }
}

function summarize(intent: VoiceIntent): string {
  switch (intent.domain) {
    case "cashflow":
      return `${intent.eventDate} · ${intent.title}${intent.categoryName ? ` · ${intent.categoryName}` : ""}`
    case "subscription":
      return `${intent.billingCycle} · 下次 ${intent.nextChargeDate}`
    case "loan":
      return `${intent.lender ?? "贷款"} · ${intent.startDate} 起`
    case "asset":
      return `余额 ${intent.valueAmount} · ${intent.currency}`
    case "investment":
      return `${intent.side === "sell" ? "卖出" : "买入"} · ${intent.executedAt}`
    default:
      return intent.reason
  }
}
