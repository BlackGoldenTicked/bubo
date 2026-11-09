/**
 * @purpose Render the dashboard overview with clear cashflow, asset, and obligation summaries.
 * @role    Renderer overview that composes finance layers and equal-weight range cashflow metrics.
 * @deps    React, tRPC dashboard queries, subscription read-time projection, charts, and UI primitives.
 * @gotcha  Show layers together without implying they reconcile into one ledger.
 */

import { useEffect, useMemo, useState } from "react"
import { Drawer, Dropdown } from "@heroui/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { CashflowEventSummary } from "@bubo/api"
import type { AssetSnapshotSummary } from "@bubo/shared/contracts"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { localDateKey } from "@/lib/dates"
import { useMoney, useSignedMoney } from "@/lib/useMoney"
import { Kicker } from "../components/ui/Kicker"
import { BigNumber } from "../components/ui/BigNumber"
import { StatBlock } from "../components/ui/StatBlock"
import { SectionTitle } from "../components/ui/SectionTitle"
import { Dim } from "../components/ui/Dim"
import { EmptyState } from "../components/ui/EmptyState"
import { UpcomingRow } from "../components/ui/UpcomingRow"
import { BudgetBar } from "../components/ui/BudgetBar"
import { TransactionTable } from "../components/ui/TransactionTable"
import { BUDGET_CATEGORY_COLORS } from "@/lib/domainDisplay"
import { NetWorthTrend } from "../components/charts/NetWorthTrend"
import { DailyBars } from "../components/charts/DailyBars"
import { ScrollArea } from "../components/ui/ScrollArea"
import { useCurrentRates } from "@/lib/useCurrentRates"
import { currencySymbol } from "@bubo/shared"
import { useBudgetRolloverPrompt } from "../budget/useBudgetRolloverPrompt"
import { buildNetWorthTrend } from "./netWorthTrend"
import { buildUpcomingCharges } from "./upcoming"
import { buildLoanSchedule } from "../loans/loanSchedule"
import {
  computeContractPnl,
  CONTRACT_SIDE_LABELS,
  formatLeverage,
} from "../investments/contractDisplay"
import { sourceLabel } from "@/lib/domainDisplay"
import {
  RANGE_PRESET_MENU,
  formatRangeText,
  resolveRangePreset,
  type RangePresetKey,
} from "@/lib/dateRanges"

type CashflowRangeKey = RangePresetKey
const DEFAULT_CASHFLOW_RANGE_KEY: CashflowRangeKey = "this_month"
const CASHFLOW_RANGE_STORAGE_KEY = "bubo:overview:cashflow-range"

/** Same Chinese quick ranges as every other filter, plus 全部 for the full history. */
const CASHFLOW_RANGE_OPTIONS: Array<{ key: CashflowRangeKey; label: string }> = [
  ...RANGE_PRESET_MENU,
  { key: "all", label: "全部" },
]

interface DailyExpenseBucket {
  dateFrom: string
  dateTo: string
  amount: number
  label: string
}

function isCashflowRangeKey(value: string | null): value is CashflowRangeKey {
  return CASHFLOW_RANGE_OPTIONS.some((option) => option.key === value)
}

function readCashflowRangeKey(): CashflowRangeKey {
  try {
    const stored = window.localStorage.getItem(CASHFLOW_RANGE_STORAGE_KEY)
    return isCashflowRangeKey(stored) ? stored : DEFAULT_CASHFLOW_RANGE_KEY
  } catch {
    return DEFAULT_CASHFLOW_RANGE_KEY
  }
}

function writeCashflowRangeKey(value: CashflowRangeKey): void {
  try {
    window.localStorage.setItem(CASHFLOW_RANGE_STORAGE_KEY, value)
  } catch {
    // Persisting this preference is best-effort; the page still works without it.
  }
}

function cashflowDateLabel(dateFrom: string | undefined, dateTo: string): string {
  return formatRangeText({ from: dateFrom ?? "", to: dateTo })
}

function cashflowRange(key: CashflowRangeKey, now = new Date()) {
  const bounds = resolveRangePreset(key, now)
  const today = localDateKey(now)
  const short = (value: string) => {
    const [, month, day] = value.split("-").map(Number)
    return `${month}/${day}`
  }
  return {
    dateFrom: bounds.from || undefined,
    dateTo: bounds.to || today,
    axisStart: bounds.from ? short(bounds.from) : "最早",
    axisEnd: bounds.to === today ? "今天" : short(bounds.to || today),
  }
}

function useCashflowStats(events: CashflowEventSummary[]) {
  return useMemo(() => {
    let income = 0,
      expense = 0
    for (const e of events) {
      const amt = Math.abs(Number(e.amount) || 0)
      if (e.status !== "active" || !e.includeInAnalytics) continue
      if (e.flowKind === "income" && e.direction === "in") income += amt
      else if (e.flowKind === "expense" && e.direction === "out") expense += amt
    }
    return { income, expense, net: income - expense }
  }, [events])
}

function dateKeyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDateKeyDays(value: string, days: number): string {
  const next = dateKeyToUtc(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function dateKeyDiff(from: string, to: string): number {
  return Math.round((dateKeyToUtc(to).getTime() - dateKeyToUtc(from).getTime()) / 86400000)
}

function bucketLabel(dateFrom: string, dateTo: string, range: ReturnType<typeof cashflowRange>) {
  if (dateFrom === dateTo) return dateTo === range.dateTo ? range.axisEnd : dateFrom.slice(5)
  return `${dateFrom.slice(5)} 至 ${dateTo.slice(5)}`
}

function useDailyExpenseBuckets(
  events: CashflowEventSummary[],
  range: ReturnType<typeof cashflowRange>,
): DailyExpenseBucket[] {
  return useMemo(() => {
    const expenseEvents = events.filter(
      (e) => e.flowKind === "expense" && e.status === "active" && e.includeInAnalytics,
    )
    const firstExpenseDate = expenseEvents.reduce<string | null>(
      (earliest, event) => (earliest == null || event.date < earliest ? event.date : earliest),
      null,
    )
    const dateTo = range.dateTo
    let dateFrom = range.dateFrom ?? firstExpenseDate ?? addDateKeyDays(dateTo, -29)
    if (dateFrom > dateTo) dateFrom = dateTo
    const totalDays = Math.max(1, dateKeyDiff(dateFrom, dateTo) + 1)
    const bucketCount = totalDays <= 31 ? totalDays : 30
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const startOffset = Math.floor((index * totalDays) / bucketCount)
      const endOffset = Math.max(
        startOffset,
        Math.floor(((index + 1) * totalDays) / bucketCount) - 1,
      )
      const bucketFrom = addDateKeyDays(dateFrom, startOffset)
      const bucketTo = addDateKeyDays(dateFrom, endOffset)
      return {
        dateFrom: bucketFrom,
        dateTo: bucketTo,
        amount: 0,
        label: bucketLabel(bucketFrom, bucketTo, range),
      }
    })
    for (const e of events) {
      if (e.flowKind !== "expense" || e.status !== "active" || !e.includeInAnalytics) continue
      if (e.date < dateFrom || e.date > dateTo) continue
      const offset = dateKeyDiff(dateFrom, e.date)
      const index = Math.max(
        0,
        Math.min(bucketCount - 1, Math.floor((offset / totalDays) * bucketCount)),
      )
      buckets[index].amount += Math.abs(Number(e.amount) || 0)
    }
    return buckets
  }, [events, range])
}

function useNetWorthTrend(snapshots: AssetSnapshotSummary[], asOfDateKey: string): number[] {
  const { toDisplay } = useCurrentRates()
  return useMemo(
    () => buildNetWorthTrend(snapshots, toDisplay, dateKeyToUtc(asOfDateKey)),
    [asOfDateKey, snapshots, toDisplay],
  )
}

function toTransactionRow(t: CashflowEventSummary) {
  return {
    date: t.date,
    description: t.description ?? undefined,
    counterparty: t.counterparty ?? t.title ?? undefined,
    flowKind: t.flowKind,
    amount: t.amount,
    currency: t.currency,
    categoryName: t.categoryName ?? undefined,
    tag: t.tags[0]?.name,
    source: sourceLabel(t.sourceName ?? t.source),
  }
}

export function OverviewPage() {
  const fmt = useMoney()
  const signed = useSignedMoney()
  const [cashflowRangeKey, setCashflowRangeKey] = useState<CashflowRangeKey>(readCashflowRangeKey)
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null)
  const today = localDateKey()
  const range = cashflowRange(cashflowRangeKey)
  const futureThrough = addDateKeyDays(today, 60)
  const cashflowQuery = useQuery(
    trpc.cashflow.list.queryOptions({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      status: "active",
      limit: 240,
    }),
  )
  const assetSnapshotsQuery = useQuery(trpc.assets.snapshots.queryOptions({ latestOnly: true }))
  const assetHistoryQuery = useQuery(trpc.assets.snapshots.queryOptions({ latestOnly: false }))
  const netWorthQuery = useQuery(trpc.assets.netWorth.queryOptions())
  const subscriptionsQuery = useQuery(trpc.subscriptions.list.queryOptions({ status: "active" }))
  const loansQuery = useQuery(trpc.loans.list.queryOptions({ status: "active" }))
  const loanOccurrencesQuery = useQuery(
    // Fetch the full history so the dashboard can derive each loan's remaining
    // principal from elapsed due dates, just like the loans page.
    trpc.loans.occurrences.queryOptions({ dateFrom: "1900-01-01", dateTo: "2999-12-31" }),
  )
  const futurePressureQuery = useQuery(
    trpc.loans.futurePressure.queryOptions({ dateFrom: today, dateTo: futureThrough }),
  )
  const budgetPeriodsQuery = useQuery(trpc.budgets.periods.queryOptions({ status: "active" }))
  const currentBudgetPeriod = budgetPeriodsQuery.data?.find(
    (period) => period.periodStart <= today && period.periodEnd >= today,
  )
  useBudgetRolloverPrompt({
    enabled: !budgetPeriodsQuery.isPending && !currentBudgetPeriod,
  })
  const budgetProgressQuery = useQuery({
    ...trpc.budgets.progress.queryOptions({ budgetPeriodId: currentBudgetPeriod?.id ?? "" }),
    enabled: Boolean(currentBudgetPeriod),
  })
  const investmentPositionsQuery = useQuery(trpc.investments.positions.queryOptions({}))
  const contractPositionsQuery = useQuery(trpc.contracts.positions.queryOptions({}))
  usePagePerf("overview", [
    { name: "cashflow.list", query: cashflowQuery },
    { name: "assets.snapshots.latest", query: assetSnapshotsQuery },
    { name: "assets.snapshots.history", query: assetHistoryQuery },
    { name: "assets.netWorth", query: netWorthQuery },
    { name: "subscriptions.list", query: subscriptionsQuery },
    { name: "loans.list", query: loansQuery },
    { name: "loans.occurrences", query: loanOccurrencesQuery },
    { name: "loans.futurePressure", query: futurePressureQuery },
    { name: "budgets.periods", query: budgetPeriodsQuery },
    { name: "budgets.progress", query: budgetProgressQuery },
    { name: "investments.positions", query: investmentPositionsQuery },
    { name: "contracts.positions", query: contractPositionsQuery },
  ])

  const { toDisplay, baseSymbol } = useCurrentRates()
  const events = cashflowQuery.data ?? []
  const assetSnapshots = assetSnapshotsQuery.data ?? []
  const totalAssets = Number(netWorthQuery.data?.assetValue.number ?? 0)
  const snapshotLiabilities = useMemo(
    () =>
      assetSnapshots
        .filter((snapshot) => snapshot.assetType === "liability")
        .reduce(
          (sum, snapshot) =>
            sum +
            (toDisplay(Math.abs(Number(snapshot.valueNumber || 0)), snapshot.valueCurrency) ?? 0),
          0,
        ),
    [assetSnapshots, toDisplay],
  )
  const loanLiabilities = useMemo(() => {
    const occurrencesByLoan = new Map<string, typeof loanOccurrencesQuery.data>()
    for (const occurrence of loanOccurrencesQuery.data ?? []) {
      const key = String(occurrence.loanId)
      const rows = occurrencesByLoan.get(key) ?? []
      rows.push(occurrence)
      occurrencesByLoan.set(key, rows)
    }
    return (loansQuery.data ?? []).reduce((sum, loan) => {
      const schedule = buildLoanSchedule(loan, occurrencesByLoan.get(String(loan.id)) ?? [], today)
      return sum + (toDisplay(schedule.remain, loan.currency) ?? 0)
    }, 0)
  }, [loanOccurrencesQuery.data, loansQuery.data, toDisplay, today])
  const totalLiab = snapshotLiabilities + loanLiabilities
  const liquidAssets = useMemo(
    () =>
      assetSnapshots
        .filter((a) => ["cash", "bank", "wallet"].includes(a.assetType))
        .reduce((s, a) => s + (toDisplay(Number(a.valueNumber || 0), a.valueCurrency) ?? 0), 0),
    [assetSnapshots, toDisplay],
  )
  const netWorth = totalAssets - totalLiab
  const _netTrend = useNetWorthTrend(assetHistoryQuery.data ?? [], today)
  const netGain = _netTrend[11] - _netTrend[0]
  const netGainTone = netGain >= 0 ? "var(--green)" : "var(--red)"
  const netGainText = `${netGain >= 0 ? "+" : "−"}${baseSymbol}${fmt(Math.abs(netGain))}`

  const { income: _monthIn, expense: _monthOut, net: _monthNet } = useCashflowStats(events)
  const monthIn = _monthIn
  const monthOut = _monthOut
  const monthNet = _monthNet

  const dailyExpenseBuckets = useDailyExpenseBuckets(events, range)
  const dailyBars = dailyExpenseBuckets.map((bucket) => bucket.amount)
  const dailyBarLabels = dailyExpenseBuckets.map((bucket) => bucket.label)
  const selectedBucket =
    selectedBucketIndex == null ? null : (dailyExpenseBuckets[selectedBucketIndex] ?? null)
  const selectedBucketEvents = useMemo(
    () =>
      selectedBucket == null
        ? []
        : events
            .filter(
              (event) =>
                event.flowKind === "expense" &&
                event.status === "active" &&
                event.includeInAnalytics &&
                event.date >= selectedBucket.dateFrom &&
                event.date <= selectedBucket.dateTo,
            )
            .sort((a, b) => b.date.localeCompare(a.date)),
    [events, selectedBucket],
  )
  const selectedBucketRows = selectedBucketEvents.map(toTransactionRow)
  const selectedBucketTotal = selectedBucketEvents.reduce(
    (sum, event) => sum + Math.abs(Number(event.amount) || 0),
    0,
  )
  const selectedBucketTitle =
    selectedBucket == null
      ? "消费流水"
      : selectedBucket.dateFrom === selectedBucket.dateTo
        ? `${selectedBucket.dateFrom} 消费`
        : `${selectedBucket.dateFrom} 至 ${selectedBucket.dateTo} 消费`

  useEffect(() => {
    setSelectedBucketIndex(null)
  }, [cashflowRangeKey])

  const budgets = (budgetProgressQuery.data ?? []).map((row) => ({
    cat: row.budgetName,
    color:
      row.color ?? BUDGET_CATEGORY_COLORS[row.budgetName.replace(/预算$/, "")] ?? "var(--accent)",
    spent: Number(row.referenceUsed),
    limit: Number(row.budgeted),
  }))
  const visibleBudgets = budgets.slice(0, 4)

  const upcoming = buildUpcomingCharges(
    today,
    addDateKeyDays(today, 30),
    subscriptionsQuery.data ?? [],
    loansQuery.data ?? [],
    loanOccurrencesQuery.data ?? [],
  )
  const visibleUpcoming = upcoming.slice(0, 4)

  const upSum = upcoming.reduce((s, u) => s + (toDisplay(u.amt, u.cur) ?? 0), 0)
  const monthlyFixed = Number(futurePressureQuery.data?.total ?? upSum)

  const budgetTotal = budgets.reduce((s, b) => s + b.limit, 0)
  const budgetSpent = budgets.reduce((s, b) => s + b.spent, 0)
  const budgetRemain = budgetTotal - budgetSpent
  const scaleMax = Math.max(...budgets.map((b) => Math.max(b.spent, b.limit)), 1)

  const _recentTx = useMemo(
    () => [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    [events],
  )
  const recentTx = _recentTx
  const transactionRows = recentTx.map(toTransactionRow)

  interface InvestmentActivityItem {
    id: string
    date: string
    kindLabel: string
    tone: "pos" | "neg" | "neutral"
    title: string
    detail: string
    amount: number | null
    currency: string
  }

  // 最近一个月的投资动态：现货建仓/清仓 + 合约开仓/平仓/爆仓，全部由持仓行
  // 派生（合约的 openedAt/closedAt、现货的 createdAt/updatedAt），没有事件表。
  const investmentActivity = useMemo(() => {
    const from = addDateKeyDays(today, -30)
    const items: InvestmentActivityItem[] = []
    for (const contract of contractPositionsQuery.data ?? []) {
      const opened = contract.openedAt.slice(0, 10)
      if (opened >= from) {
        items.push({
          id: `contract-open-${contract.id}`,
          date: opened,
          kindLabel: "开仓",
          tone: "neutral",
          title: `${contract.symbol} · ${CONTRACT_SIDE_LABELS[contract.side]} ${formatLeverage(contract.leverageBps)}`,
          detail: `保证金 ${currencySymbol(contract.currency)}${fmt(Number(computeContractPnl(contract).effectiveMargin))}`,
          amount: null,
          currency: contract.currency,
        })
      }
      if (contract.closedAt != null) {
        const closed = contract.closedAt.slice(0, 10)
        if (closed >= from && contract.status === "liquidated") {
          items.push({
            id: `contract-liquidated-${contract.id}`,
            date: closed,
            kindLabel: "爆仓",
            tone: "neg",
            title: `${contract.symbol} · ${CONTRACT_SIDE_LABELS[contract.side]} ${formatLeverage(contract.leverageBps)}`,
            detail: "已实现盈亏 = −全部保证金",
            amount: -computeContractPnl(contract).effectiveMargin,
            currency: contract.currency,
          })
        } else if (closed >= from && contract.status === "closed") {
          const realized = computeContractPnl(contract).realizedPnl ?? 0
          items.push({
            id: `contract-close-${contract.id}`,
            date: closed,
            kindLabel: "平仓",
            tone: realized >= 0 ? "pos" : "neg",
            title: `${contract.symbol} · ${CONTRACT_SIDE_LABELS[contract.side]} ${formatLeverage(contract.leverageBps)}`,
            detail: contract.exitPrice != null ? `平仓价 ${contract.exitPrice}` : "已平仓",
            amount: realized,
            currency: contract.currency,
          })
        }
      }
    }
    for (const position of investmentPositionsQuery.data ?? []) {
      const opened = position.createdAt.slice(0, 10)
      if (opened >= from) {
        items.push({
          id: `position-open-${position.id}`,
          date: opened,
          kindLabel: "建仓",
          tone: "neutral",
          title: position.name || position.symbol,
          detail: `数量 ${position.quantity}${
            position.avgCostPrice != null
              ? ` · 成本 ${currencySymbol(position.currency)}${fmt(Number(position.avgCostPrice))}`
              : ""
          }`,
          amount: position.costBasisAmount != null ? Number(position.costBasisAmount) : null,
          currency: position.currency,
        })
      }
      if (position.status === "closed") {
        const closed = position.updatedAt.slice(0, 10)
        if (closed >= from) {
          const realized = Number(position.realizedPnlAmount) || 0
          items.push({
            id: `position-close-${position.id}`,
            date: closed,
            kindLabel: "清仓",
            tone: realized >= 0 ? "pos" : "neg",
            title: position.name || position.symbol,
            detail: "已实现盈亏",
            amount: realized,
            currency: position.currency,
          })
        }
      }
    }
    return items.sort((a, b) => b.date.localeCompare(a.date))
  }, [contractPositionsQuery.data, fmt, investmentPositionsQuery.data, today])

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[minmax(500px,1.25fr)_minmax(320px,0.75fr)] overflow-hidden bg-[var(--surface-1)]">
      <ScrollArea className="min-h-0 border-r border-[var(--hair)]">
        <div className="flex min-h-full flex-col px-7 py-6">
          {/* ── 净资产 + 趋势 ── */}
          <section className="flex items-stretch gap-7 border-b border-[var(--hair-2)] pb-5">
            <div>
              <Kicker className="mb-1.5">净资产</Kicker>
              <BigNumber className="text-[clamp(34px,3vw,46px)] leading-none">
                <span className="mr-1.5 text-[19px] font-medium text-[var(--ink-3)]">
                  {baseSymbol}
                </span>
                {fmt(netWorth)}
              </BigNumber>
              <div className="mt-3 flex gap-6">
                <StatBlock
                  icon="assets"
                  label="流动资产"
                  value={`${baseSymbol}${fmt(liquidAssets)}`}
                />
                <StatBlock
                  icon="assets"
                  label="总资产"
                  value={`${baseSymbol}${fmt(totalAssets)}`}
                />
                <StatBlock icon="warning" label="欠款" value={`${baseSymbol}${fmt(totalLiab)}`} />
              </div>
            </div>
            <div className="ml-auto hidden min-w-[180px] flex-1 flex-col text-right min-[1120px]:flex">
              <Dim className="text-[11.5px] mb-2 block">
                近 12 个月{" "}
                <span className="font-['IBM_Plex_Mono'] ml-1" style={{ color: netGainTone }}>
                  {netGainText}
                </span>
              </Dim>
              <div className="mt-auto">
                <NetWorthTrend data={_netTrend} />
              </div>
            </div>
          </section>

          {/* ── 投资动态（最近一个月） ── */}
          <section className="border-b border-[var(--hair-2)] py-5">
            <div className="mb-2 flex items-baseline">
              <SectionTitle icon="investments">投资 · 最近一个月</SectionTitle>
              <Link
                to="/investments"
                className="ml-auto cursor-pointer text-[10.5px] text-[var(--accent)] transition-opacity hover:opacity-75"
              >
                查看投资 →
              </Link>
            </div>
            {investmentActivity.length === 0 ? (
              <EmptyState
                compact
                title="最近一个月没有投资动态"
                hint="新建仓位、合约开平仓后会显示在这里"
              />
            ) : (
              <div className="flex flex-col">
                {investmentActivity.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-[7px]">
                    <span className="w-[44px] shrink-0 font-['IBM_Plex_Mono'] text-[10.5px] text-[var(--ink-4)]">
                      {item.date.slice(5).replace("-", "/")}
                    </span>
                    <span
                      className={`w-[38px] shrink-0 rounded-[3px] border border-[var(--hair)] py-px text-center text-[10px] ${
                        item.tone === "neg"
                          ? "text-[var(--red)]"
                          : item.tone === "pos"
                            ? "text-[var(--accent)]"
                            : "text-[var(--ink-3)]"
                      }`}
                    >
                      {item.kindLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">
                      {item.title}
                      <span className="ml-2 text-[10.5px] text-[var(--ink-4)]">{item.detail}</span>
                    </span>
                    {item.amount != null && (
                      <span
                        className={`shrink-0 font-['IBM_Plex_Mono'] text-[12px] ${
                          item.tone === "neg"
                            ? "text-[var(--red)]"
                            : item.tone === "pos"
                              ? "text-[var(--accent)]"
                              : "text-[var(--ink)]"
                        }`}
                      >
                        {item.amount < 0 ? "−" : item.tone === "pos" || item.amount > 0 ? "+" : ""}
                        {currencySymbol(item.currency)}
                        {fmt(Math.abs(item.amount))}
                      </span>
                    )}
                  </div>
                ))}
                {investmentActivity.length > 6 && (
                  <Link
                    to="/investments"
                    className="pt-1 text-right text-[11px] text-[var(--accent)] transition-opacity hover:opacity-75"
                  >
                    查看全部投资 →
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* ── 区间收支 + 日柱 ── */}
          <section className="border-b border-[var(--hair-2)] py-6">
            <div className="mb-4 flex items-center gap-4">
              <Kicker>
                <Dropdown>
                  <Dropdown.Trigger
                    aria-label="选择现金流时间范围"
                    className="min-h-0 border-0 bg-transparent p-0 text-[inherit] font-[inherit] leading-[inherit] text-[var(--ink-2)] shadow-none hover:bg-transparent"
                  >
                    <span className="border-b border-dashed border-[var(--ink-4)]">
                      {cashflowDateLabel(range.dateFrom, range.dateTo)}
                    </span>
                  </Dropdown.Trigger>
                  <Dropdown.Popover placement="bottom start">
                    <Dropdown.Menu
                      aria-label="选择现金流时间范围"
                      selectionMode="single"
                      selectedKeys={[cashflowRangeKey]}
                      onAction={(key) => {
                        const next = String(key)
                        if (!isCashflowRangeKey(next)) return
                        setCashflowRangeKey(next)
                        writeCashflowRangeKey(next)
                      }}
                    >
                      {CASHFLOW_RANGE_OPTIONS.map((option) => (
                        <Dropdown.Item key={option.key} id={option.key}>
                          {option.label}
                          <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </Kicker>
              <Link
                to="/analysis"
                className="ml-auto cursor-pointer text-[10.5px] text-[var(--accent)] transition-opacity hover:opacity-75"
              >
                查看结余信息 →
              </Link>
            </div>
            <div className="mb-5 flex items-end gap-16">
              <div className="min-w-0">
                <Dim className="mb-1 block text-[11px]">消费</Dim>
                <BigNumber className="whitespace-nowrap text-[22px] leading-none text-[var(--red)]">
                  −¥{fmt(monthOut)}
                </BigNumber>
              </div>
              <div className="min-w-0">
                <Dim className="mb-1 block text-[11px]">收入</Dim>
                <BigNumber className="whitespace-nowrap text-[22px] leading-none text-[var(--accent)]">
                  +¥{fmt(monthIn)}
                </BigNumber>
              </div>
              <div className="min-w-0">
                <Dim className="mb-1 block text-[11px]">结余</Dim>
                <BigNumber
                  className={`whitespace-nowrap text-[22px] leading-none ${monthNet >= 0 ? "text-[var(--ink)]" : "text-[var(--red)]"}`}
                >
                  {signed(monthNet)}
                </BigNumber>
              </div>
            </div>
            <DailyBars
              data={dailyBars}
              labels={dailyBarLabels}
              selectedIndex={selectedBucketIndex}
              onBarClick={(index) => setSelectedBucketIndex(index)}
            />
            <div className="flex justify-between mt-1.5">
              <Dim className="text-[10px]">{range.axisStart}</Dim>
              <span className="text-[10px] font-semibold text-[var(--accent)]">
                {range.axisEnd}
              </span>
            </div>
          </section>

          {/* ── 两列：预算 + 即将扣费 ── */}
          <section className="grid grid-cols-1 gap-6 pt-5 min-[1120px]:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] min-[1120px]:gap-7">
            {/* 左：消费预算 */}
            <div className="overflow-hidden">
              <div className="mb-3 flex items-baseline">
                <SectionTitle icon="budget">消费 · 本月预算</SectionTitle>
                <Dim className="ml-auto whitespace-nowrap text-[10.5px]">
                  余{" "}
                  <b className="font-['IBM_Plex_Mono'] text-[var(--ink)] font-semibold">
                    ¥{fmt(budgetRemain)}
                  </b>
                </Dim>
              </div>
              {budgets.length === 0 ? (
                <EmptyState compact title="暂无消费记录" hint="导入账单后自动统计" />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {visibleBudgets.map((b, i) => (
                    <BudgetBar
                      key={i}
                      color={b.color}
                      spent={b.spent}
                      limit={b.limit}
                      label={b.cat}
                      scaleMax={scaleMax}
                    />
                  ))}
                  {budgets.length > visibleBudgets.length && (
                    <Link
                      to="/budget"
                      className="pt-1 text-right text-[11px] text-[var(--accent)] transition-opacity hover:opacity-75"
                    >
                      查看全部预算 →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* 右：即将扣费 */}
            <div className="overflow-hidden">
              <div className="mb-3 flex items-baseline">
                <SectionTitle icon="subscriptions">即将扣费</SectionTitle>
                <Dim className="text-[10.5px] ml-auto whitespace-nowrap">
                  未来 30 天 · {upcoming.length} 笔
                </Dim>
              </div>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="font-['IBM_Plex_Mono'] text-[20px] font-semibold text-[var(--ink)]">
                  {baseSymbol}
                  {fmt(upSum)}
                </span>
                <Dim className="ml-auto whitespace-nowrap text-[10.5px]">
                  月固定{" "}
                  <b className="font-['IBM_Plex_Mono'] text-[var(--ink)] font-semibold">
                    {baseSymbol}
                    {fmt(monthlyFixed)}
                  </b>
                </Dim>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState compact title="未来 30 天暂无定期扣费" />
              ) : (
                <div>
                  {visibleUpcoming.map((u, i) => (
                    <UpcomingRow
                      key={i}
                      date={u.d}
                      color={u.kind === "贷款" ? "#ad7c2c" : "#7c6ac4"}
                      name={u.name}
                      kind={u.kind}
                      amount={`${currencySymbol(u.cur)}${fmt(u.amt)}`}
                    />
                  ))}
                  {upcoming.length > visibleUpcoming.length && (
                    <Link
                      to="/subscriptions"
                      className="block pt-2.5 text-right text-[11px] text-[var(--accent)] hover:opacity-75 transition-opacity"
                    >
                      展示更多 →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      {/* ── 右栏：最近流水 ── */}
      <section className="flex min-h-0 flex-col bg-[var(--surface-1)]">
        <div className="flex h-[66px] shrink-0 items-center border-b border-[var(--hair)] px-6">
          <div>
            <div className="flex items-baseline gap-2">
              <SectionTitle icon="cashflow">最近流水</SectionTitle>
              {recentTx.length > 0 && <Dim className="text-[11px]">最近 {recentTx.length} 笔</Dim>}
            </div>
            <Dim className="mt-1 block text-[10.5px]">过去现金流 · 不用于推算当前资产余额</Dim>
          </div>
          <Link
            to="/imports"
            className="ml-auto text-[11px] text-[var(--accent)] transition-opacity hover:opacity-75"
          >
            查看全部 →
          </Link>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-5 py-3 [&_td]:py-3">
          {recentTx.length === 0 ? (
            <EmptyState icon="cashflow" title="暂无流水记录" hint="前往「流水」页面导入账单" />
          ) : (
            <TransactionTable rows={transactionRows} variant="compact" />
          )}
        </ScrollArea>
      </section>
      <Drawer.Backdrop
        isOpen={selectedBucket != null}
        onOpenChange={(open) => {
          if (!open) setSelectedBucketIndex(null)
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog style={{ width: 720, maxWidth: "90vw", touchAction: "none" }}>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading style={{ fontSize: 14 }}>{selectedBucketTitle}</Drawer.Heading>
              <Dim style={{ fontSize: 11, marginTop: 2 }}>
                {selectedBucketEvents.length} 笔 · 消费 ¥{fmt(selectedBucketTotal, 2)}
              </Dim>
            </Drawer.Header>
            <Drawer.Body>
              {selectedBucketRows.length === 0 ? (
                <EmptyState compact title="这一天暂无消费流水" />
              ) : (
                <div className="overflow-hidden">
                  <TransactionTable rows={selectedBucketRows} />
                </div>
              )}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
