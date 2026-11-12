/**
 * @purpose Render and manage the settings categories page workflow.
 * @role    Renderer feature surface for app configuration and reference data.
 * @deps    React, tRPC settings/reference queries, HeroUI controls, and local UI components.
 * @gotcha  Category names can repeat across kinds; use category ids for stats and edits.
 */

import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, Input, Modal } from "@heroui/react"
import { Controller, useForm } from "react-hook-form"
import type { CashflowEventSummary, CategorySummary } from "@bubo/api"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { useMoney } from "@/lib/useMoney"
import { ScrollArea } from "../components/ui/ScrollArea"
import { BackButton } from "../components/ui/BackButton"
import { useConfirm } from "../components/ui/ConfirmModal"
import { ColorPickerField } from "../components/ui/ColorPickerField"
import { ColorDot } from "../components/ui/ColorDot"
import { FormField } from "../components/ui/FormField"
import { QueryState } from "../components/ui/QueryState"
import { SettingsGroup } from "./components"

const CATEGORY_KINDS = [
  { value: "expense", label: "支出" },
  { value: "income", label: "收入" },
  { value: "transfer", label: "转账" },
  { value: "debt", label: "债务" },
  { value: "asset_movement", label: "资产流转" },
  { value: "adjustment", label: "调整" },
] as const

const KIND_META: Record<string, { label: string; toneClass: string }> = {
  expense: { label: "支出", toneClass: "text-[var(--red)]" },
  income: { label: "收入", toneClass: "text-[var(--accent)]" },
  transfer: { label: "转账", toneClass: "text-[var(--ink-3)]" },
  debt: { label: "债务", toneClass: "text-[var(--red)]" },
  asset_movement: { label: "资产流转", toneClass: "text-[var(--ink-3)]" },
  adjustment: { label: "调整", toneClass: "text-[var(--ink-3)]" },
  neutral: { label: "中性", toneClass: "text-[var(--ink-3)]" },
}

const KIND_FALLBACK_COLOR: Record<string, string> = {
  expense: "var(--red)",
  income: "var(--accent)",
  transfer: "var(--ink-3)",
  debt: "var(--red)",
  asset_movement: "var(--ink-3)",
  adjustment: "var(--ink-3)",
  neutral: "var(--ink-3)",
}

interface CategoryForm {
  name: string
  categoryKind: string
  color: string
  /** Concrete items this category covers; fed to the voice prompt as the model's 示例. */
  description: string
}

const EMPTY_CATEGORY_FORM: CategoryForm = {
  name: "",
  categoryKind: "expense",
  color: "#8a9590",
  description: "",
}

interface CategoryStats {
  count: number
  monthAmount: number
}

/** Shared grid template so the header row and data rows stay column-aligned. */
const CATEGORY_GRID = "grid-cols-[minmax(160px,1fr)_104px_104px_104px_124px]"

function kindOf(category: CategorySummary) {
  return category.categoryKind || category.kind || "expense"
}

function colorFor(category: CategorySummary) {
  const kind = kindOf(category)
  return category.color ?? KIND_FALLBACK_COLOR[kind] ?? "var(--ink-4)"
}

function buildStats(events: CashflowEventSummary[], monthPrefix: string) {
  const stats = new Map<string, CategoryStats>()
  for (const event of events) {
    if (event.categoryId == null) continue
    const key = String(event.categoryId)
    const amount = Math.abs(Number(event.amount) || 0)
    const current = stats.get(key) ?? { count: 0, monthAmount: 0 }
    current.count += 1
    if (event.date.startsWith(monthPrefix)) current.monthAmount += amount
    stats.set(key, current)
  }
  return stats
}

function statFor(category: CategorySummary, stats: Map<string, CategoryStats>) {
  return stats.get(String(category.id)) ?? { count: 0, monthAmount: 0 }
}

function KindBadge({ kind, archived }: { kind: string; archived?: boolean }) {
  const meta = KIND_META[kind] ?? { label: kind, toneClass: "text-[var(--ink-3)]" }
  return (
    <span
      className={`whitespace-nowrap text-[11.5px] font-medium ${archived ? "text-[var(--ink-4)]" : meta.toneClass}`}
    >
      {archived ? "已归档" : meta.label}
    </span>
  )
}

function CategoryModal({
  open,
  category,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  category: CategorySummary | null
  saving: boolean
  onClose: () => void
  onSave: (form: CategoryForm) => void | Promise<void>
}) {
  const {
    formState: { errors, isSubmitting },
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CategoryForm>({ defaultValues: EMPTY_CATEGORY_FORM })
  const form = watch()

  useEffect(() => {
    if (!open) return
    reset(
      category
        ? {
            name: category.name,
            categoryKind: kindOf(category),
            color: category.color ?? "#8a9590",
            description: category.description ?? "",
          }
        : EMPTY_CATEGORY_FORM,
    )
  }, [category, open, reset])

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <Modal.Container>
        <Modal.Dialog style={{ maxWidth: 420 }}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{category ? "编辑分类" : "新建分类"}</Modal.Heading>
            <p className="mt-0.5 text-[12px] text-[var(--ink-4)]">
              分类只影响流水归类和统计，不改变现金流金额。
            </p>
          </Modal.Header>
          <Modal.Body>
            <form
              id="category-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              className="flex flex-col gap-3.5"
            >
              <FormField label="分类名称" required error={errors.name?.message}>
                <Input
                  variant="secondary"
                  placeholder="例如：餐饮"
                  aria-invalid={Boolean(errors.name)}
                  {...register("name", {
                    validate: (value) => value.trim().length > 0 || "请输入分类名称",
                  })}
                />
              </FormField>
              <FormField label="包含内容（供语音自动归类）">
                <textarea
                  rows={2}
                  placeholder="例如：饮料、咖啡、奶茶、雪糕、薯片"
                  className="w-full resize-y rounded-[6px] border border-[var(--hair-2)] bg-[var(--surface-1)] px-2 py-1.5 text-[12px] leading-[1.7] text-[var(--ink)] outline-none placeholder:text-[var(--ink-5)] focus-visible:border-[var(--accent)]"
                  {...register("description")}
                />
                <div className="mt-1.5 text-[11px] leading-normal text-[var(--ink-4)]">
                  用顿号分隔这类常买的项目。语音录入时，模型按这份清单把「饮料」这类具体说法归到本分类。
                </div>
              </FormField>
              <FormField label="类型" required>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_KINDS.map((kind) => {
                    const active = form.categoryKind === kind.value
                    return (
                      <button
                        key={kind.value}
                        type="button"
                        onClick={() => setValue("categoryKind", kind.value)}
                        className={`h-[30px] cursor-pointer rounded-md border px-2.5 text-[12px] font-medium ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--hair-2)] bg-[var(--surface-1)] text-[var(--ink-2)]"
                        }`}
                      >
                        {kind.label}
                      </button>
                    )
                  })}
                </div>
              </FormField>
              <FormField label="颜色">
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <ColorPickerField value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>
            </form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="primary"
              className="rounded-[5px]"
              isDisabled={saving || isSubmitting}
              onPress={() => void handleSubmit(onSave)()}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button variant="outline" className="rounded-[5px]" onPress={onClose}>
              取消
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function CategoryRow({
  category,
  stats,
  onEdit,
  onArchive,
}: {
  category: CategorySummary
  stats: CategoryStats
  onEdit: (category: CategorySummary) => void
  onArchive: (category: CategorySummary) => void
}) {
  const fmt = useMoney()
  const kind = kindOf(category)
  return (
    <div
      className={`grid min-h-[50px] items-center gap-3 border-t border-[var(--hair-3)] py-2.5 ${CATEGORY_GRID} ${
        category.archived ? "opacity-[0.46]" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-[9px]">
        <ColorDot color={colorFor(category)} size={9} />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-[var(--ink)]">
            {category.name}
          </div>
          {category.description ? (
            <div className="truncate text-[11px] text-[var(--ink-4)]">{category.description}</div>
          ) : null}
        </div>
      </div>
      <KindBadge kind={kind} archived={category.archived} />
      <span className="whitespace-nowrap text-[11.5px] text-[var(--ink-3)]">
        {stats.count > 0 ? `${stats.count} 笔` : "暂无流水"}
      </span>
      <span
        className={`text-right whitespace-nowrap font-['IBM_Plex_Mono'] text-[12px] ${
          stats.monthAmount > 0 ? "text-[var(--ink)]" : "text-[var(--ink-4)]"
        }`}
      >
        ¥{fmt(stats.monthAmount)}
      </span>
      {!category.archived ? (
        <div className="flex justify-end gap-0.5">
          <Button size="sm" variant="ghost" onPress={() => onEdit(category)}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--red)]"
            onPress={() => onArchive(category)}
          >
            归档
          </Button>
        </div>
      ) : (
        <span className="text-right text-[11.5px] text-[var(--ink-4)]">不可选</span>
      )}
    </div>
  )
}

function CategorySection({
  title,
  note,
  categories,
  stats,
  onEdit,
  onArchive,
}: {
  title: string
  note: string
  categories: CategorySummary[]
  stats: Map<string, CategoryStats>
  onEdit: (category: CategorySummary) => void
  onArchive: (category: CategorySummary) => void
}) {
  const activeCount = categories.filter((category) => !category.archived).length

  return (
    <SettingsGroup title={title}>
      <div className="mb-1.5 flex items-baseline">
        <span className="text-[13.5px] font-medium text-[var(--ink)]">{activeCount} 个可用</span>
        <span className="ml-2 text-[11.5px] text-[var(--ink-4)]">{note}</span>
      </div>
      <div
        className={`grid gap-3 border-t border-[var(--hair-2)] pt-1 pb-[7px] text-[10.5px] font-medium text-[var(--ink-4)] ${CATEGORY_GRID}`}
      >
        <span>分类</span>
        <span>类型</span>
        <span>引用</span>
        <span className="text-right">本月</span>
        <span className="text-right">操作</span>
      </div>
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          stats={statFor(category, stats)}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      ))}
      {categories.length === 0 && (
        <div className="border-t border-[var(--hair-3)] py-[18px] text-[12px] text-[var(--ink-4)]">
          暂无分类
        </div>
      )}
    </SettingsGroup>
  )
}

export function CategoriesPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery(
    trpc.reference.categories.queryOptions({ includeArchived: true }),
  )
  const cashflowQuery = useQuery(trpc.cashflow.list.queryOptions({ status: "active", limit: 1000 }))
  const createCategory = useMutation(trpc.reference.createCategory.mutationOptions())
  const updateCategory = useMutation(trpc.reference.updateCategory.mutationOptions())
  const archiveCategory = useMutation(trpc.reference.archiveCategory.mutationOptions())
  const [editingCategory, setEditingCategory] = useState<CategorySummary | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  usePagePerf("settings-categories", [
    { name: "reference.categories", query: categoriesQuery },
    { name: "cashflow.list", query: cashflowQuery },
  ])

  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const categories = categoriesQuery.data ?? []
  const stats = useMemo(
    () => buildStats(cashflowQuery.data ?? [], monthPrefix),
    [cashflowQuery.data, monthPrefix],
  )
  const expenseCategories = useMemo(
    () => categories.filter((category) => kindOf(category) === "expense"),
    [categories],
  )
  const incomeCategories = useMemo(
    () => categories.filter((category) => kindOf(category) === "income"),
    [categories],
  )
  const otherCategories = useMemo(
    () =>
      categories.filter((category) => {
        const kind = kindOf(category)
        return kind !== "expense" && kind !== "income"
      }),
    [categories],
  )
  const activeCount = categories.filter((category) => !category.archived).length
  const archivedCount = categories.length - activeCount

  async function refreshCategories() {
    await queryClient.invalidateQueries(trpc.reference.categories.queryFilter())
    await queryClient.invalidateQueries(trpc.cashflow.list.queryFilter())
  }

  function openCategoryForm(category: CategorySummary | null) {
    setEditingCategory(category)
    setShowCategoryForm(true)
  }

  function closeCategoryForm() {
    setShowCategoryForm(false)
    setEditingCategory(null)
  }

  async function handleSaveCategory(form: CategoryForm) {
    const input = {
      name: form.name.trim(),
      categoryKind: form.categoryKind,
      color: form.color || null,
      description: form.description.trim() || null,
    }
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, ...input })
    } else {
      await createCategory.mutateAsync(input)
    }
    closeCategoryForm()
    await refreshCategories()
  }

  function confirmArchiveCategory(category: CategorySummary) {
    confirm({
      title: "归档分类",
      description: `归档「${category.name}」后，新流水选择分类时不再显示它；历史流水仍保留引用。确定继续？`,
      confirmText: "归档",
      danger: true,
      onConfirm: async () => {
        await archiveCategory.mutateAsync({ id: category.id })
        await refreshCategories()
      },
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="shrink-0 border-b border-[var(--hair-2)] px-8 pt-7 pb-5">
        <div className="mx-auto w-[720px] max-w-full">
          <div className="mb-3.5">
            <BackButton label="返回设置" onBack={() => void navigate({ to: "/settings" })} />
          </div>
          <div className="flex items-end gap-[18px]">
            <div className="min-w-0">
              <div className="mb-1 font-['IBM_Plex_Mono'] text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                分类管理
              </div>
              <div className="text-[12.5px] text-[var(--ink-4)]">
                分类按收入、支出和其他现金流分组；同名分类可以存在于不同类型。
              </div>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] text-[var(--ink-4)]">可用</span>
                <span className="font-['IBM_Plex_Mono'] text-[18px] font-semibold">
                  {activeCount}
                </span>
                <span className="text-[12px] text-[var(--ink-4)]">归档 {archivedCount}</span>
              </div>
              <Button
                size="sm"
                variant="primary"
                className="rounded-[5px]"
                onPress={() => openCategoryForm(null)}
              >
                + 新建分类
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="h-full flex-1 min-h-0">
        <div className="mx-auto box-border w-[720px] max-w-full pb-28">
          <QueryState query={categoriesQuery} skeletonRows={6}>
            <CategorySection
              title="支出分类"
              note="用于消费结构、预算引用和流水筛选"
              categories={expenseCategories}
              stats={stats}
              onEdit={openCategoryForm}
              onArchive={confirmArchiveCategory}
            />

            <CategorySection
              title="收入分类"
              note="用于收入结构分析，不进入支出预算"
              categories={incomeCategories}
              stats={stats}
              onEdit={openCategoryForm}
              onArchive={confirmArchiveCategory}
            />

            <CategorySection
              title="其他现金流"
              note="转账、债务、资产流转和调整类分类"
              categories={otherCategories}
              stats={stats}
              onEdit={openCategoryForm}
              onArchive={confirmArchiveCategory}
            />
          </QueryState>
        </div>
      </ScrollArea>
      <CategoryModal
        open={showCategoryForm}
        category={editingCategory}
        saving={createCategory.isPending || updateCategory.isPending}
        onClose={closeCategoryForm}
        onSave={handleSaveCategory}
      />
    </div>
  )
}
