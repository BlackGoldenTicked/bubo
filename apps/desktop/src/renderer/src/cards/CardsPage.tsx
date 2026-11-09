/**
 * @purpose Manage the user's payment cards and their scans.
 * @role    Renderer feature page for the card wallet route.
 * @deps    tRPC cards router, the flat/3D card visual, and renderer UI atoms.
 * @gotcha  A card never changes money: this page only edits identity data and local scans.
 *          Scans are fetched per face with the scan's `updatedAt` in the query key, otherwise
 *          replacing an image would leave the old data URL on screen. Files stay in the
 *          sidecar's folder; nothing here writes to disk. The wallet list groups cards by
 *          bank (heaviest bank first, collapsible) and has two views over the same groups:
 *          列表 (compact rows) and 卡片 (image-first piles, see CardStackList). The chosen
 *          view is remembered per device. There is no page header on purpose: the wallet list
 *          owns the single add action at its foot, and totals are not shown — the route title
 *          comes from the top navigation.
 */

import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { Button } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppIcon, Segmented, notify } from "@bubo/ui"
import { currencySymbol } from "@bubo/shared"
import type { CardSide, CardSummary } from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { useCurrentRates } from "@/lib/useCurrentRates"
import { useConfirm } from "../components/ui/ConfirmModal"
import { EmptyState } from "../components/ui/EmptyState"
import { QueryState } from "../components/ui/QueryState"
import { ScrollArea } from "../components/ui/ScrollArea"
import { CardVisual, CardScanControls } from "./CardVisual"
import { CardStackList } from "./CardStackList"
import { CARD_TYPE_LABEL } from "./labels"
import { useCardScan } from "./useCardScan"
import {
  CardFormModal,
  formToInput,
  type CardFormValues,
  type CardScanPaths,
} from "./CardFormModal"

const BRAND_LABEL: Record<CardSummary["brand"], string> = {
  unionpay: "银联",
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  jcb: "JCB",
  other: "其他",
}

type WalletView = "list" | "stack"
const WALLET_VIEW_STORAGE_KEY = "bubo:cards:wallet-view"
/** 列表 stays the default: it is the denser view and what existing users expect. */
const DEFAULT_WALLET_VIEW: WalletView = "list"

function readWalletView(): WalletView {
  try {
    return window.localStorage.getItem(WALLET_VIEW_STORAGE_KEY) === "stack" ? "stack" : "list"
  } catch {
    return DEFAULT_WALLET_VIEW
  }
}

function rememberWalletView(view: WalletView) {
  try {
    window.localStorage.setItem(WALLET_VIEW_STORAGE_KEY, view)
  } catch {
    // A blocked storage API must not break the view switch.
  }
}

/**
 * Open on press start, not on release: the gesture is already committed when the pointer
 * goes down, so a release that the shell swallows (window activation, focus change) cannot
 * leave the button looking dead while the user has to click again.
 */
function pressStarts(open: () => void) {
  return (event: ReactPointerEvent) => {
    if (event.button === 0) open()
  }
}

export function CardsPage() {
  const queryClient = useQueryClient()
  const { base, baseSymbol } = useCurrentRates()
  const confirm = useConfirm()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [busySide, setBusySide] = useState<CardSide | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CardSummary | null>(null)
  const [collapsedBanks, setCollapsedBanks] = useState<Set<string>>(() => new Set())
  const [walletView, setWalletView] = useState<WalletView>(readWalletView)

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

  const grouped = useMemo(() => {
    const map = new Map<string, CardSummary[]>()
    for (const card of cards) {
      const bank = card.bank.trim() || "未填银行"
      map.set(bank, [...(map.get(bank) ?? []), card])
    }
    // Heaviest banks first, then by name so the order never jitters between renders.
    return [...map.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"),
    )
  }, [cards])

  function toggleBank(bank: string) {
    setCollapsedBanks((current) => {
      const next = new Set(current)
      if (next.has(bank)) next.delete(bank)
      else next.add(bank)
      return next
    })
  }

  function changeWalletView(next: string) {
    const view: WalletView = next === "stack" ? "stack" : "list"
    setWalletView(view)
    rememberWalletView(view)
  }

  function selectCard(card: CardSummary) {
    setSelectedId(String(card.id))
    setFlipped(false)
  }

  function openForm() {
    setFormOpen(true)
  }

  function openCreate() {
    setEditing(null)
    openForm()
  }

  function openEdit(card: CardSummary) {
    setEditing(card)
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex shrink-0 flex-col border-r border-[var(--hair-2)] ${
            walletView === "stack" ? "w-[300px]" : "w-[320px]"
          }`}
        >
          <div className="px-5 pb-2 pt-4">
            <div className="flex items-center justify-between">
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
            <Segmented
              className="mt-2.5"
              value={walletView}
              onChange={changeWalletView}
              options={[
                { key: "list", label: "列表" },
                { key: "stack", label: "卡片" },
              ]}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <QueryState query={cardsQuery} skeletonRows={5}>
              {cards.length === 0 ? (
                <EmptyState
                  icon="cards"
                  title="还没有卡片"
                  hint="用下面的按钮添加第一张卡，再上传正反面扫描件"
                />
              ) : walletView === "stack" ? (
                <CardStackList
                  groups={grouped}
                  selectedId={selected == null ? null : String(selected.id)}
                  collapsedBanks={collapsedBanks}
                  onSelect={selectCard}
                  onToggleBank={toggleBank}
                />
              ) : (
                <div className="px-2 pb-6">
                  {grouped.map(([bank, bankCards]) => {
                    const isCollapsed = collapsedBanks.has(bank)
                    return (
                      <section key={bank} className="mt-1">
                        <button
                          type="button"
                          onClick={() => toggleBank(bank)}
                          aria-expanded={!isCollapsed}
                          className="sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-[2px] bg-[var(--surface-1)] px-2 py-1.5 text-left"
                        >
                          <AppIcon
                            name="chevronRight"
                            size={11}
                            className={`text-[var(--ink-4)] transition-transform duration-150 ${
                              isCollapsed ? "" : "rotate-90"
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[.04em] text-[var(--ink-3)]">
                            {bank}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-[var(--ink-4)]">
                            {bankCards.length}
                          </span>
                        </button>
                        {!isCollapsed &&
                          bankCards.map((card) => {
                            const isSelected =
                              selected != null && String(selected.id) === String(card.id)
                            return (
                              <button
                                key={String(card.id)}
                                type="button"
                                aria-selected={isSelected}
                                onClick={() => selectCard(card)}
                                className="bubo-row flex w-full items-center gap-3 rounded-[2px] px-2 py-2 text-left"
                              >
                                <CardThumb card={card} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12.5px] text-[var(--ink)]">
                                    {card.name}
                                  </span>
                                  <span className="block truncate text-[10.5px] text-[var(--ink-4)]">
                                    {CARD_TYPE_LABEL[card.cardType]} ·{" "}
                                    {card.numberLast4 ? `•••• ${card.numberLast4}` : "未填卡号"}
                                  </span>
                                </span>
                                {card.status === "archived" && (
                                  <span className="text-[10px] text-[var(--ink-4)]">已归档</span>
                                )}
                              </button>
                            )
                          })}
                      </section>
                    )
                  })}
                </div>
              )}
            </QueryState>
          </ScrollArea>
          {/* The list owns the only add action: the page header is gone, so this stays
              anchored under the wallet instead of floating in a toolbar. */}
          <div className="shrink-0 border-t border-[var(--hair-2)] px-4 py-3">
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onPointerDown={pressStarts(openCreate)}
              onPress={openCreate}
            >
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
                onEdit={() => openEdit(selected)}
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

      <CardFormModal
        open={formOpen}
        card={editing}
        defaultCurrency={base}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSave={handleSave}
      />
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
            {card.bank} · {CARD_TYPE_LABEL[card.cardType]} · {BRAND_LABEL[card.brand]}
            {card.status === "archived" ? " · 已归档" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onPointerDown={pressStarts(onEdit)} onPress={onEdit}>
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

/** Wallet list thumbnail: the front scan when one exists, else the card's own gradient. */
function CardThumb({ card }: { card: CardSummary }) {
  const front = useCardScan(card, "front")
  return (
    <span
      aria-hidden="true"
      className="relative block h-[26px] w-[41px] shrink-0 overflow-hidden rounded-[3px]"
      style={{
        background: card.colorHex
          ? `linear-gradient(135deg, ${card.colorHex}, color-mix(in srgb, ${card.colorHex} 70%, #000))`
          : "linear-gradient(135deg, #2f6f8f, #1b3a5c)",
      }}
    >
      {front.data && <img src={front.data} alt="" className="h-full w-full object-cover" />}
    </span>
  )
}
