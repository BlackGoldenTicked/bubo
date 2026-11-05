/**
 * @purpose Render and manage the contract tab: open rows, exits, marks, and derived P&L.
 * @role    Renderer feature surface for leveraged futures/perpetual positions.
 * @deps    React, tRPC queries, and shared renderer UI components.
 * @gotcha  Contract P&L is display math only; margin balances reach net worth exclusively
 *          through asset snapshots the user records on the assets page.
 */

import { memo, useMemo, useState } from "react"
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels"
import { Button } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CloseContractPositionInput,
  ContractPositionSummary,
  CreateContractPositionInput,
  UpdateContractPositionInput,
} from "@bubo/shared/contracts"
import { currencySymbol } from "@bubo/shared"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { useMoney } from "@/lib/useMoney"
import { useCurrentRates } from "@/lib/useCurrentRates"
import { ScrollArea } from "../components/ui/ScrollArea"
import { Kicker } from "../components/ui/Kicker"
import { BigNumber } from "../components/ui/BigNumber"
import { StatBlock } from "../components/ui/StatBlock"
import { SectionTitle } from "../components/ui/SectionTitle"
import { Dim } from "../components/ui/Dim"
import { BackButton } from "../components/ui/BackButton"
import { useConfirm } from "../components/ui/ConfirmModal"
import { AddContractModal, emptyContractForm, type ContractForm } from "./AddContractModal"
import { EditContractModal, contractUpdateForm, type ContractUpdateForm } from "./EditContractModal"
import { CloseContractModal, closeContractForm, type CloseContractForm } from "./CloseContractModal"
import {
  computeContractPnl,
  CONTRACT_SIDE_LABELS,
  CONTRACT_STATUS_LABELS,
  formatLeverage,
  MARGIN_MODE_LABELS,
} from "./contractDisplay"

interface ContractRowProps {
  contract: ContractPositionSummary
  selected: boolean
  onSelect: (contract: ContractPositionSummary) => void
}

const ContractRow = memo(function ContractRow({ contract, selected, onSelect }: ContractRowProps) {
  const fmt = useMoney()
  const pnl = computeContractPnl(contract)
  const symbol = currencySymbol(contract.currency)
  const open = contract.status === "open"
  const pnlValue = open ? (pnl.unrealizedPnl ?? 0) : (pnl.realizedPnl ?? 0)
  const pnlLabel = open ? "未实现" : "已实现"

  return (
    <div style={{ borderBottom: "1px solid var(--hair-3)" }}>
      <Button
        variant="ghost"
        aria-selected={selected}
        onPress={() => onSelect(contract)}
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
            {contract.symbol}
            <span
              style={{
                fontSize: 10,
                marginLeft: 6,
                color: contract.side === "long" ? "var(--accent)" : "var(--red)",
              }}
            >
              {CONTRACT_SIDE_LABELS[contract.side]}
            </span>
            {!open && (
              <span style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 6 }}>
                {CONTRACT_STATUS_LABELS[contract.status]}
              </span>
            )}
          </div>
          <Dim style={{ fontSize: 10.5, marginTop: 1 }}>
            {formatLeverage(contract.leverageBps)} · {MARGIN_MODE_LABELS[contract.marginMode]}
            {contract.note ? ` · ${contract.note}` : ""}
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
            {symbol}
            {fmt(pnl.notionalValue, 2)}
          </div>
          <div
            style={{
              fontSize: 10.5,
              marginTop: 1,
              color: pnlValue >= 0 ? "var(--accent)" : "var(--red)",
            }}
          >
            {pnlLabel} {pnlValue >= 0 ? "+" : "−"}
            {symbol}
            {fmt(Math.abs(pnlValue), 2)}
            {open && pnl.unrealizedPnlPercent != null
              ? ` · ${pnl.unrealizedPnlPercent >= 0 ? "+" : "−"}${Math.abs(pnl.unrealizedPnlPercent).toFixed(1)}%`
              : ""}
          </div>
        </div>
      </Button>
    </div>
  )
})

export function ContractsPanel() {
  const fmt = useMoney()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { toDisplay, baseSymbol } = useCurrentRates()
  const contractsQuery = useQuery(trpc.contracts.positions.queryOptions({}))
  usePagePerf("contractsPanel", [{ name: "contracts.positions", query: contractsQuery }])

  const createContract = useMutation(trpc.contracts.createPosition.mutationOptions())
  const updateContract = useMutation(trpc.contracts.updatePosition.mutationOptions())
  const closeContract = useMutation(trpc.contracts.closePosition.mutationOptions())
  const deleteContract = useMutation(trpc.contracts.deletePosition.mutationOptions())

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contractForm, setContractForm] = useState<ContractForm>(emptyContractForm())
  const [showAdd, setShowAdd] = useState(false)
  const [updateForm, setUpdateForm] = useState<ContractUpdateForm>({
    markPrice: "",
    liquidationPrice: "",
    marginAmount: "",
    note: "",
  })
  const [updateTarget, setUpdateTarget] = useState<ContractPositionSummary | null>(null)
  const [closeForm, setCloseForm] = useState<CloseContractForm>(closeContractForm())
  const [closeTarget, setCloseTarget] = useState<ContractPositionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contracts = contractsQuery.data ?? []
  const openContracts = useMemo(
    () => contracts.filter((contract) => contract.status === "open"),
    [contracts],
  )
  const closedContracts = useMemo(
    () => contracts.filter((contract) => contract.status === "closed"),
    [contracts],
  )
  const liquidatedContracts = useMemo(
    () => contracts.filter((contract) => contract.status === "liquidated"),
    [contracts],
  )
  const selectedContract = useMemo(
    () => contracts.find((contract) => String(contract.id) === selectedId) ?? null,
    [contracts, selectedId],
  )

  const totals = useMemo(() => {
    let notional = 0
    let margin = 0
    let unrealized = 0
    let realized = 0
    let missingFx = 0
    for (const contract of contracts) {
      const pnl = computeContractPnl(contract)
      const convertedNotional = toDisplay(pnl.notionalValue, contract.currency)
      const convertedMargin = toDisplay(pnl.effectiveMargin, contract.currency)
      if (convertedNotional == null || convertedMargin == null) {
        missingFx += 1
        continue
      }
      notional += convertedNotional
      margin += convertedMargin
      if (contract.status === "open") {
        unrealized += toDisplay(pnl.unrealizedPnl ?? 0, contract.currency) ?? 0
      } else {
        realized += toDisplay(pnl.realizedPnl ?? 0, contract.currency) ?? 0
      }
    }
    return { notional, margin, unrealized, realized, missingFx }
  }, [contracts, toDisplay])

  async function refreshAll() {
    await queryClient.invalidateQueries(trpc.contracts.positions.queryFilter())
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

  function openAdd() {
    setContractForm(emptyContractForm())
    setShowAdd(true)
  }

  function openUpdate(contract: ContractPositionSummary) {
    setUpdateTarget(contract)
    setUpdateForm(contractUpdateForm(contract))
  }

  function openClose(contract: ContractPositionSummary) {
    setCloseTarget(contract)
    setCloseForm(closeContractForm())
  }

  function saveContract(values: ContractForm) {
    const input: CreateContractPositionInput = {
      symbol: values.symbol.trim(),
      side: values.side,
      marginMode: values.marginMode,
      leverageBps: Math.round(Number(values.leverage) * 10_000),
      quantity: values.quantity.trim(),
      entryPrice: values.entryPrice.trim(),
      currency: values.currency || "USD",
      markPrice: values.markPrice.trim() || null,
      liquidationPrice: values.liquidationPrice.trim() || null,
      marginAmount: values.marginAmount.trim() || null,
      openedAt: `${values.openedAt}T00:00:00.000Z`,
      note: values.note.trim() || null,
    }
    void run(async () => {
      const created = await createContract.mutateAsync(input)
      setShowAdd(false)
      setSelectedId(String(created.id))
    })
  }

  function saveContractUpdate(values: ContractUpdateForm) {
    if (updateTarget == null) return
    const input: UpdateContractPositionInput = {
      id: updateTarget.id,
      markPrice: values.markPrice.trim() || null,
      liquidationPrice: values.liquidationPrice.trim() || null,
      marginAmount: values.marginAmount.trim() || null,
      note: values.note.trim() || null,
    }
    void run(async () => {
      await updateContract.mutateAsync(input)
      setUpdateTarget(null)
    })
  }

  function saveContractClose(values: CloseContractForm) {
    if (closeTarget == null) return
    const input: CloseContractPositionInput = {
      id: closeTarget.id,
      outcome: values.outcome,
      exitPrice: values.exitPrice.trim() || null,
      closedAt: `${values.closedAt}T00:00:00.000Z`,
    }
    void run(async () => {
      await closeContract.mutateAsync(input)
      setCloseTarget(null)
    })
  }

  function removeContract(contract: ContractPositionSummary) {
    confirm({
      title: `删除合约 ${contract.symbol}`,
      description: "删除后该合约的盈亏记录将不可恢复；请确认保证金余额已自行处理。",
      confirmText: "删除",
      danger: true,
      onConfirm: () =>
        run(async () => {
          await deleteContract.mutateAsync({ id: contract.id })
          if (String(contract.id) === selectedId) setSelectedId(null)
        }),
    })
  }

  return (
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
            <Kicker className="mb-1.5">合约 · 方向与杠杆</Kicker>
            <BigNumber style={{ fontSize: 40 }}>
              <span style={{ fontSize: 18, marginRight: 6, fontWeight: 400 }}>{baseSymbol}</span>
              {fmt(totals.notional)}
            </BigNumber>
            {totals.missingFx > 0 && (
              <Dim style={{ fontSize: 10.5, marginTop: 4 }}>
                {totals.missingFx} 个合约缺少汇率，未计入合计
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
            <StatBlock label="保证金合计" value={`${baseSymbol}${fmt(totals.margin)}`} />
            <StatBlock
              label="未实现盈亏"
              value={
                <span style={{ color: totals.unrealized >= 0 ? "var(--accent)" : "var(--red)" }}>
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
            <StatBlock label="持仓" value={openContracts.length} />
            <Button size="sm" variant="primary" onPress={openAdd}>
              ＋ 新建合约
            </Button>
          </div>
        </div>
        {error != null && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--red)" }}>{error}</div>
        )}
      </div>

      {/* Content — fills remaining height */}
      <PanelGroup orientation="horizontal" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left: independently scrollable contract list */}
        <Panel defaultSize={60} minSize={30}>
          <ScrollArea className="h-full">
            <div style={{ padding: "16px 32px 112px" }}>
              {[
                { title: "持仓中", items: openContracts },
                { title: "已平仓", items: closedContracts },
                { title: "已爆仓", items: liquidatedContracts },
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
                    {items.map((contract) => (
                      <ContractRow
                        key={contract.id}
                        contract={contract}
                        selected={String(contract.id) === selectedId}
                        onSelect={(next) => setSelectedId(String(next.id))}
                      />
                    ))}
                  </div>
                )
              })}
              {contracts.length === 0 && (
                <div
                  style={{
                    padding: "28px 0",
                    fontSize: 12,
                    color: "var(--ink-4)",
                    lineHeight: 1.7,
                  }}
                >
                  暂无合约仓位。新建后这里会按标记价派生未实现盈亏，平仓后记录已实现盈亏。
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.7 }}>
                合约盈亏只在本页展示，不进净资产；保证金实际占用请在资产页以快照记录，
                净资产才会体现。爆仓按亏损全部保证金计算。
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

        {/* Right: contract detail */}
        <Panel defaultSize={40} minSize={20}>
          <ScrollArea className="h-full">
            <div style={{ padding: "16px 32px 112px" }}>
              {selectedContract == null ? (
                <>
                  <SectionTitle icon="investments">合约明细</SectionTitle>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: "var(--ink-4)",
                      lineHeight: 1.7,
                    }}
                  >
                    从左侧选择一个合约，查看保证金、标记价与盈亏，并更新标记或平仓。
                  </div>
                </>
              ) : (
                <ContractDetail
                  contract={selectedContract}
                  saving={saving}
                  onBack={() => setSelectedId(null)}
                  onUpdate={() => openUpdate(selectedContract)}
                  onClose={() => openClose(selectedContract)}
                  onDelete={() => removeContract(selectedContract)}
                />
              )}
            </div>
          </ScrollArea>
        </Panel>
      </PanelGroup>

      <AddContractModal
        open={showAdd}
        form={contractForm}
        saving={saving}
        onSave={saveContract}
        onClose={() => setShowAdd(false)}
      />
      <EditContractModal
        open={updateTarget != null}
        form={updateForm}
        position={updateTarget}
        saving={saving}
        onSave={saveContractUpdate}
        onClose={() => setUpdateTarget(null)}
      />
      <CloseContractModal
        open={closeTarget != null}
        form={closeForm}
        position={closeTarget}
        saving={saving}
        onSave={saveContractClose}
        onClose={() => setCloseTarget(null)}
      />
    </>
  )
}

interface ContractDetailProps {
  contract: ContractPositionSummary
  saving: boolean
  onBack: () => void
  onUpdate: () => void
  onClose: () => void
  onDelete: () => void
}

function ContractDetail({
  contract,
  saving,
  onBack,
  onUpdate,
  onClose,
  onDelete,
}: ContractDetailProps) {
  const fmt = useMoney()
  const pnl = computeContractPnl(contract)
  const symbol = currencySymbol(contract.currency)
  const open = contract.status === "open"
  const price = (value: string | null) =>
    value != null ? `${symbol}${fmt(Number(value), 2)}` : "—"
  const signed = (value: number) => `${value >= 0 ? "+" : "−"}${symbol}${fmt(Math.abs(value), 2)}`

  const rows: { label: string; value: string; tone?: "pos" | "neg" }[] = [
    { label: "数量", value: contract.quantity },
    { label: "杠杆", value: formatLeverage(contract.leverageBps) },
    { label: "开仓价", value: price(contract.entryPrice) },
    { label: "保证金模式", value: MARGIN_MODE_LABELS[contract.marginMode] },
    { label: "标记价", value: price(contract.markPrice) },
    { label: "强平价", value: price(contract.liquidationPrice) },
    {
      label: "保证金",
      value: `${symbol}${fmt(pnl.effectiveMargin, 2)}${
        contract.marginAmount == null ? "（估算）" : ""
      }`,
    },
    { label: "名义价值", value: `${symbol}${fmt(pnl.notionalValue, 2)}` },
  ]
  if (open && pnl.unrealizedPnl != null) {
    rows.push({
      label: "未实现盈亏",
      value: `${signed(pnl.unrealizedPnl)}${
        pnl.unrealizedPnlPercent != null
          ? ` · ${pnl.unrealizedPnlPercent >= 0 ? "+" : "−"}${Math.abs(pnl.unrealizedPnlPercent).toFixed(1)}%`
          : ""
      }`,
      tone: pnl.unrealizedPnl >= 0 ? "pos" : "neg",
    })
  }
  if (!open) {
    rows.push({ label: "平仓价", value: price(contract.exitPrice) })
    if (pnl.realizedPnl != null) {
      rows.push({
        label: "已实现盈亏",
        value: signed(pnl.realizedPnl),
        tone: pnl.realizedPnl >= 0 ? "pos" : "neg",
      })
    }
    rows.push({
      label: "平仓日期",
      value: contract.closedAt != null ? contract.closedAt.slice(0, 10) : "—",
    })
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BackButton onBack={onBack} />
        <SectionTitle>{contract.symbol}</SectionTitle>
      </div>
      <Dim style={{ fontSize: 11, marginTop: 4 }}>
        {CONTRACT_SIDE_LABELS[contract.side]} {formatLeverage(contract.leverageBps)} ·{" "}
        {CONTRACT_STATUS_LABELS[contract.status]} · 开仓 {contract.openedAt.slice(0, 10)}
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
                color:
                  row.tone === "pos"
                    ? "var(--accent)"
                    : row.tone === "neg"
                      ? "var(--red)"
                      : "var(--ink)",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        {open && (
          <>
            <Button size="sm" variant="primary" onPress={onUpdate}>
              更新标记
            </Button>
            <Button size="sm" variant="outline" onPress={onClose}>
              平仓
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          style={{ borderRadius: 5, marginLeft: "auto", color: "var(--red)" }}
          isDisabled={saving}
          onPress={onDelete}
        >
          删除合约
        </Button>
      </div>

      {contract.note != null && (
        <Dim style={{ fontSize: 11, marginTop: 12, display: "block" }}>备注：{contract.note}</Dim>
      )}

      {open ? (
        <Dim style={{ fontSize: 11, marginTop: 16, display: "block", lineHeight: 1.7 }}>
          未实现盈亏按标记价派生（未填标记价时按开仓价，盈亏为 0），对保证金计算百分比。
          合约不计入净资产；保证金实际占用请在资产页以资产快照记录。
        </Dim>
      ) : contract.status === "liquidated" ? (
        <Dim style={{ fontSize: 11, marginTop: 16, display: "block", lineHeight: 1.7 }}>
          爆仓按亏损全部保证金记账：已实现盈亏 = −保证金
          {contract.marginAmount == null ? "（估算值）" : ""}。
        </Dim>
      ) : (
        <Dim style={{ fontSize: 11, marginTop: 16, display: "block", lineHeight: 1.7 }}>
          已实现盈亏 = （平仓价 − 开仓价）× 数量 × 方向。合约盈亏不进入净资产。
        </Dim>
      )}
    </>
  )
}
