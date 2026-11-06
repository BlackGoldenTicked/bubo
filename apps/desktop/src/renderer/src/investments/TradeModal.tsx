/**
 * @purpose Render the add-trade modal for buying or selling a position.
 * @role    Renderer feature surface for trade-driven positions.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  Trades re-derive position state through weighted-average replay; oversells are rejected.
 */

import { Button, Input, ListBox, Modal, Select } from "@heroui/react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import type { InvestmentPositionSummary, InvestmentTransactionSide } from "@bubo/shared/contracts"
import { todayKey } from "@/lib/dates"
import { FormField } from "../components/ui/FormField"
import { DateInput } from "../components/ui/DateInput"
import { Dim } from "../components/ui/Dim"
import { SIDE_LABELS } from "./investmentDisplay"

export interface TradeForm {
  side: InvestmentTransactionSide
  quantity: string
  price: string
  feeAmount: string
  executedAt: string
  note: string
}

export function emptyTradeForm(lastPrice: string | null): TradeForm {
  return {
    side: "buy",
    quantity: "",
    price: lastPrice != null ? String(Number(lastPrice)) : "",
    feeAmount: "",
    executedAt: todayKey(),
    note: "",
  }
}

interface Props {
  open: boolean
  form: TradeForm
  position: InvestmentPositionSummary | null
  saving: boolean
  onSave: (form: TradeForm) => void
  onClose: () => void
}

export function TradeModal({ open, form, position, saving, onSave, onClose }: Props) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<TradeForm>({ defaultValues: form })

  useEffect(() => {
    if (open) reset(form)
  }, [form, open, reset])

  const side = watch("side")
  const held = Number(position?.quantity ?? 0)

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <Modal.Container>
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{side === "sell" ? "卖出" : "买入"}</Modal.Heading>
            {position != null && (
              <Dim style={{ fontSize: 11, marginTop: 2 }}>
                {position.symbol}
                {position.name ? ` · ${position.name}` : ""} · 持有 {held} · 平均成本{" "}
                {position.avgCostPrice ?? "—"} {position.currency}
              </Dim>
            )}
          </Modal.Header>

          <Modal.Body>
            <form
              id="trade-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <FormField label="方向" required error={errors.side?.message}>
                <Controller
                  control={control}
                  name="side"
                  rules={{ required: "请选择方向" }}
                  render={({ field }) => (
                    <Select
                      variant="secondary"
                      selectedKey={field.value}
                      onSelectionChange={(key) => field.onChange(key as InvestmentTransactionSide)}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {(["buy", "sell"] as const).map((option) => (
                            <ListBox.Item key={option} id={option} textValue={SIDE_LABELS[option]}>
                              {SIDE_LABELS[option]}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                />
              </FormField>

              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="数量" required error={errors.quantity?.message}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Input
                      variant="secondary"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="例如：100"
                      aria-invalid={Boolean(errors.quantity)}
                      {...register("quantity", {
                        validate: (value) => {
                          const parsed = Number(value)
                          if (value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
                            return "请输入大于 0 的数量"
                          }
                          if (side === "sell" && parsed > held + 1e-9) {
                            return `卖出数量不能超过持有 ${held}`
                          }
                          return true
                        },
                      })}
                    />
                    {side === "sell" && held > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onPress={() => setValue("quantity", String(held))}
                      >
                        全部
                      </Button>
                    )}
                  </div>
                </FormField>
                <FormField label="成交价格" required error={errors.price?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="每股 / 每单位价格"
                    aria-invalid={Boolean(errors.price)}
                    {...register("price", {
                      validate: (value) =>
                        (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的价格",
                    })}
                  />
                </FormField>
                <FormField label="手续费" error={errors.feeAmount?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="可选"
                    aria-invalid={Boolean(errors.feeAmount)}
                    {...register("feeAmount", {
                      validate: (value) =>
                        value.trim() === "" ||
                        (Number.isFinite(Number(value)) && Number(value) >= 0) ||
                        "请输入有效金额",
                    })}
                  />
                </FormField>
              </div>

              <FormField label="成交日期" required error={errors.executedAt?.message}>
                <Controller
                  control={control}
                  name="executedAt"
                  rules={{ validate: (value) => Boolean(value) || "请选择日期" }}
                  render={({ field }) => (
                    <DateInput value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>

              <FormField label="备注">
                <Input variant="secondary" placeholder="可选" {...register("note")} />
              </FormField>
            </form>
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="primary"
              isDisabled={saving}
              onPress={() => void handleSubmit(onSave)()}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button variant="outline" slot="close">
              取消
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
