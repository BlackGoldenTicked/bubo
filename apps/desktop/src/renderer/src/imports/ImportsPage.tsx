/**
 * @purpose Render and manage imported cashflow imports page workflow.
 * @role    Renderer feature surface for statement lines and cashflow details.
 * @deps    React, tRPC import/cashflow queries, and table/detail UI.
 * @gotcha  Imports describe past cashflow and must not update asset balances automatically.
 *          The filter bar is sticky inside the table's scroll column, so the table header
 *          sticks below its measured height instead of a constant — a stale constant leaves
 *          the header floating over the first rows instead of pinning under the filters.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from "react"
import { Button } from "@heroui/react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  createParser,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
  type Options as NuqsOptions,
} from "nuqs"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { CashflowEventSummary } from "@bubo/api"
import { AppIcon } from "@bubo/ui"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { continueVoiceQueue } from "@/lib/voice/voiceQueueControl"
import { useVoiceIntent } from "@/lib/voice/useVoiceIntent"
import { CATEGORY_COLORS, SOURCE_BADGES, sourceLabel } from "@/lib/domainDisplay"
import { dateKey } from "@/lib/dates"
import { resolveRangePreset, type RangePresetKey } from "@/lib/dateRanges"
import { useMoney } from "@/lib/useMoney"
import { ScrollArea } from "../components/ui/ScrollArea"
import { TxDetailPanel, type Tx } from "./TxDetailPanel"
import { AddTxModal, emptyTxForm, type TxForm } from "./AddTxModal"
import { DateRangeFilter, FILTER_LABEL_CLASS, FilterSelectField } from "./filterControls"
import { ColorDot } from "../components/ui/ColorDot"
import { Dim } from "../components/ui/Dim"
import { DailyBars } from "../components/charts/DailyBars"
import { FormField } from "../components/ui/FormField"

const TIME_FILTER_KEYS = [
  "this_week",
  "this_month",
  "last_month",
  "this_quarter",
  "prev_quarter",
  "half_year",
  "this_year",
  "all",
  "custom",
] as const
const KIND_FILTER_KEYS = ["all", "expense", "income"] as const
type TimeFilterKey = (typeof TIME_FILTER_KEYS)[number]
type KindFilterKey = (typeof KIND_FILTER_KEYS)[number]
interface TxFilterForm {
  timeFilter: TimeFilterKey
  dateFrom: string
  dateTo: string
  categoryFilter: string
  kindFilter: KindFilterKey
}

const DEFAULT_TIME_BOUNDS = timeFilterBounds("this_month")
const DEFAULT_FILTERS: TxFilterForm = {
  timeFilter: "this_month",
  dateFrom: DEFAULT_TIME_BOUNDS.from,
  dateTo: DEFAULT_TIME_BOUNDS.to,
  categoryFilter: "all",
  kindFilter: "all",
}

const KIND_FILTERS: Array<{ key: KindFilterKey; label: string }> = [
  { key: "all", label: "全部类型" },
  { key: "expense", label: "支出" },
  { key: "income", label: "收入" },
]

/**
 * The list query must let the database do the date filtering: the page renders and counts
 * exactly what the fetch returns, so a small fixed limit silently hides every row outside
 * the newest window — filtering 自定义 2025-10 over a ledger whose newest 500 rows start in
 * 2026-06 rendered 「共 0 笔」 even though October 2025 has 167 rows. The table is
 * virtualized, so a window covering the whole ledger stays cheap.
 */
const LIST_LIMIT = 20000

/**
 * Random identifying colors for category dots. Purely visual: each page entry shuffles the
 * palette across categories (Fisher–Yates), and the assignment is frozen for the visit —
 * the same category keeps one color everywhere on the page (list dot and breakdown) until
 * the page is left. Nothing is persisted.
 */
const CATEGORY_DOT_PALETTE = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#6366f1",
  "#84cc16",
] as const

function shufflePalette(): string[] {
  const palette = [...CATEGORY_DOT_PALETTE]
  for (let i = palette.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[palette[i], palette[j]] = [palette[j]!, palette[i]!]
  }
  return palette
}

const parseAsTrimmedString = createParser({
  parse: (value: string) => value.trim(),
  serialize: (value: string) => value.trim(),
})

const IMPORTS_FILTER_PARSERS = {
  timeFilter: parseAsStringLiteral(TIME_FILTER_KEYS).withDefault(DEFAULT_FILTERS.timeFilter),
  dateFrom: parseAsTrimmedString.withDefault(DEFAULT_FILTERS.dateFrom),
  dateTo: parseAsTrimmedString.withDefault(DEFAULT_FILTERS.dateTo),
  categoryFilter: parseAsString.withDefault(DEFAULT_FILTERS.categoryFilter),
  kindFilter: parseAsStringLiteral(KIND_FILTER_KEYS).withDefault(DEFAULT_FILTERS.kindFilter),
}

const IMPORTS_FILTER_URL_KEYS = {
  timeFilter: "period",
  dateFrom: "from",
  dateTo: "to",
  categoryFilter: "category",
  kindFilter: "type",
} as const

const UNCATEGORIZED_CATEGORY_FILTER = "__uncategorized__"

type FlowBreakdownSegment = {
  categoryFilterValue: string
  name: string
  amt: number
  color: string
}

function categoryFilterSet(value: string): Set<string> | null {
  if (value === "all") return null
  if (value === UNCATEGORIZED_CATEGORY_FILTER) return new Set([""])
  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

function categoryFilterIncludes(value: string, categoryFilterValue: string): boolean {
  if (value === "all") return true
  if (categoryFilterValue === UNCATEGORIZED_CATEGORY_FILTER) {
    return value === UNCATEGORIZED_CATEGORY_FILTER
  }
  return categoryFilterSet(value)?.has(categoryFilterValue) ?? false
}

function timeFilterBounds(key: TimeFilterKey, now = new Date()): { from: string; to: string } {
  return resolveRangePreset(key as RangePresetKey, now)
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

function compactDateRange(
  txs: Tx[],
  dateFrom: string,
  dateTo: string,
  fallbackTo: string,
): { from: string; to: string } {
  if (dateFrom && dateTo)
    return dateFrom <= dateTo ? { from: dateFrom, to: dateTo } : { from: dateTo, to: dateFrom }
  if (dateFrom) return { from: dateFrom, to: fallbackTo }
  if (dateTo) return { from: addDateKeyDays(dateTo, -29), to: dateTo }
  const dates = txs.map((tx) => tx.date).sort((a, b) => a.localeCompare(b))
  const to = dates[dates.length - 1] ?? fallbackTo
  return { from: addDateKeyDays(to, -29), to }
}

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_BADGES[source]
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {s && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 4,
            flexShrink: 0,
            background: s.bg,
            color: "white",
            fontSize: 9.5,
            fontWeight: 700,
          }}
        >
          {s.char}
        </span>
      )}
      <span style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        {sourceLabel(source)}
      </span>
    </div>
  )
}

function DonutChart({
  segments,
  selectedCategoryFilter,
  onSelectCategory,
  size = 140,
  thick = 28,
}: {
  segments: FlowBreakdownSegment[]
  selectedCategoryFilter: string
  onSelectCategory: (segment: FlowBreakdownSegment) => void
  size?: number
  thick?: number
}) {
  type Seg = FlowBreakdownSegment & { frac: number; d: string }
  const fmt = useMoney()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; seg: Seg } | null>(null)
  const total = segments.reduce((s, x) => s + x.amt, 0)
  if (total === 0) return null
  const r = (size - thick) / 2
  const cx = size / 2,
    cy = size / 2
  let angle = -Math.PI / 2
  const paths = segments.map((seg) => {
    const frac = seg.amt / total
    const start = angle
    angle += frac * 2 * Math.PI
    const x1 = cx + r * Math.cos(start),
      y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(angle),
      y2 = cy + r * Math.sin(angle)
    const large = frac > 0.5 ? 1 : 0
    return {
      ...seg,
      frac: frac,
      d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`,
    }
  })
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.color}
            role="button"
            tabIndex={0}
            aria-label={`筛选${p.name}`}
            style={{
              cursor: "pointer",
              opacity: categoryFilterIncludes(selectedCategoryFilter, p.categoryFilterValue)
                ? 1
                : 0.45,
              transition: "opacity 0.1s",
            }}
            onClick={() => onSelectCategory(p)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              onSelectCategory(p)
            }}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.closest("svg")!.getBoundingClientRect()
              setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, seg: p })
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.closest("svg")!.getBoundingClientRect()
              setTooltip((t) =>
                t ? { ...t, x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
              )
            }}
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={r - thick / 2}
          fill="var(--surface-1)"
          style={{ pointerEvents: "none" }}
        />
      </svg>
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            background: "var(--surface-1)",
            border: "1px solid var(--hair-2)",
            borderRadius: 7,
            padding: "6px 10px",
            boxShadow: "var(--popover-shadow)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: tooltip.seg.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
              {tooltip.seg.name}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--ink)",
              fontWeight: 600,
            }}
          >
            ¥{fmt(tooltip.seg.amt)}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
            {Math.round(tooltip.seg.frac * 100)}% 占比
          </div>
        </div>
      )}
    </div>
  )
}

const colHelper = createColumnHelper<Tx>()
// Amount cell is its own component so it can mask via the useMoney hook (COLUMNS is module-level).
function AmountCell({ value, flowKind }: { value: number; flowKind: string }) {
  const fmt = useMoney()
  const isIncome = flowKind === "income"
  const isTransfer = flowKind === "transfer"
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 500,
        color: isIncome ? "var(--accent)" : isTransfer ? "var(--ink-3)" : "var(--red)",
      }}
    >
      {isIncome ? "+" : isTransfer ? "" : "−"}
      {fmt(value, 1)}
    </span>
  )
}

const COLUMNS = [
  colHelper.accessor("date", {
    header: "日期",
    size: 62,
    cell: (c) => (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-4)" }}>
        {c.getValue().slice(5)}
      </span>
    ),
  }),
  colHelper.accessor("counterparty", {
    header: "项目",
    cell: (c) => <span style={{ color: "var(--ink)", fontWeight: 450 }}>{c.getValue()}</span>,
  }),
  colHelper.accessor("categoryName", {
    header: "类别",
    size: 80,
    cell: (c) => (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11.5,
          color: "var(--ink-3)",
        }}
      >
        <ColorDot
          color={
            c.row.original.categoryColor ?? CATEGORY_COLORS[c.getValue()] ?? CATEGORY_COLORS["其他"]
          }
          size={7}
        />
        {c.getValue()}
      </span>
    ),
  }),
  colHelper.accessor("tag", {
    header: "标签",
    size: 72,
    cell: (c) => (
      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
        {c.getValue() ? `#${c.getValue()}` : "—"}
      </span>
    ),
  }),
  colHelper.accessor("source", {
    header: "来源",
    size: 108,
    cell: (c) => <SourceBadge source={c.getValue()} />,
  }),
  colHelper.accessor("amount", {
    header: "金额",
    size: 96,
    cell: (c) => <AmountCell value={c.getValue()} flowKind={c.row.original.flowKind} />,
  }),
]

function numericId(value: CashflowEventSummary["id"], fallback: number): number {
  if (typeof value === "number") return value
  let seed = fallback + 1
  for (let i = 0; i < value.length; i++) {
    seed = (seed * 31 + value.charCodeAt(i)) & 0x7fffffff
  }
  return seed || fallback + 1
}

function toTx(event: CashflowEventSummary, index: number, categoryColor: string | null): Tx {
  return {
    id: numericId(event.id, index),
    rawId: String(event.id),
    date: event.date,
    occurredAt: event.occurredAt ?? null,
    counterparty: event.counterparty ?? event.title ?? "未命名流水",
    flowKind: event.flowKind,
    amount: Math.abs(Number(event.amount) || 0),
    categoryId: event.categoryId ?? null,
    categoryName: event.categoryName ?? event.flowKind,
    categoryColor,
    tag: event.tags[0]?.name,
    source: event.sourceName ?? event.source ?? "手动",
    title: event.title ?? null,
    description: event.description ?? null,
    userNote: event.userNote ?? null,
    statementLineId: event.statementLineId ?? null,
    createdAt: event.createdAt,
  }
}

export function ImportsPage() {
  const fmt = useMoney()
  const queryClient = useQueryClient()
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null)
  const [showAddTx, setShowAddTx] = useState(false)
  const [voiceTxForm, setVoiceTxForm] = useState<TxForm | undefined>(undefined)
  const [editingTx, setEditingTx] = useState<Tx | null>(null)

  // The global voice sheet hands cashflow intents here; the form still saves manually.
  useVoiceIntent("cashflow", (intent) => {
    setVoiceTxForm({
      flowKind: intent.flowKind,
      amount: intent.amount,
      counterparty: intent.title,
      categoryId: intent.categoryId as TxForm["categoryId"],
      source: intent.paymentMethod ?? "现金",
      date: intent.eventDate,
      note: intent.note ?? "",
    })
    setShowAddTx(true)
  })
  const [urlFilters, setUrlFilters] = useQueryStates(IMPORTS_FILTER_PARSERS, {
    history: "replace",
    urlKeys: IMPORTS_FILTER_URL_KEYS,
  })
  const urlFiltersRef = useRef<TxFilterForm>(urlFilters)
  const { control, getValues, reset, setValue } = useForm<TxFilterForm>({
    defaultValues: urlFilters,
  })
  const timeFilter = useWatch({ control, name: "timeFilter" }) ?? DEFAULT_FILTERS.timeFilter
  const dateFrom = useWatch({ control, name: "dateFrom" }) ?? DEFAULT_FILTERS.dateFrom
  const dateTo = useWatch({ control, name: "dateTo" }) ?? DEFAULT_FILTERS.dateTo
  const categoryFilter =
    useWatch({ control, name: "categoryFilter" }) ?? DEFAULT_FILTERS.categoryFilter
  const kindFilter = useWatch({ control, name: "kindFilter" }) ?? DEFAULT_FILTERS.kindFilter
  const refDate = useMemo(() => new Date(), [])
  const updateUrlFilters = useCallback(
    (next: Partial<TxFilterForm>, options?: NuqsOptions) => {
      const merged = { ...urlFiltersRef.current, ...getValues(), ...next }
      urlFiltersRef.current = merged
      void setUrlFilters(merged, options)
    },
    [getValues, setUrlFilters],
  )

  useEffect(() => {
    urlFiltersRef.current = urlFilters
    reset(urlFilters)
  }, [
    reset,
    urlFilters.categoryFilter,
    urlFilters.dateFrom,
    urlFilters.dateTo,
    urlFilters.kindFilter,
    urlFilters.timeFilter,
  ])

  useEffect(() => {
    void setUrlFilters(urlFilters)
    // Normalize explicit default or invalid URL params once after nuqs parses them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const cashflowQuery = useQuery(
    trpc.cashflow.list.queryOptions({
      status: "active",
      includeInAnalytics: true,
      flowKind: ["income", "expense"],
      // Same predicates the client filter applies, pushed into SQLite so older windows
      // actually return rows instead of being cut off by the limit.
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: LIST_LIMIT,
    }),
  )
  const statementLinesQuery = useQuery(trpc.imports.statementLines.queryOptions({ limit: 500 }))
  const categoriesQuery = useQuery(trpc.reference.categories.queryOptions())
  usePagePerf("imports", [
    { name: "cashflow.list", query: cashflowQuery },
    { name: "imports.statementLines", query: statementLinesQuery },
    { name: "reference.categories", query: categoriesQuery },
  ])
  const createCashflow = useMutation(
    trpc.cashflow.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.cashflow.list.queryFilter())
      },
    }),
  )
  const deleteCashflow = useMutation(trpc.cashflow.delete.mutationOptions())
  const updateCashflow = useMutation(trpc.cashflow.update.mutationOptions())

  async function removeTx(rawId: string) {
    await deleteCashflow.mutateAsync({ id: rawId })
    await queryClient.invalidateQueries(trpc.cashflow.list.queryFilter())
    await queryClient.invalidateQueries(trpc.cashflow.summary.queryFilter())
    await queryClient.invalidateQueries(trpc.cashflow.breakdown.queryFilter())
    await queryClient.invalidateQueries(trpc.assets.netWorth.queryFilter())
  }

  const analysisKind: "expense" | "income" = kindFilter === "income" ? "income" : "expense"
  const analysisLabel = analysisKind === "income" ? "收入" : "消费"
  const analysisColor = analysisKind === "income" ? "var(--accent)" : "var(--red)"
  const categoryById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [String(category.id), category])),
    [categoriesQuery.data],
  )
  // 每次进入页面为每个分类随机重排一次识别色；ref 保证本次访问内（含分类重新拉取）不再变化。
  const randomCategoryColorsRef = useRef<Map<string, string> | null>(null)
  const randomCategoryColors = useMemo(() => {
    if (randomCategoryColorsRef.current != null) return randomCategoryColorsRef.current
    const categories = categoriesQuery.data ?? []
    if (categories.length === 0) return new Map<string, string>()
    const palette = shufflePalette()
    const map = new Map<string, string>()
    categories.forEach((category, index) => {
      map.set(String(category.id), palette[index % palette.length]!)
    })
    randomCategoryColorsRef.current = map
    return map
  }, [categoriesQuery.data])
  const txs = useMemo(
    () =>
      (cashflowQuery.data ?? []).map((event, index) =>
        toTx(event, index, randomCategoryColors.get(String(event.categoryId ?? "")) ?? null),
      ),
    [cashflowQuery.data, randomCategoryColors],
  )
  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter(
          (category) =>
            !category.archived &&
            (category.categoryKind === analysisKind || category.kind === analysisKind),
        )
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [analysisKind, categoriesQuery.data],
  )
  const categoryFilterOptions = useMemo(() => {
    const options = [
      { key: "all", label: "全部分类" },
      ...categoryOptions.map((category) => ({ key: String(category.id), label: category.name })),
    ]
    if (categoryFilter === UNCATEGORIZED_CATEGORY_FILTER) {
      options.push({ key: UNCATEGORIZED_CATEGORY_FILTER, label: "未分类" })
    }
    const selectedCategories = categoryFilterSet(categoryFilter)
    if (selectedCategories != null && selectedCategories.size > 1) {
      options.push({ key: categoryFilter, label: `${selectedCategories.size} 个分类` })
    }
    return options
  }, [categoryFilter, categoryOptions])
  useEffect(() => {
    if (categoriesQuery.data == null) return
    if (categoryFilter === "all") return
    if (categoryFilter === UNCATEGORIZED_CATEGORY_FILTER) return
    const selectedCategories = categoryFilterSet(categoryFilter)
    if (
      selectedCategories != null &&
      [...selectedCategories].every((id) =>
        categoryOptions.some((category) => String(category.id) === id),
      )
    ) {
      return
    }
    setValue("categoryFilter", "all")
    updateUrlFilters({ categoryFilter: "all" })
  }, [categoriesQuery.data, categoryFilter, categoryOptions, setValue, updateUrlFilters])
  const filteredTxs = useMemo(() => {
    const selectedCategories = categoryFilterSet(categoryFilter)
    return txs.filter((tx) => {
      if (dateFrom && tx.date < dateFrom) return false
      if (dateTo && tx.date > dateTo) return false
      if (selectedCategories != null && !selectedCategories.has(String(tx.categoryId ?? ""))) {
        return false
      }
      if (kindFilter !== "all" && tx.flowKind !== kindFilter) return false
      return true
    })
  }, [categoryFilter, dateFrom, dateTo, kindFilter, txs])
  const rangeOut = filteredTxs
    .filter((t) => t.flowKind === "expense")
    .reduce((s, t) => s + t.amount, 0)
  const rangeIn = filteredTxs
    .filter((t) => t.flowKind === "income")
    .reduce((s, t) => s + t.amount, 0)
  const rangeNet = rangeIn - rangeOut

  const dailyBuckets = useMemo(() => {
    const { from, to } = compactDateRange(filteredTxs, dateFrom, dateTo, dateKey(refDate))
    const totalDays = Math.max(1, dateKeyDiff(from, to) + 1)
    const bucketCount = totalDays <= 31 ? totalDays : 30
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const startOffset = Math.floor((index * totalDays) / bucketCount)
      const endOffset = Math.max(
        startOffset,
        Math.floor(((index + 1) * totalDays) / bucketCount) - 1,
      )
      const bucketFrom = addDateKeyDays(from, startOffset)
      const bucketTo = addDateKeyDays(from, endOffset)
      return {
        from: bucketFrom,
        to: bucketTo,
        amount: 0,
        label:
          bucketFrom === bucketTo
            ? bucketTo.slice(5)
            : `${bucketFrom.slice(5)} 至 ${bucketTo.slice(5)}`,
      }
    })
    for (const t of filteredTxs) {
      if (t.flowKind !== analysisKind) continue
      if (t.date < from || t.date > to) continue
      const offset = dateKeyDiff(from, t.date)
      const index = Math.max(
        0,
        Math.min(bucketCount - 1, Math.floor((offset / totalDays) * bucketCount)),
      )
      buckets[index].amount += t.amount
    }
    return buckets
  }, [analysisKind, dateFrom, dateTo, filteredTxs, refDate])
  const dailyBars = dailyBuckets.map((bucket) => bucket.amount)
  const dailyBarLabels = dailyBuckets.map((bucket) => bucket.label)
  const dailyAxisStart = dailyBuckets[0]?.from.slice(5) ?? "开始"
  const dailyAxisEnd = dailyBuckets[dailyBuckets.length - 1]?.to.slice(5) ?? "结束"

  const flowBreakdown = useMemo(() => {
    const map = new Map<string, FlowBreakdownSegment>()
    for (const t of filteredTxs) {
      if (t.flowKind !== analysisKind) continue
      const categoryFilterValue =
        t.categoryId == null ? UNCATEGORIZED_CATEGORY_FILTER : String(t.categoryId)
      const key = t.categoryId == null ? `uncategorized:${analysisKind}` : String(t.categoryId)
      const category = t.categoryId == null ? null : categoryById.get(String(t.categoryId))
      const current = map.get(key)
      map.set(key, {
        categoryFilterValue,
        name: category?.name ?? t.categoryName,
        amt: (current?.amt ?? 0) + t.amount,
        color:
          randomCategoryColors.get(String(t.categoryId ?? "")) ??
          category?.color ??
          CATEGORY_COLORS[t.categoryName] ??
          (analysisKind === "income" ? "var(--accent)" : CATEGORY_COLORS["其他"]),
      })
    }
    return [...map.values()].sort((a, b) => b.amt - a.amt)
  }, [analysisKind, categoryById, filteredTxs, randomCategoryColors])

  const analysisTotal = flowBreakdown.reduce((s, c) => s + c.amt, 0)
  const sorted = useMemo(
    () => [...filteredTxs].sort((a, b) => b.date.localeCompare(a.date)),
    [filteredTxs],
  )
  const activeDays = dailyBars.filter((v) => v > 0).length
  const analysisCount = sorted.filter((t) => t.flowKind === analysisKind).length
  const hasFilters =
    timeFilter !== DEFAULT_FILTERS.timeFilter ||
    dateFrom !== DEFAULT_FILTERS.dateFrom ||
    dateTo !== DEFAULT_FILTERS.dateTo ||
    categoryFilter !== DEFAULT_FILTERS.categoryFilter ||
    kindFilter !== DEFAULT_FILTERS.kindFilter

  function resetFilters() {
    urlFiltersRef.current = DEFAULT_FILTERS
    reset(DEFAULT_FILTERS)
    void setUrlFilters(null)
  }

  function applyCustomDateRange(nextFrom: string, nextTo: string) {
    setValue("timeFilter", "custom")
    setValue("dateFrom", nextFrom)
    setValue("dateTo", nextTo)
    setSelectedTx(null)
    updateUrlFilters({ timeFilter: "custom", dateFrom: nextFrom, dateTo: nextTo })
  }

  function applyCategoryBreakdownFilter(segment: FlowBreakdownSegment) {
    setValue("categoryFilter", segment.categoryFilterValue)
    setSelectedTx(null)
    updateUrlFilters({ categoryFilter: segment.categoryFilterValue })
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  /**
   * The filter bar is itself sticky, so the table header must stick exactly below it. Its
   * height depends on the control row wrapping, so it is measured instead of hard-coded —
   * a stale constant leaves the header hovering over the first rows instead of pinning.
   */
  const filterBarRef = useRef<HTMLDivElement>(null)
  const [filterBarHeight, setFilterBarHeight] = useState(0)
  useLayoutEffect(() => {
    const el = filterBarRef.current
    if (!el) return
    // Measured before paint so the header never flashes at the wrong offset.
    const sync = () => setFilterBarHeight(el.getBoundingClientRect().height)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const table = useReactTable({
    data: sorted,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })
  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 8,
  })

  async function refreshCashflowViews() {
    await queryClient.invalidateQueries(trpc.cashflow.list.queryFilter())
    await queryClient.invalidateQueries(trpc.cashflow.summary.queryFilter())
    await queryClient.invalidateQueries(trpc.cashflow.breakdown.queryFilter())
    await queryClient.invalidateQueries(trpc.assets.netWorth.queryFilter())
  }

  function txToForm(tx: Tx): TxForm {
    return {
      ...emptyTxForm(),
      flowKind: tx.flowKind === "income" ? "income" : "expense",
      amount: String(tx.amount),
      counterparty: tx.counterparty,
      categoryId:
        (cashflowQuery.data ?? []).find((event) => String(event.id) === tx.rawId)?.categoryId ??
        null,
      source: tx.source,
      date: tx.date,
      note: tx.userNote ?? "",
    }
  }

  function handleAddTx(form: TxForm) {
    createCashflow.mutate({
      eventDate: form.date,
      title: form.counterparty,
      counterparty: form.counterparty,
      amount: Math.abs(Number(form.amount) || 0).toFixed(2),
      direction: form.flowKind === "income" ? "in" : "out",
      flowKind: form.flowKind,
      categoryId: form.categoryId,
      sourceKind: "manual",
      sourceName: form.source.trim() || null,
      userNote: form.note.trim() || null,
      includeInAnalytics: true,
      classificationSource: "manual",
    })
    setShowAddTx(false)
  }

  async function handleEditTx(form: TxForm) {
    if (!editingTx) return
    await updateCashflow.mutateAsync({
      id: editingTx.rawId,
      eventDate: form.date,
      title: form.counterparty,
      counterparty: form.counterparty,
      amount: Math.abs(Number(form.amount) || 0).toFixed(2),
      direction: form.flowKind === "income" ? "in" : "out",
      flowKind: form.flowKind,
      categoryId: form.categoryId,
      userNote: form.note.trim() || null,
    })
    await refreshCashflowViews()
    setSelectedTx(null)
    setEditingTx(null)
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
      {/* Header — fixed */}
      <div style={{ flexShrink: 0, padding: "28px 32px 20px" }}>
        {/* Stats */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 48, marginBottom: 20 }}>
          <div>
            <Dim style={{ fontSize: 11, marginBottom: 4 }}>消费</Dim>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 36,
                fontWeight: 700,
                color: "var(--red)",
                letterSpacing: "-0.02em",
              }}
            >
              −{fmt(rangeOut)}
            </div>
          </div>
          <div>
            <Dim style={{ fontSize: 11, marginBottom: 4 }}>收入</Dim>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 36,
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "-0.02em",
              }}
            >
              +{fmt(rangeIn)}
            </div>
          </div>
          <div>
            <Dim style={{ fontSize: 11, marginBottom: 4 }}>净流入</Dim>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 36,
                fontWeight: 700,
                color: rangeNet >= 0 ? "var(--ink)" : "var(--red)",
                letterSpacing: "-0.02em",
              }}
            >
              {rangeNet >= 0 ? "+" : "−"}
              {fmt(Math.abs(rangeNet))}
            </div>
          </div>
          <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
            <Button size="sm" variant="primary" onPress={() => setShowAddTx(true)}>
              <AppIcon name="add" size={13} />
              记一笔
            </Button>
          </div>
        </div>

        {/* Daily bars */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
              每日{analysisLabel}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-4)" }}>
              {sorted.length} 笔 · {analysisLabel} {analysisCount} 笔 · 导入证据{" "}
              {statementLinesQuery.data?.length ?? 0} 行 · 日均 ¥
              {fmt(activeDays > 0 ? Math.round(analysisTotal / activeDays) : 0)}
              {" · "}
              <Link
                to="/analysis"
                className="cursor-pointer text-[var(--accent)] hover:opacity-75 transition-opacity"
              >
                查看结余信息 →
              </Link>
            </span>
          </div>
          <DailyBars
            data={dailyBars}
            labels={dailyBarLabels}
            color={analysisColor}
            todayIndex={dailyBars.length - 1}
            height={56}
            onBarClick={(index) => {
              const bucket = dailyBuckets[index]
              if (!bucket) return
              applyCustomDateRange(bucket.from, bucket.to)
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <Dim style={{ fontSize: 9.5 }}>{dailyAxisStart}</Dim>
            <Dim style={{ fontSize: 9.5, color: "var(--accent)", fontWeight: 600 }}>
              {dailyAxisEnd}
            </Dim>
          </div>
        </div>
      </div>

      {/* Content — two independent scroll columns */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Left: transaction table — TanStack Virtual */}
        <div
          ref={scrollRef}
          className="bubo-scroller"
          style={{ flex: "0 0 68%", minWidth: 0, height: "100%", overflowY: "auto" }}
        >
          <div
            ref={filterBarRef}
            className="sticky top-0 z-[2] border-b border-[var(--hair-3)] bg-[var(--surface-1)] px-8 pb-2.5"
          >
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => event.preventDefault()}
            >
              <Controller
                control={control}
                name="kindFilter"
                render={({ field }) => (
                  <FilterSelectField
                    label="类型"
                    value={field.value}
                    onChange={(value) => {
                      const next = value as KindFilterKey
                      field.onChange(next)
                      updateUrlFilters({ kindFilter: next })
                    }}
                    options={KIND_FILTERS}
                    className="w-[108px]"
                  />
                )}
              />
              <Controller
                control={control}
                name="categoryFilter"
                render={({ field }) => (
                  <FilterSelectField
                    label="分类"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value)
                      updateUrlFilters({ categoryFilter: value })
                    }}
                    options={categoryFilterOptions}
                    className="w-[122px]"
                  />
                )}
              />
              <div className="w-[300px]">
                <FormField label="时间" labelClassName={FILTER_LABEL_CLASS}>
                  <DateRangeFilter
                    value={{ from: dateFrom, to: dateTo }}
                    allowAll
                    onChange={(next) => applyCustomDateRange(next.from, next.to)}
                    onPresetChange={(key) => {
                      if (key === "custom") return
                      setValue("timeFilter", key as TimeFilterKey)
                      updateUrlFilters({ timeFilter: key })
                    }}
                  />
                </FormField>
              </div>
              {hasFilters && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onPress={resetFilters}
                  className="ml-auto mb-px h-[30px] rounded-[5px] px-2.5 text-[11px]"
                >
                  重置
                </Button>
              )}
              <span
                className={`whitespace-nowrap pb-[5px] text-[10.5px] text-[var(--ink-4)] ${
                  hasFilters ? "" : "ml-auto"
                }`}
              >
                共 {sorted.length} 笔 · 支出 ¥{fmt(rangeOut)} · 收入 ¥{fmt(rangeIn)}
              </span>
            </form>
          </div>
          <table
            style={{
              width: "calc(100% - 64px)",
              margin: "0 32px",
              borderCollapse: "collapse",
              fontSize: 12,
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              {table.getAllColumns().map((col) => (
                <col key={col.id} style={{ width: col.getSize() }} />
              ))}
            </colgroup>
            <thead
              style={{
                position: "sticky",
                top: filterBarHeight,
                zIndex: 1,
                background: "var(--surface-1)",
              }}
            >
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={{ borderBottom: "1px solid var(--hair-2)" }}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{
                        width: h.column.getSize(),
                        padding: "4px 8px 8px",
                        textAlign: h.id === "amount" ? "right" : "left",
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--ink-4)",
                        whiteSpace: "nowrap",
                        background: "var(--surface-1)",
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {(() => {
                const items = virtualizer.getVirtualItems()
                const paddingTop = items.length > 0 ? items[0].start : 0
                const paddingBottom =
                  items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
                return (
                  <>
                    {paddingTop > 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ height: paddingTop, padding: 0, border: "none" }}
                        />
                      </tr>
                    )}
                    {items.map((vRow) => {
                      const row = rows[vRow.index]
                      const tx = row.original
                      const isSelected = selectedTx?.id === tx.id
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedTx(tx)}
                          aria-selected={isSelected}
                          className="bubo-row cursor-pointer border-b border-[var(--hair-3)]"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td
                              key={cell.id}
                              className={cell.column.id === "amount" ? "bubo-num" : undefined}
                              style={{
                                height: 38,
                                padding: "0 8px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                textAlign: cell.column.id === "amount" ? "right" : "left",
                              }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ height: paddingBottom, padding: 0, border: "none" }}
                        />
                      </tr>
                    )}
                  </>
                )
              })()}
            </tbody>
          </table>
          <div style={{ padding: "16px 32px 112px" }}>
            {rows.length === 0 && (
              <Dim style={{ fontSize: 12, lineHeight: 1.7, display: "block", marginBottom: 12 }}>
                暂无流水。导入账单或手动记一笔后，这里会显示真实现金流。
              </Dim>
            )}
            <Dim style={{ fontSize: 11, lineHeight: 1.6 }}>
              流水只作参考，不强迫你处理每一笔。来源见左表。
            </Dim>
          </div>
        </div>

        {/* Right: detail panel or donut */}
        <ScrollArea className="h-full" style={{ flex: 1, minWidth: 0 }}>
          {selectedTx ? (
            <TxDetailPanel
              tx={selectedTx}
              allTxs={sorted}
              onBack={() => setSelectedTx(null)}
              onEdit={(tx) => setEditingTx(tx)}
              onDelete={async (rawId) => {
                await removeTx(rawId)
                setSelectedTx(null)
              }}
            />
          ) : (
            <div style={{ padding: "20px 24px 112px" }}>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 16 }}
              >
                {analysisLabel}类别 · 当前筛选
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div style={{ position: "relative", width: 240, height: 240 }}>
                  <DonutChart
                    segments={flowBreakdown}
                    selectedCategoryFilter={categoryFilter}
                    onSelectCategory={applyCategoryBreakdownFilter}
                    size={240}
                    thick={42}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div>
                      <Dim style={{ fontSize: 9.5 }}>{analysisLabel}</Dim>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          fontSize: 15,
                          marginTop: 3,
                        }}
                      >
                        ¥
                        {analysisTotal >= 10000
                          ? `${(analysisTotal / 10000).toFixed(1)}万`
                          : fmt(analysisTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {flowBreakdown.map((c) => {
                  const isActive = categoryFilterIncludes(categoryFilter, c.categoryFilterValue)
                  return (
                    <button
                      key={c.categoryFilterValue}
                      type="button"
                      aria-label={`筛选${c.name}`}
                      onClick={() => applyCategoryBreakdownFilter(c)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        appearance: "none",
                        border: 0,
                        borderRadius: 6,
                        background:
                          categoryFilter === c.categoryFilterValue ? "var(--surface-2)" : "none",
                        padding: "3px 4px",
                        color: "inherit",
                        cursor: "pointer",
                        font: "inherit",
                        opacity: isActive ? 1 : 0.55,
                        textAlign: "left",
                        transition: "background 0.1s, opacity 0.1s",
                      }}
                    >
                      <ColorDot color={c.color} size={7} />
                      <span style={{ fontSize: 12, color: "var(--ink-2)", flex: 1 }}>{c.name}</span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11.5,
                          color: "var(--ink-3)",
                          paddingRight: 4,
                        }}
                      >
                        ¥{fmt(c.amt)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--ink-4)",
                          width: 26,
                          textAlign: "right",
                        }}
                      >
                        {analysisTotal > 0 ? Math.round((c.amt / analysisTotal) * 100) : 0}%
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
      <AddTxModal
        open={showAddTx}
        categories={categoriesQuery.data ?? []}
        initial={voiceTxForm}
        onClose={() => {
          const wasVoice = voiceTxForm != null
          setShowAddTx(false)
          setVoiceTxForm(undefined)
          continueVoiceQueue("cashflow", wasVoice)
        }}
        onSave={handleAddTx}
      />
      <AddTxModal
        open={editingTx != null}
        title="编辑流水"
        subtitle="修改金额、分类、日期和备注"
        categories={categoriesQuery.data ?? []}
        initial={editingTx ? txToForm(editingTx) : undefined}
        onClose={() => setEditingTx(null)}
        onSave={(form) => void handleEditTx(form)}
      />
    </div>
  )
}
