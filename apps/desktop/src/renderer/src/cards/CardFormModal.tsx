/**
 * @purpose Create and edit a payment card.
 * @role    Renderer form surface for the card wallet.
 * @deps    React Hook Form, HeroUI inputs, and renderer form atoms.
 * @gotcha  Only the last four digits are collected on purpose — never ask for a full card
 *          number or CVV. Bank and name are the only required fields; everything else is
 *          optional metadata the user can fill in later. The grid gives every control at
 *          least half the dialog width: a currency combobox or a pair of year digits
 *          collapses to one visible character in a three-column row. A failed save keeps
 *          the dialog open and reports the reason instead of closing silently.
 */

import { Button, Input, Label, Modal, Select, ListBox } from "@heroui/react"
import { useEffect, useState, type ReactNode } from "react"
import { Controller, useForm } from "react-hook-form"
import { AppIcon, notify } from "@bubo/ui"
import type {
  CardBrand,
  CardSide,
  CardSummary,
  CardType,
  CreateCardInput,
} from "@bubo/shared/contracts"
import { FormField } from "../components/ui/FormField"
import { CurrencySelect } from "../components/ui/CurrencySelect"
import { ColorPickerField } from "../components/ui/ColorPickerField"

export interface CardFormValues {
  name: string
  bank: string
  cardType: CardType
  brand: CardBrand
  numberLast4: string
  holderName: string
  currency: string
  creditLimit: string
  billingDay: string
  repaymentDay: string
  expiryMonth: string
  expiryYear: string
  colorHex: string
  note: string
}

const CARD_TYPES: Array<{ key: CardType; label: string }> = [
  { key: "debit", label: "借记卡" },
  { key: "credit", label: "信用卡" },
  { key: "prepaid", label: "预付卡" },
  { key: "virtual", label: "虚拟卡" },
  { key: "other", label: "其他" },
]

const BRANDS: Array<{ key: CardBrand; label: string }> = [
  { key: "unionpay", label: "银联" },
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
  { key: "amex", label: "American Express" },
  { key: "jcb", label: "JCB" },
  { key: "other", label: "其他" },
]

const EXPIRY_MONTHS = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1).padStart(2, "0")
  return { key: month, label: `${month} 月` }
})

/** Cards live for a few years; keep a window rather than an unbounded year list. */
function expiryYears(now = new Date()): Array<{ key: string; label: string }> {
  const current = now.getFullYear()
  return Array.from({ length: 21 }, (_, index) => {
    const year = current - 5 + index
    return { key: String(year), label: `${year} 年` }
  })
}

export function emptyCardForm(currency = "CNY"): CardFormValues {
  return {
    name: "",
    bank: "",
    cardType: "debit",
    brand: "unionpay",
    numberLast4: "",
    holderName: "",
    currency,
    creditLimit: "",
    billingDay: "",
    repaymentDay: "",
    expiryMonth: "",
    expiryYear: "",
    colorHex: "",
    note: "",
  }
}

export function cardToForm(card: CardSummary): CardFormValues {
  return {
    name: card.name,
    bank: card.bank,
    cardType: card.cardType,
    brand: card.brand,
    numberLast4: card.numberLast4 ?? "",
    holderName: card.holderName ?? "",
    currency: card.currency,
    creditLimit: card.creditLimit ?? "",
    billingDay: card.billingDay == null ? "" : String(card.billingDay),
    repaymentDay: card.repaymentDay == null ? "" : String(card.repaymentDay),
    expiryMonth: card.expiryMonth == null ? "" : String(card.expiryMonth).padStart(2, "0"),
    expiryYear: card.expiryYear == null ? "" : String(card.expiryYear),
    colorHex: card.colorHex ?? "",
    note: card.note ?? "",
  }
}

function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function formToInput(values: CardFormValues): Omit<CreateCardInput, "displayOrder"> {
  return {
    name: values.name.trim(),
    bank: values.bank.trim(),
    cardType: values.cardType,
    brand: values.brand,
    numberLast4: values.numberLast4.trim() || null,
    holderName: values.holderName.trim() || null,
    currency: values.currency,
    creditLimit: values.cardType === "credit" ? values.creditLimit.trim() || null : null,
    billingDay: values.cardType === "credit" ? toNumber(values.billingDay) : null,
    repaymentDay: values.cardType === "credit" ? toNumber(values.repaymentDay) : null,
    expiryMonth: toNumber(values.expiryMonth),
    expiryYear: toNumber(values.expiryYear),
    colorHex: values.colorHex || null,
    note: values.note.trim() || null,
  }
}

/** One label + control pair; the grid keeps every column at least half the dialog wide. */
function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-4">{children}</div>
}

function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | ""
  options: Array<{ key: T; label: string }>
  onChange: (next: T) => void
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value === "" ? null : value}
      onSelectionChange={(key) => key != null && onChange(String(key) as T)}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

/** A scan the user picked in the form but has not imported yet (the card may not exist yet). */
export interface PickedScan {
  path: string
  dataUrl: string
}

export type CardScanPaths = Partial<Record<CardSide, string>>

interface CardFormModalProps {
  open: boolean
  /** Editing keeps the id; creating ignores it. */
  card?: CardSummary | null
  defaultCurrency: string
  /** Which faces the saved card already has, so the tiles can say "已有图片". */
  existingScans?: Record<CardSide, boolean>
  onClose: () => void
  /** Paths are imported by the caller once the card row exists. */
  onSave: (values: CardFormValues, scans: CardScanPaths) => void | Promise<void>
}

const SCAN_SIDES: Array<{ side: CardSide; label: string }> = [
  { side: "front", label: "正面" },
  { side: "back", label: "反面" },
]

export function CardFormModal({
  open,
  card,
  defaultCurrency,
  existingScans,
  onClose,
  onSave,
}: CardFormModalProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CardFormValues>({
    defaultValues: card ? cardToForm(card) : emptyCardForm(defaultCurrency),
  })
  const values = watch()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scans, setScans] = useState<Partial<Record<CardSide, PickedScan>>>({})
  const [pickingSide, setPickingSide] = useState<CardSide | null>(null)

  useEffect(() => {
    reset(card ? cardToForm(card) : emptyCardForm(defaultCurrency))
    setSaveError(null)
    setScans({})
    setPickingSide(null)
  }, [card, defaultCurrency, reset, open])

  function handleClose() {
    reset(card ? cardToForm(card) : emptyCardForm(defaultCurrency))
    setSaveError(null)
    setScans({})
    onClose()
  }

  async function pickScan(side: CardSide) {
    setPickingSide(side)
    try {
      const picked = await window.bubo.pickCardImage()
      if (picked) setScans((current) => ({ ...current, [side]: picked }))
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "无法读取图片")
    } finally {
      setPickingSide(null)
    }
  }

  function clearScan(side: CardSide) {
    setScans((current) => ({ ...current, [side]: undefined }))
  }

  const isCredit = values.cardType === "credit"
  const years = expiryYears()

  return (
    <Modal isOpen={open} onOpenChange={(next) => (!next ? handleClose() : undefined)}>
      <Modal.Container placement="center">
        <Modal.Dialog style={{ maxWidth: 560 }}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{card ? "编辑卡片" : "添加卡片"}</Modal.Heading>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
              只记录后四位与卡面信息，不保存完整卡号
            </p>
          </Modal.Header>
          <Modal.Body style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
            <form
              id="card-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(async (formValues) => {
                  setSaveError(null)
                  try {
                    const paths: CardScanPaths = {}
                    for (const { side } of SCAN_SIDES) {
                      const picked = scans[side]
                      if (picked) paths[side] = picked.path
                    }
                    await onSave(formValues, paths)
                    handleClose()
                  } catch (error) {
                    // Keep the dialog open: a silent close would look like the save worked.
                    setSaveError(error instanceof Error ? error.message : "保存失败，请重试")
                  }
                })()
              }}
            >
              <FieldGrid>
                <FormField label="名称" required error={errors.name?.message} className="min-w-0">
                  <Input
                    variant="secondary"
                    placeholder="例如：招行 Visa 白金"
                    aria-invalid={Boolean(errors.name)}
                    {...register("name", {
                      validate: (value) => value.trim().length > 0 || "请填写卡片名称",
                    })}
                  />
                </FormField>
                <FormField
                  label="发卡银行"
                  required
                  error={errors.bank?.message}
                  className="min-w-0"
                >
                  <Input
                    variant="secondary"
                    placeholder="例如：招商银行"
                    aria-invalid={Boolean(errors.bank)}
                    {...register("bank", {
                      validate: (value) => value.trim().length > 0 || "请填写发卡银行",
                    })}
                  />
                </FormField>

                <FormField label="卡片类型" className="min-w-0">
                  <Controller
                    control={control}
                    name="cardType"
                    render={({ field }) => (
                      <SelectField
                        value={field.value}
                        options={CARD_TYPES}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </FormField>
                <FormField label="卡组织" className="min-w-0">
                  <Controller
                    control={control}
                    name="brand"
                    render={({ field }) => (
                      <SelectField value={field.value} options={BRANDS} onChange={field.onChange} />
                    )}
                  />
                </FormField>

                <FormField label="卡号后四位" className="min-w-0">
                  <Input
                    variant="secondary"
                    placeholder="1234"
                    inputMode="numeric"
                    maxLength={4}
                    {...register("numberLast4")}
                  />
                </FormField>
                <FormField label="持卡人" className="min-w-0">
                  <Input variant="secondary" placeholder="可选" {...register("holderName")} />
                </FormField>

                <FormField label="币种" className="min-w-0">
                  <CurrencySelect
                    value={values.currency}
                    onChange={(code) => setValue("currency", code)}
                  />
                </FormField>
                <FormField label="有效期" className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Controller
                        control={control}
                        name="expiryMonth"
                        render={({ field }) => (
                          <SelectField
                            value={field.value}
                            options={EXPIRY_MONTHS}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    <span className="shrink-0 text-[12px] text-[var(--ink-4)]">/</span>
                    <div className="min-w-0 flex-1">
                      <Controller
                        control={control}
                        name="expiryYear"
                        render={({ field }) => (
                          <SelectField
                            value={field.value}
                            options={years}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </div>
                </FormField>

                {isCredit && (
                  <>
                    <FormField label="信用额度" className="col-span-2 min-w-0">
                      <Input
                        variant="secondary"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...register("creditLimit")}
                      />
                    </FormField>
                    <FormField label="账单日" className="min-w-0">
                      <Input
                        variant="secondary"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="例如：5"
                        {...register("billingDay")}
                      />
                    </FormField>
                    <FormField label="还款日" className="min-w-0">
                      <Input
                        variant="secondary"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="例如：23"
                        {...register("repaymentDay")}
                      />
                    </FormField>
                  </>
                )}

                <div className="col-span-2 min-w-0">
                  <Label
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    卡面主色
                  </Label>
                  <ColorPickerField
                    value={values.colorHex || "#2f6f8f"}
                    onChange={(hex) => setValue("colorHex", hex)}
                  />
                </div>

                <div className="col-span-2 min-w-0">
                  <Label
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    卡片图片
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {SCAN_SIDES.map(({ side, label }) => {
                      const picked = scans[side]
                      const preview = picked?.dataUrl ?? null
                      const already = existingScans?.[side] ?? false
                      const busy = pickingSide === side
                      return (
                        <div key={side} className="min-w-0">
                          <div
                            className="relative flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-dashed border-[var(--hair)] bg-[var(--surface-2)]"
                            style={{ aspectRatio: "1.586" }}
                          >
                            {preview ? (
                              <img
                                src={preview}
                                alt={`${label}预览`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex flex-col items-center gap-1 text-[10.5px] text-[var(--ink-4)]">
                                <AppIcon name={already ? "check" : "add"} size={15} />
                                {already ? "已有图片" : "未上传"}
                              </span>
                            )}
                            {busy && (
                              <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/70 text-[11px] text-[var(--ink-3)]">
                                读取中…
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[11px] text-[var(--ink-3)]">{label}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto"
                              isDisabled={busy}
                              onPress={() => void pickScan(side)}
                            >
                              {preview ? "更换" : "上传"}
                            </Button>
                            {picked && (
                              <Button size="sm" variant="ghost" onPress={() => clearScan(side)}>
                                移除
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-[var(--ink-4)]">
                    正反面各一张，保存卡片时一并导入（PNG / JPG / WebP，单张不超过 20MB）
                  </div>
                </div>

                <FormField label="备注" className="col-span-2 min-w-0">
                  <Input variant="secondary" placeholder="可选" {...register("note")} />
                </FormField>
              </FieldGrid>

              {saveError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: "var(--red)",
                  }}
                >
                  {saveError}
                </div>
              )}
            </form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={handleClose}>
              取消
            </Button>
            <Button
              variant="primary"
              isDisabled={isSubmitting}
              onPress={() => {
                const form = document.getElementById("card-form")
                if (form instanceof HTMLFormElement) form.requestSubmit()
              }}
            >
              {card ? "保存" : "添加"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  )
}
