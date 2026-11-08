/**
 * @purpose Manage the user's payment cards and their scans.
 * @role    Renderer feature page for the card wallet route.
 * @deps    tRPC cards router, the flat/3D card visual, and renderer UI atoms.
 * @gotcha  A card never changes money: this page only edits identity data and local scans.
 *          Scans are fetched per face with the scan's `updatedAt` in the query key, otherwise
 *          replacing an image would leave the old data URL on screen. Files stay in the
 *          sidecar's folder; nothing here writes to disk.
 */

import { useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppIcon, notify } from "@bubo/ui"
import { currencySymbol } from "@bubo/shared"
import type { CardSide, CardSummary } from "@bubo/shared/contracts"
import { trpc, trpcClient } from "@/lib/trpc"
import { useCurrentRates } from "@/lib/useCurrentRates"
import { useConfirm } from "../components/ui/ConfirmModal"
import { EmptyState } from "../components/ui/EmptyState"
import { QueryState } from "../components/ui/QueryState"
import { ScrollArea } from "../components/ui/ScrollArea"
import { StatBlock } from "../components/ui/StatBlock"
import { CardVisual, CardScanControls } from "./CardVisual"
import {
  CardFormModal,
  formToInput,
  type CardFormValues,
  type CardScanPaths,
} from "./CardFormModal"

const TYPE_LABEL: Record<CardSummary["cardType"], string> = {
  debit: "借记卡",
  credit: "信用卡",
  prepaid: "预付卡",
  virtual: "虚拟卡",
  other: "其他",
}

const BRAND_LABEL: Record<CardSummary["brand"], string> = {
  unionpay: "银联",
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  jcb: "JCB",
  other: "其他",
}

function fmtAmount(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const { base, baseSymbol, toDisplay } = useCurrentRates()
  const confirm = useConfirm()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [busySide, setBusySide] = useState<CardSide | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CardSummary | null>(null)

  const cardsQuery = useQuery(trpc.cards.list.queryOptions({ includeArchived: showArchived }))
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data])
  const selected = cards.find((card) => String(card.id) === selectedId) ?? cards[0] ?? null

  const invalidate = () => queryClient.invalidateQueries(trpc.cards.list.queryFilter())

  const createCard = useMutation(
    trpc.cards.create.mutationOptions({
      onSuccess: (card) => {
        void invalidate()
        setSelectedId(String(card.id))
        notify.success("已添加卡片")
      },
    }),
  )
  const updateCard = useMutation(
    trpc.cards.update.mutationOptions({
      onSuccess: () => {
        void invalidate()
        notify.success("已保存卡片")
      },
    }),
  )
  const archiveCard = useMutation(
    trpc.cards.archive.mutationOptions({
      onSuccess: () => {
        void invalidate()
        notify.success("已更新卡片状态")
      },
    }),
  )
  const attachImage = useMutation(
    trpc.cards.attachImage.mutationOptions({
      onSuccess: (card) => {
        if (!card) return
        void invalidate()
        notify.success("已更新卡片图片")
      },
      onSettled: () => setBusySide(null),
    }),
  )
  const removeImage = useMutation(
    trpc.cards.removeImage.mutationOptions({
      onSuccess: () => {
        void invalidate()
        notify.success("已移除卡片图片")
      },
    }),
  )

  const totals = useMemo(() => {
    const active = cards.filter((card) => card.status === "active")
    const creditLimit = active.reduce((sum, card) => {
      if (card.cardType !== "credit" || !card.creditLimit) return sum
      return sum + (toDisplay(card.creditLimit, card.currency) ?? 0)
    }, 0)
    const creditCount = active.filter((card) => card.cardType === "credit").length
    const withScans = active.filter((card) => card.images.front || card.images.back).length
    return { count: active.length, creditLimit, creditCount, withScans }
  }, [cards, toDisplay])

  const grouped = useMemo(() => {
    const map = new Map<string, CardSummary[]>()
    for (const card of cards) {
      map.set(card.bank, [...(map.get(card.bank) ?? []), card])
    }
    return [...map.entries()]
  }, [cards])

  /**
   * Open the dialog on the next frame. WebKit can skip the paint of an overlay that is opened
   * inside the same event handler as the click, which read as "the first click does nothing".
   */
  function openForm() {
    requestAnimationFrame(() => setFormOpen(true))
  }

  function openCreate() {
    setEditing(null)
    openForm()
  }

  async function handleSave(values: CardFormValues, scans: CardScanPaths) {
    const input = formToInput(values)
    // Rethrow so the dialog stays open with the reason instead of closing silently.
    const saved = editing
      ? await updateCard.mutateAsync({ id: editing.id, ...input })
      : await createCard.mutateAsync(input)

    // The card row must exist before a scan can be attached; import each picked face in turn.
    for (const side of ["front", "back"] as const) {
      const path = scans[side]
      if (!path) continue
      try {
        await attachImage.mutateAsync({ cardId: saved.id, side, filePath: path })
      } catch (error) {
        throw new Error(
          `${side === "front" ? "正面" : "反面"}图片导入失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }

  function handlePick(side: CardSide) {
    if (!selected) return
    setBusySide(side)
    attachImage.mutate({ cardId: selected.id, side })
  }

  function handleRemove(side: CardSide) {
    if (!selected) return
    confirm({
      title: side === "front" ? "移除正面图片？" : "移除反面图片？",
      description: "卡片本身和另一面图片都会保留。",
      confirmText: "移除",
      danger: true,
      onConfirm: async () => {
        await removeImage.mutateAsync({ cardId: selected.id, side })
      },
    })
  }

  function handleArchive(card: CardSummary) {
    const archiving = card.status === "active"
    confirm({
      title: archiving ? "归档这张卡？" : "恢复这张卡？",
      description: archiving
        ? "归档后不再出现在列表里，卡面图片仍保留在本地。"
        : "恢复后会重新出现在卡片列表中。",
      confirmText: archiving ? "归档" : "恢复",
      danger: archiving,
      onConfirm: async () => {
        await archiveCard.mutateAsync({ id: card.id, archived: archiving })
      },
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="shrink-0 border-b border-[var(--hair-2)] px-8 pb-4 pt-7">
        <div className="flex items-start gap-10">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
              <AppIcon name="cards" size={13} className="text-[var(--ink-4)]" />
              卡片
            </div>
            <div className="mt-1 text-[13px] text-[var(--ink-2)]">
              管理银行卡、信用卡与预付卡，扫描件只保存在本机
            </div>
          </div>
          <div className="ml-auto flex items-end gap-8">
            <StatBlock icon="cards" label="卡片" value={`${totals.count} 张`} />
            <StatBlock
              icon="investments"
              label="信用卡额度"
              value={`${fmtAmount(totals.creditLimit, baseSymbol)} · ${totals.creditCount} 张`}
            />
            <StatBlock
              icon="import"
              label="已上传卡面"
              value={`${totals.withScans} / ${totals.count}`}
            />
            <Button size="sm" variant="primary" onPress={openCreate}>
              <AppIcon name="add" size={13} />
              添加卡片
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-[var(--hair-2)]">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[var(--ink-4)]">
              {showArchived ? "全部卡片" : "使用中"}
            </span>
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="text-[10.5px] text-[var(--accent)] transition-opacity hover:opacity-75"
            >
              {showArchived ? "只看使用中" : "显示已归档"}
            </button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <QueryState query={cardsQuery} skeletonRows={5}>
              {cards.length === 0 ? (
                <EmptyState
                  icon="cards"
                  title="还没有卡片"
                  hint="添加第一张卡，再上传正反面扫描件"
                  action={{ label: "添加卡片", onClick: openCreate }}
                />
              ) : (
                <div className="px-3 pb-6">
                  {grouped.map(([bank, bankCards]) => (
                    <div key={bank} className="mt-2">
                      <div className="px-2 pb-1 text-[10.5px] text-[var(--ink-4)]">{bank}</div>
                      {bankCards.map((card) => {
                        const isSelected =
                          selected != null && String(selected.id) === String(card.id)
                        return (
                          <button
                            key={String(card.id)}
                            type="button"
                            aria-selected={isSelected}
                            onClick={() => {
                              setSelectedId(String(card.id))
                              setFlipped(false)
                            }}
                            className="bubo-row flex w-full items-center gap-3 rounded-[2px] px-2 py-2 text-left"
                          >
                            <span
                              aria-hidden="true"
                              className="h-[26px] w-[40px] shrink-0 rounded-[3px]"
                              style={{
                                background: card.colorHex
                                  ? `linear-gradient(135deg, ${card.colorHex}, color-mix(in srgb, ${card.colorHex} 70%, #000))`
                                  : "linear-gradient(135deg, #2f6f8f, #1b3a5c)",
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] text-[var(--ink)]">
                                {card.name}
                              </span>
                              <span className="block truncate text-[10.5px] text-[var(--ink-4)]">
                                {TYPE_LABEL[card.cardType]} ·{" "}
                                {card.numberLast4 ? `•••• ${card.numberLast4}` : "未填卡号"}
                              </span>
                            </span>
                            {card.status === "archived" && (
                              <span className="text-[10px] text-[var(--ink-4)]">已归档</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </QueryState>
          </ScrollArea>
          {/* Always-visible add action: the list header is easy to miss when the pane is
              empty, and this keeps the affordance anchored to the list itself. */}
          <div className="shrink-0 border-t border-[var(--hair-2)] px-4 py-3">
            <Button size="sm" variant="secondary" className="w-full" onPress={openCreate}>
              <AppIcon name="add" size={12} />
              添加卡片
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {selected ? (
            <div className="mx-auto w-full max-w-[720px] px-8 pb-24 pt-7">
              <CardDetail
                card={selected}
                flipped={flipped}
                busySide={busySide}
                onFlip={() => setFlipped((value) => !value)}
                onFlipTo={setFlipped}
                onPick={handlePick}
                onRemove={handleRemove}
                onEdit={() => {
                  setEditing(selected)
                  openForm()
                }}
                onArchive={() => handleArchive(selected)}
                baseCurrency={base}
                baseSymbol={baseSymbol}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon="cards"
                title="选择一张卡片"
                hint="左侧列表里点选卡片，查看正反面与卡片信息"
              />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Portal to the body: the page clips its own overflow, which used to drag the dialog
          off-centre and delay its first paint. */}
      {createPortal(
        <CardFormModal
          open={formOpen}
          card={editing}
          defaultCurrency={base}
          existingScans={{
            front: editing?.images.front != null,
            back: editing?.images.back != null,
          }}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={handleSave}
        />,
        document.body,
      )}
    </div>
  )
}

function CardDetail({
  card,
  flipped,
  busySide,
  onFlip,
  onFlipTo,
  onPick,
  onRemove,
  onEdit,
  onArchive,
  baseCurrency,
  baseSymbol,
}: {
  card: CardSummary
  flipped: boolean
  busySide: CardSide | null
  onFlip: () => void
  onFlipTo: (flipped: boolean) => void
  onPick: (side: CardSide) => void
  onRemove: (side: CardSide) => void
  onEdit: () => void
  onArchive: () => void
  baseCurrency: string
  baseSymbol: string
}) {
  const frontQuery = useCardScan(card, "front")
  const backQuery = useCardScan(card, "back")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[16px] font-semibold text-[var(--ink)]">{card.name}</div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-4)]">
            {card.bank} · {TYPE_LABEL[card.cardType]} · {BRAND_LABEL[card.brand]}
            {card.status === "archived" ? " · 已归档" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onPress={onEdit}>
            <AppIcon name="edit" size={12} />
            编辑
          </Button>
          <Button size="sm" variant="ghost" onPress={onArchive}>
            <AppIcon name="remove" size={12} />
            {card.status === "active" ? "归档" : "恢复"}
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[430px]">
        <CardVisual
          card={card}
          frontUrl={frontQuery.data ?? null}
          backUrl={backQuery.data ?? null}
          flipped={flipped}
          onFlip={onFlip}
        />
      </div>

      <CardScanControls
        card={card}
        flipped={flipped}
        busySide={busySide}
        onFlipTo={onFlipTo}
        onPick={onPick}
        onRemove={onRemove}
      />

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-[var(--radius-sm)] border border-[var(--hair-2)] px-5 py-4">
        <InfoRow label="卡号">
          {card.numberLast4 ? `•••• •••• •••• ${card.numberLast4}` : "未填写"}
        </InfoRow>
        <InfoRow label="持卡人">{card.holderName ?? "未填写"}</InfoRow>
        <InfoRow label="币种">{card.currency}</InfoRow>
        <InfoRow label="有效期">
          {card.expiryMonth && card.expiryYear
            ? `${String(card.expiryMonth).padStart(2, "0")}/${card.expiryYear}`
            : "未填写"}
        </InfoRow>
        {card.cardType === "credit" && (
          <>
            <InfoRow label="信用额度">
              {card.creditLimit
                ? `${currencySymbol(card.currency)}${Number(card.creditLimit).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                : "未填写"}
            </InfoRow>
            <InfoRow label="账单 / 还款">
              {card.billingDay || card.repaymentDay
                ? `${card.billingDay ?? "-"} 日 / ${card.repaymentDay ?? "-"} 日`
                : "未填写"}
            </InfoRow>
          </>
        )}
        <InfoRow label="卡片图片">
          {[card.images.front ? "正面" : null, card.images.back ? "反面" : null]
            .filter(Boolean)
            .join(" · ") || "未上传"}
        </InfoRow>
        <InfoRow label="记账货币">
          {baseCurrency === card.currency ? "本币" : `折合 ${baseSymbol}`}
        </InfoRow>
      </div>

      {card.note && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--hair-2)] px-5 py-3 text-[12px] text-[var(--ink-2)]">
          {card.note}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10.5px] text-[var(--ink-4)]">{label}</span>
      <span className="text-[12px] text-[var(--ink-2)]">{children}</span>
    </div>
  )
}

/** Loads one face's data URL; the key carries `updatedAt` so a replaced scan refetches. */
function useCardScan(card: CardSummary, side: CardSide) {
  const meta = card.images[side]
  const query = useQuery({
    // `updatedAt` is part of the key: replacing a scan must not serve the old data URL.
    queryKey: ["cards.image", String(card.id), side, meta?.updatedAt ?? "none"],
    queryFn: () => trpcClient.cards.image.query({ cardId: card.id, side }),
    enabled: meta != null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  return { data: meta ? (query.data?.dataUrl ?? null) : null }
}
