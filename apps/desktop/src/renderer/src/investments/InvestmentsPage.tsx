/**
 * @purpose Render and manage the investment page: positions, trades, quotes, and P&L.
 * @role    Renderer feature surface for trade-driven investment positions.
 * @deps    React, tRPC queries, and shared renderer UI components.
 * @gotcha  Market value reaches net worth only through materialized asset snapshots;
 *          display math here must never feed balances back into the asymmetric model.
 */

import { memo, useMemo, useState } from "react"
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels"
import { Button, Segmented } from "@bubo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AddInvestmentTransactionInput,
  CreateInvestmentPositionInput,
  InvestmentPositionSummary,
} from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { useVoiceIntent } from "@/lib/voice/useVoiceIntent"
import { useMoney } from "@/lib/useMoney"
import { useCurrentRates } from "@/lib/useCurrentRates"
import { currencySymbol } from "@bubo/shared"
import { ScrollArea } from "../components/ui/ScrollArea"
import { Kicker } from "../components/ui/Kicker"
import { BigNumber } from "../components/ui/BigNumber"
import { StatBlock } from "../components/ui/StatBlock"
import { SectionTitle } from "../components/ui/SectionTitle"
import { Dim } from "../components/ui/Dim"
import { BackButton } from "../components/ui/BackButton"
import { useConfirm } from "../components/ui/ConfirmModal"
import { AddPositionModal, emptyPositionForm, type PositionForm } from "./AddPositionModal"
import { ContractsPanel } from "./ContractsPanel"
import { TradeModal, emptyTradeForm, type TradeForm } from "./TradeModal"
import { QuoteModal, emptyQuoteForm, type QuoteForm } from "./QuoteModal"
import { DeltaText } from "../components/ui/DeltaText"
import {
  computePositionPnl,
  INSTRUMENT_LABELS,
  SIDE_LABELS,
  STATUS_LABELS,
} from "./investmentDisplay"

interface PositionRowProps {
  position: InvestmentPositionSummary
  selected: boolean
  onSelect: (position: InvestmentPositionSummary) => void
}

type InvestmentTab = "spots" | "contracts"

/** View switcher options; keys must stay in sync with InvestmentTab. */
const VIEW_TABS = [
  { key: "spots", label: "现货持仓" },
  { key: "contracts", label: "合约仓位" },
]

const PositionRow = memo(function PositionRow({ position, selected, onSelect }: PositionRowProps) {
  const fmt = useMoney()
  const pnl = computePositionPnl(position)
  const symbol = currencySymbol(position.currency)
  const open = position.status === "open"
  const pnlValue = open ? pnl.unrealizedPnl : Number(position.realizedPnlAmount || 0)
  const pnlLabel = open ? "未实现" : "已实现"
  // The row leads with what was actually invested; market value stays in the detail panel.
  const costBasis =
    Number(position.costBasisAmount ?? 0) ||
    Number(position.quantity || 0) * Number(position.avgCostPrice ?? 0)

  return (
    <div style={{ borderBottom: "1px solid var(--hair-3)" }}>
      <Button
        variant="ghost"
        aria-selected={selected}
        onPress={() => onSelect(position)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          padding: "10px 6px",
          gap: 10,
          height: "auto",
          border: "none",
          borderRadius: 4,
          outline: "none",
          textAlign: "left",
          justifyContent: "flex-start",
          boxShadow: "none",
          background: selected ? "var(--row-selected)" : "transparent",
        }}
      >
        <div style={{ width: 170, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {position.symbol}
            {!open && (
              <span style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                {STATUS_LABELS.closed}
              </span>
            )}
          </div>
          <Dim style={{ fontSize: 10.5, marginTop: 1 }}>
            {position.name ? `${position.name} · ` : ""}
            {INSTRUMENT_LABELS[position.instrumentKind]}
            {position.accountName ? ` · ${position.accountName}` : ""}
          </Dim>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            <span style={{ fontSize: 10, color: "var(--ink-4)", marginRight: 4 }}>成本</span>
            {symbol}
            {fmt(costBasis, 2)}
          </div>
          <div style={{ fontSize: 10.5, marginTop: 1 }}>
            <DeltaText value={pnlValue}>
              {pnlLabel} {pnlValue >= 0 ? "+" : "−"}
              {symbol}
              {fmt(Math.abs(pnlValue), 2)}
              {open && pnl.unrealizedPnlPercent != null
                ? ` · ${pnl.unrealizedPnlPercent >= 0 ? "+" : "−"}${Math.abs(pnl.unrealizedPnlPercent).toFixed(1)}%`
                : ""}
            </DeltaText>
          </div>
        </div>
      </Button>
    </div>
  )
})

export function InvestmentsPage() {
  const fmt = useMoney()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [activeTab, setActiveTab] = useState<InvestmentTab>("spots")
  const positionsQuery = useQuery(trpc.investments.positions.queryOptions({}))
  const accountsQuery = useQuery(trpc.assets.items.queryOptions())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailQuery = useQuery({
    ...trpc.investments.position.queryOptions({ id: selectedId ?? "" }),
    enabled: selectedId != null,
  })
  const createPosition = useMutation(trpc.investments.createPosition.mutationOptions())
  const deletePosition = useMutation(trpc.investments.deletePosition.mutationOptions())
  const addTransaction = useMutation(trpc.investments.addTransaction.mutationOptions())
  const deleteTransaction = useMutation(trpc.investments.deleteTransaction.mutationOptions())
  const recordQuote = useMutation(trpc.investments.recordQuote.mutationOptions())
  usePagePerf("investments", [
    { name: "investments.positions", query: positionsQuery },
    { name: "investments.position", query: detailQuery },
    { name: "assets.items", query: accountsQuery },
  ])

  const [positionForm, setPositionForm] = useState<PositionForm>(emptyPositionForm())
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [tradeForm, setTradeForm] = useState<TradeForm>(emptyTradeForm(null))
  const [tradeTarget, setTradeTarget] = useState<InvestmentPositionSummary | null>(null)
  const [quoteForm, setQuoteForm] = useState<QuoteForm>(emptyQuoteForm(null))
  const [quoteTarget, setQuoteTarget] = useState<InvestmentPositionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { toDisplay, baseSymbol } = useCurrentRates()
  const positions = positionsQuery.data ?? []
  const openPositions = useMemo(
    () => positions.filter((position) => position.status === "open"),
    [positions],
  )
  const closedPositions = useMemo(
    () => positions.filter((position) => position.status === "closed"),
    [positions],
  )
  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((item) => !item.archived && item.assetType !== "liability")
        .map((item) => ({
          id: item.id,
          name: item.name,
          defaultCurrency: item.defaultCurrency,
        })),
    [accountsQuery.data],
  )

  // Voice intents: a matched holding takes a buy/sell trade, otherwise a position is opened.
  useVoiceIntent("investment", (intent) => {
    const matched =
      intent.action === "trade" && intent.positionId
        ? positions.find((position) => String(position.id) === intent.positionId)
        : undefined

    if (matched) {
      setSelectedId(String(matched.id))
      setTradeTarget(matched)
      setTradeForm({
        side: intent.side,
        quantity: intent.quantity,
        price: intent.price,
        feeAmount: intent.feeAmount ?? "",
        executedAt: intent.executedAt,
        note: intent.note ?? "",
      })
      return
    }

    setPositionForm({
      ...emptyPositionForm(),
      symbol: intent.symbol,
      name: intent.name ?? "",
      instrumentKind: intent.instrumentKind,
      currency: intent.currency,
      initialQuantity: intent.quantity,
      initialPrice: intent.price,
      initialFeeAmount: intent.feeAmount ?? "",
      initialExecutedAt: intent.executedAt,
      note: intent.note ?? "",
    })
    setShowAddPosition(true)
  })

  const totals = useMemo(() => {
    let marketValue = 0
    let costBasis = 0
    let unrealized = 0
    let realized = 0
    let missingFx = 0
    for (const position of positions) {
      const pnl = computePositionPnl(position)
      const converted = toDisplay(pnl.marketValue, position.currency)
      const convertedCost = toDisplay(Number(position.costBasisAmount ?? 0), position.currency)
      if (converted == null || convertedCost == null) {
        missingFx += 1
        continue
      }
      marketValue += converted
      costBasis += convertedCost
      unrealized += converted - convertedCost
      realized += toDisplay(Number(position.realizedPnlAmount || 0), position.currency) ?? 0
    }
    return { marketValue, costBasis, unrealized, realized, missingFx }
  }, [positions, toDisplay])

  const selectedPosition = useMemo(
    () => positions.find((position) => String(position.id) === selectedId) ?? null,
    [positions, selectedId],
  )
  const detail = detailQuery.data ?? null

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.investments.positions.queryFilter()),
      queryClient.invalidateQueries(trpc.investments.position.queryFilter()),
      queryClient.invalidateQueries(trpc.investments.quotes.queryFilter()),
      queryClient.invalidateQueries(trpc.assets.snapshots.queryFilter()),
      queryClient.invalidateQueries(trpc.assets.sparklines.queryFilter()),
      queryClient.invalidateQueries(trpc.assets.netWorth.queryFilter()),
    ])
  }

  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      await refreshAll()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  function openAddPosition() {
    setPositionForm(emptyPositionForm())
    setShowAddPosition(true)
  }

  function openTrade(position: InvestmentPositionSummary) {
    setTradeTarget(position)
    setTradeForm(emptyTradeForm(position.lastPrice))
  }

  function openQuote(position: InvestmentPositionSummary) {
    setQuoteTarget(position)
    setQuoteForm(emptyQuoteForm(position.lastPrice))
  }

  function savePosition(values: PositionForm) {
    const input: CreateInvestmentPositionInput = {
      symbol: values.symbol.trim(),
      name: values.name.trim() || null,
      instrumentKind: values.instrumentKind,
      currency: values.currency || "CNY",
      assetItemId: values.assetItemId === "" ? null : values.assetItemId,
      note: values.note.trim() || null,
      initialQuantity: values.initialQuantity.trim(),
      initialPrice: values.initialPrice.trim(),
      initialFeeAmount: values.initialFeeAmount.trim() || null,
      initialExecutedAt: `${values.initialExecutedAt}T00:00:00.000Z`,
    }
    void run(async () => {
      const created = await createPosition.mutateAsync(input)
      setShowAddPosition(false)
      setPositionForm(emptyPositionForm())
      setSelectedId(String(created.id))
    })
  }

  function saveTrade(values: TradeForm) {
    if (tradeTarget == null) return
    const input: AddInvestmentTransactionInput = {
      positionId: tradeTarget.id,
      side: values.side,
      quantity: values.quantity.trim(),
      price: values.price.trim(),
      feeAmount: values.feeAmount.trim() || null,
      executedAt: `${values.executedAt}T00:00:00.000Z`,
      note: values.note.trim() || null,
    }
    void run(async () => {
      await addTransaction.mutateAsync(input)
      setTradeTarget(null)
    })
  }

  function saveQuote(values: QuoteForm) {
    if (quoteTarget == null) return
    void run(async () => {
      await recordQuote.mutateAsync({
        symbol: quoteTarget.symbol,
        price: values.price.trim(),
        currency: quoteTarget.currency,
        quotedAt: `${values.quotedAt}T00:00:00.000Z`,
      })
      setQuoteTarget(null)
    })
  }

  function removePosition(position: InvestmentPositionSummary) {
    confirm({
      title: `删除持仓 ${position.symbol}`,
      description: "将删除该持仓的全部交易记录；若已关联账户，今天的物化市值快照也会一并清除。",
      confirmText: "删除",
      danger: true,
      onConfirm: () =>
        run(async () => {
          await deletePosition.mutateAsync({ id: position.id })
          if (String(position.id) === selectedId) setSelectedId(null)
        }),
    })
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--surface-1)",
      }}
    >
      {/* View tabs — spot positions or contract rows */}
      <div style={{ flexShrink: 0, padding: "16px 32px 0" }}>
        <Segmented
          size="md"
          options={VIEW_TABS}
          value={activeTab}
          onChange={(key) => setActiveTab(key as InvestmentTab)}
          aria-label="投资视图切换"
        />
      </div>

      {activeTab === "contracts" ? (
        <ContractsPanel />
      ) : (
        <>
          {/* Header — fixed, never scrolls */}
          <div
            style={{
              flexShrink: 0,
              padding: "16px 32px 16px",
              borderBottom: "1px solid var(--hair-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 36 }}>
              <div>
                <Kicker className="mb-1.5">投资 · 现在值多少</Kicker>
                <BigNumber style={{ fontSize: 40 }}>
                  <span style={{ fontSize: 18, marginRight: 6, fontWeight: 400 }}>
                    {baseSymbol}
                  </span>
                  {fmt(totals.marketValue)}
                </BigNumber>
                {totals.missingFx > 0 && (
                  <Dim style={{ fontSize: 10.5, marginTop: 4 }}>
                    {totals.missingFx} 个持仓缺少汇率，未计入合计
                  </Dim>
                )}
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 30,
                  paddingTop: 20,
                  alignItems: "center",
                }}
              >
                <StatBlock
                  icon="investments"
                  label="持仓成本"
                  value={`${baseSymbol}${fmt(totals.costBasis)}`}
                />
                <StatBlock
                  label="未实现盈亏"
                  value={
                    <span
                      style={{ color: totals.unrealized >= 0 ? "var(--accent)" : "var(--red)" }}
                    >
                      {totals.unrealized >= 0 ? "+" : "−"}
                      {baseSymbol}
                      {fmt(Math.abs(totals.unrealized))}
                    </span>
                  }
                />
                <StatBlock
                  label="已实现盈亏"
                  value={
                    <span style={{ color: totals.realized >= 0 ? "var(--accent)" : "var(--red)" }}>
                      {totals.realized >= 0 ? "+" : "−"}
                      {baseSymbol}
                      {fmt(Math.abs(totals.realized))}
                    </span>
                  }
                />
                <StatBlock label="持仓" value={openPositions.length} />
                <Button size="sm" variant="primary" onPress={openAddPosition}>
                  ＋ 新建持仓
                </Button>
              </div>
            </div>
            {error != null && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--red)" }}>{error}</div>
            )}
          </div>

          {/* Content — fills remaining height */}
          <PanelGroup
            orientation="horizontal"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            {/* Left: independently scrollable positions list */}
            <Panel defaultSize={60} minSize={30}>
              <ScrollArea className="h-full">
                <div style={{ padding: "16px 32px 112px" }}>
                  {[
                    { title: "持仓中", items: openPositions },
                    { title: "已清仓", items: closedPositions },
                  ].map(({ title, items }) => {
                    if (items.length === 0) return null
                    return (
                      <div key={title}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--ink-4)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            padding: "12px 0 4px",
                          }}
                        >
                          {title}
                        </div>
                        {items.map((position) => (
                          <PositionRow
                            key={position.id}
                            position={position}
                            selected={String(position.id) === selectedId}
                            onSelect={(next) => setSelectedId(String(next.id))}
                          />
                        ))}
                      </div>
                    )
                  })}
                  {positions.length === 0 && (
                    <div
                      style={{
                        padding: "28px 0",
                        fontSize: 12,
                        color: "var(--ink-4)",
                        lineHeight: 1.7,
                      }}
                    >
                      暂无持仓。新建持仓后，这里会按交易重放显示数量、成本和盈亏。
                    </div>
                  )}
                  <div
                    style={{ marginTop: 16, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.7 }}
                  >
                    持仓市值按当天自动写入关联账户的资产快照，净资产只读快照、不重复计算；
                    未关联账户的持仓只在本页展示，不进净资产。交易不会自动生成流水。
                  </div>
                </div>
              </ScrollArea>
            </Panel>

            <PanelResizeHandle
              style={{
                position: "relative",
                width: 4,
                background: "transparent",
                cursor: "col-resize",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "1.5px",
                  width: 1,
                  background: "var(--hair-2)",
                }}
              />
            </PanelResizeHandle>

            {/* Right: position detail */}
            <Panel defaultSize={40} minSize={20}>
              <ScrollArea className="h-full">
                <div style={{ padding: "16px 32px 112px" }}>
                  {selectedPosition == null ? (
                    <>
                      <SectionTitle icon="investments">持仓明细</SectionTitle>
                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 12,
                          color: "var(--ink-4)",
                          lineHeight: 1.7,
                        }}
                      >
                        从左侧选择一个持仓，查看交易记录、未实现盈亏，并录入买卖或现价。
                      </div>
                    </>
                  ) : (
                    <PositionDetail
                      position={selectedPosition}
                      transactions={detail?.transactions ?? []}
                      saving={saving}
                      onBack={() => setSelectedId(null)}
                      onTrade={() => openTrade(selectedPosition)}
                      onQuote={() => openQuote(selectedPosition)}
                      onDelete={() => removePosition(selectedPosition)}
                      onDeleteTransaction={(id) =>
                        void run(async () => {
                          await deleteTransaction.mutateAsync({ id })
                        })
                      }
                    />
                  )}
                </div>
              </ScrollArea>
            </Panel>
          </PanelGroup>

          <AddPositionModal
            open={showAddPosition}
            form={positionForm}
            accounts={accounts}
            saving={saving}
            onSave={savePosition}
            onClose={() => setShowAddPosition(false)}
          />
          <TradeModal
            open={tradeTarget != null}
            form={tradeForm}
            position={tradeTarget}
            saving={saving}
            onSave={saveTrade}
            onClose={() => setTradeTarget(null)}
          />
          <QuoteModal
            open={quoteTarget != null}
            form={quoteForm}
            position={quoteTarget}
            saving={saving}
            onSave={saveQuote}
            onClose={() => setQuoteTarget(null)}
          />
        </>
      )}
    </div>
  )
}

interface PositionDetailProps {
  position: InvestmentPositionSummary
  transactions: {
    id: string | number
    side: "buy" | "sell"
    quantity: string
    price: string
    feeAmount: string | null
    executedAt: string
    note: string | null
  }[]
  saving: boolean
  onBack: () => void
  onTrade: () => void
  onQuote: () => void
  onDelete: () => void
  onDeleteTransaction: (id: string | number) => void
}

function PositionDetail({
  position,
  transactions,
  saving,
  onBack,
  onTrade,
  onQuote,
  onDelete,
  onDeleteTransaction,
}: PositionDetailProps) {
  const fmt = useMoney()
  const confirm = useConfirm()
  const pnl = computePositionPnl(position)
  const symbol = currencySymbol(position.currency)
  const rows: { label: string; value: string }[] = [
    { label: "数量", value: position.quantity },
    {
      label: "平均成本",
      value: position.avgCostPrice ? `${symbol}${fmt(Number(position.avgCostPrice), 2)}` : "—",
    },
    {
      label: "最新现价",
      value: position.lastPrice ? `${symbol}${fmt(Number(position.lastPrice), 2)}` : "未录入",
    },
    {
      label: "成本基础",
      value: `${symbol}${fmt(Number(position.costBasisAmount ?? 0), 2)}`,
    },
    { label: "市值", value: `${symbol}${fmt(pnl.marketValue, 2)}` },
    {
      label: "未实现盈亏",
      value: `${pnl.unrealizedPnl >= 0 ? "+" : "−"}${symbol}${fmt(Math.abs(pnl.unrealizedPnl), 2)}`,
    },
    {
      label: "已实现盈亏",
      value: `${Number(position.realizedPnlAmount) >= 0 ? "+" : "−"}${symbol}${fmt(Math.abs(Number(position.realizedPnlAmount)), 2)}`,
    },
  ]

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BackButton onBack={onBack} />
        <SectionTitle>
          {position.symbol}
          {position.name ? ` · ${position.name}` : ""}
        </SectionTitle>
      </div>
      <Dim style={{ fontSize: 11, marginTop: 4 }}>
        {INSTRUMENT_LABELS[position.instrumentKind]} · {STATUS_LABELS[position.status]} ·{" "}
        {position.accountName ?? "未关联账户"}
      </Dim>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          rowGap: 8,
          columnGap: 16,
        }}
      >
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
            <Dim style={{ fontSize: 11.5 }}>{row.label}</Dim>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                color: "var(--ink)",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <Button size="sm" variant="primary" onPress={onTrade}>
          买入 / 卖出
        </Button>
        <Button size="sm" variant="outline" onPress={onQuote}>
          记录现价
        </Button>
        <Button
          size="sm"
          variant="outline"
          style={{ borderRadius: 5, marginLeft: "auto", color: "var(--red)" }}
          isDisabled={saving}
          onPress={onDelete}
        >
          删除持仓
        </Button>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionTitle icon="cashflow">交易记录</SectionTitle>
        {transactions.length === 0 ? (
          <Dim style={{ fontSize: 11.5, marginTop: 8, display: "block" }}>暂无交易记录。</Dim>
        ) : (
          <div style={{ marginTop: 8 }}>
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 2px",
                  borderBottom: "1px solid var(--hair-3)",
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: transaction.side === "buy" ? "var(--ink)" : "var(--accent)",
                    width: 34,
                    flexShrink: 0,
                  }}
                >
                  {SIDE_LABELS[transaction.side]}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {transaction.quantity} × {symbol}
                  {fmt(Number(transaction.price), 2)}
                  {transaction.feeAmount != null
                    ? `（费 ${symbol}${fmt(Number(transaction.feeAmount), 2)}）`
                    : ""}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--ink-4)", flexShrink: 0 }}>
                  {transaction.executedAt.slice(0, 10)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  style={{ minWidth: 24, height: 24, padding: 0, borderRadius: 4 }}
                  isDisabled={saving}
                  onPress={() =>
                    confirm({
                      title: "删除这笔交易？",
                      description: "持仓数量、成本和盈亏会按剩余交易重新计算。",
                      confirmText: "删除",
                      danger: true,
                      onConfirm: () => onDeleteTransaction(transaction.id),
                    })
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {position.assetItemId == null ? (
        <Dim style={{ fontSize: 11, marginTop: 16, display: "block", lineHeight: 1.7 }}>
          未关联账户：市值不会进入净资产。可在资产页新建券商账户后重新关联。
        </Dim>
      ) : (
        <Dim style={{ fontSize: 11, marginTop: 16, display: "block", lineHeight: 1.7 }}>
          已关联账户「{position.accountName}」：持仓市值按当天自动物化为该账户的资产快照
          （手动录入的当日余额优先）。
        </Dim>
      )}
    </>
  )
}
