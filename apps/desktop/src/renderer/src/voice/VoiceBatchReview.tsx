/**
 * @purpose Review a parsed voice batch as a tiled set of editable cards and save it in one action.
 * @role    Large review surface opened from the capture sheet when one input yields several records.
 * @deps    tRPC cashflow.create, the reference category list, DateInput, and the batch draft rules.
 * @gotcha  "保存全部" only persists cashflow cards; loans, subscriptions, assets, and trades keep
 *          their own page forms, so those cards stay in the queue and offer 填入表单 instead.
 *          Saved intents leave the queue before the parent closes, otherwise the badge would count
 *          records that already exist in the ledger.
 */

import { useMemo, useState } from "react"
import { Button, Checkbox, Input } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CategorySummary } from "@bubo/api"
import type { VoiceIntent } from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { DateInput } from "../components/ui/DateInput"
import {
  buildBatchDrafts,
  countSavableDrafts,
  isDraftSavable,
  toCashflowCreateInput,
  type BatchDraft,
} from "./batchDrafts"

interface Props {
  intents: readonly VoiceIntent[]
  /** Fill one record into its own page form (used for non-cashflow cards). */
  onFill: (intent: VoiceIntent) => void
  /** Remove every remaining card from the queue. */
  onSkipAll: () => void
  /** Called after a save attempt so the sheet can log and decide whether to close. */
  onSaved: (saved: number, remaining: number) => void
}

const DOMAIN_LABEL: Record<string, string> = {
  cashflow: "流水",
  loan: "贷款",
  subscription: "订阅",
  asset: "资产",
  investment: "投资",
  unknown: "未识别",
}

const FIELD_CLASS =
  "w-full rounded-[6px] border border-[var(--hair-2)] bg-[var(--surface-1)] px-2 py-1.5 " +
  "text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-5)] " +
  "focus-visible:border-[var(--accent)]"

function summarizeNonCashflow(intent: VoiceIntent): string {
  switch (intent.domain) {
    case "loan":
      return `${intent.name} · 月供 ${intent.paymentAmount || "待填"}`
    case "subscription":
      return `${intent.name} · ${intent.amount || "待填"} / ${intent.billingCycle}`
    case "asset":
      return `${intent.accountName} · ${intent.valueAmount || "待填"}`
    case "investment":
      return `${intent.side === "sell" ? "卖出" : "买入"} ${intent.symbol} × ${intent.quantity || "待填"}`
    default:
      return intent.domain === "unknown" ? "未识别" : ""
  }
}

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: CategorySummary[]
  value: string | null
  onChange: (next: string | null) => void
}) {
  const selected = categories.find((category) => String(category.id) === String(value))
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((category) => {
        const active = String(category.id) === String(value)
        const color = category.color ?? "var(--ink-4)"
        return (
          <button
            key={String(category.id)}
            type="button"
            onClick={() => onChange(String(category.id))}
            className="h-[24px] cursor-pointer rounded-[5px] border px-2 text-[11.5px]"
            style={{
              borderColor: active ? color : "var(--hair-2)",
              background: active ? `${color}1f` : "var(--surface-1)",
              color: active ? color : "var(--ink-3)",
              fontWeight: active ? 650 : 500,
            }}
          >
            {category.name}
          </button>
        )
      })}
      {selected == null && value != null && (
        <span className="self-center text-[11px] text-[var(--red)]">分类不在账本中</span>
      )}
    </div>
  )
}

export function VoiceBatchReview({ intents, onFill, onSkipAll, onSaved }: Props) {
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery(trpc.reference.categories.queryOptions())
  const createCashflow = useMutation(trpc.cashflow.create.mutationOptions())
  const [drafts, setDrafts] = useState<BatchDraft[]>(() => buildBatchDrafts(intents))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => !category.archived),
    [categoriesQuery.data],
  )
  const savableCount = countSavableDrafts(drafts)
  const otherDrafts = drafts.filter((draft) => draft.intent.domain !== "cashflow")

  function patchDraft(key: string, patch: Partial<BatchDraft>) {
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)))
  }

  async function saveAll() {
    const targets = drafts.filter(isDraftSavable)
    if (targets.length === 0 || saving) return
    setSaving(true)
    setErrors({})
    const saved: BatchDraft[] = []
    const failed: Record<string, string> = {}
    for (const draft of targets) {
      const input = toCashflowCreateInput(draft)
      if (!input) continue
      try {
        await createCashflow.mutateAsync(input)
        saved.push(draft)
      } catch (error) {
        failed[draft.key] = error instanceof Error ? error.message : String(error)
      }
    }
    setSaving(false)
    setErrors(failed)
    if (saved.length === 0) return
    setDrafts((list) => list.filter((draft) => !saved.some((item) => item.key === draft.key)))
    await queryClient.invalidateQueries()
    onSaved(saved.length, drafts.length - saved.length)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between text-[11.5px] text-[var(--ink-4)]">
        <span>
          共 {drafts.length} 笔待处理，其中 {savableCount} 笔流水可直接保存
        </span>
        <span>调整后点「保存全部」，非流水记录用「填入表单」逐条确认</span>
      </div>

      <div className="grid max-h-[62vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1">
        {drafts.map((draft, index) => {
          const intent = draft.intent
          const flowKind = intent.domain === "cashflow" ? intent.flowKind : "expense"
          const error = errors[draft.key]
          return (
            <div
              key={draft.key}
              className="rounded-[8px] border p-2.5"
              style={{
                borderColor: error ? "var(--red)" : "var(--hair-2)",
                background: draft.include ? "var(--surface-1)" : "var(--surface-2)",
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-['IBM_Plex_Mono'] text-[11px] text-[var(--ink-4)]">
                  {index + 1}
                </span>
                <span
                  className="text-[11.5px] font-medium"
                  style={{ color: flowKind === "income" ? "var(--accent)" : "var(--red)" }}
                >
                  {DOMAIN_LABEL[intent.domain] ?? intent.domain} ·{" "}
                  {flowKind === "income" ? "收入" : "支出"}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {intent.domain === "cashflow" ? (
                    <Checkbox
                      isSelected={draft.include}
                      onChange={(selected) => patchDraft(draft.key, { include: selected })}
                      aria-label="保存这一笔"
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-[24px] px-2 text-[11.5px]"
                      onPress={() => onFill(intent)}
                    >
                      填入表单
                    </Button>
                  )}
                </div>
              </div>

              {intent.domain === "cashflow" ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <Input
                      variant="secondary"
                      className="flex-1"
                      placeholder="项目"
                      value={draft.title}
                      onChange={(event) => patchDraft(draft.key, { title: event.target.value })}
                    />
                    <Input
                      variant="secondary"
                      className="w-[100px]"
                      placeholder="金额"
                      value={draft.amount}
                      onChange={(event) => patchDraft(draft.key, { amount: event.target.value })}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <DateInput
                        value={draft.date}
                        onChange={(next) => patchDraft(draft.key, { date: next })}
                        size="sm"
                      />
                    </div>
                    <Input
                      variant="secondary"
                      className="w-[110px]"
                      placeholder="来源"
                      value={draft.source}
                      onChange={(event) => patchDraft(draft.key, { source: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[11px] text-[var(--ink-4)]">分类</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-2)]">
                      {categories.find(
                        (category) => String(category.id) === String(draft.categoryId),
                      )?.name ??
                        intent.categoryName ??
                        "未识别"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-[22px] px-1.5 text-[11px]"
                      onPress={() =>
                        setExpanded((current) => (current === draft.key ? null : draft.key))
                      }
                    >
                      {expanded === draft.key ? "收起" : "改"}
                    </Button>
                  </div>
                  {expanded === draft.key && (
                    <div className="max-h-[110px] overflow-y-auto rounded-[6px] border border-[var(--hair-3)] p-1.5">
                      <CategoryPicker
                        categories={categories}
                        value={draft.categoryId}
                        onChange={(next) => {
                          patchDraft(draft.key, { categoryId: next })
                          setExpanded(null)
                        }}
                      />
                    </div>
                  )}
                  <input
                    className={FIELD_CLASS}
                    placeholder="备注（可选）"
                    value={draft.note}
                    onChange={(event) => patchDraft(draft.key, { note: event.target.value })}
                  />
                </div>
              ) : (
                <div className="text-[12px] text-[var(--ink-2)]">
                  {summarizeNonCashflow(intent)}
                </div>
              )}

              {intent.warnings.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {intent.warnings.map((warning) => (
                    <li key={warning} className="text-[11px] text-[var(--red)]">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <div className="mt-1.5 text-[11px] text-[var(--red)]">保存失败：{error}</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="rounded-[5px]"
          isDisabled={savableCount === 0 || saving}
          onPress={() => void saveAll()}
        >
          {saving ? "保存中…" : `保存全部（${savableCount} 笔流水）`}
        </Button>
        {otherDrafts.length > 0 && (
          <span className="text-[11px] text-[var(--ink-4)]">
            另有 {otherDrafts.length} 笔非流水记录需逐条填入表单
          </span>
        )}
        <Button variant="outline" className="ml-auto rounded-[5px]" onPress={onSkipAll}>
          全部跳过
        </Button>
      </div>
    </div>
  )
}
