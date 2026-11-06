/**
 * @purpose Render the close-contract-position modal for normal and liquidated exits.
 * @role    Renderer feature surface for ending an open contract row.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  Closing records an outcome: a normal close stores the fill price, while
 *          liquidation realizes the full posted margin as a loss by definition.
 */

import { Button, Input, ListBox, Modal, Select } from "@heroui/react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import type { ContractPositionSummary } from "@bubo/shared/contracts"
import { todayKey } from "@/lib/dates"
import { FormField } from "../components/ui/FormField"
import { DateInput } from "../components/ui/DateInput"
import { Dim } from "../components/ui/Dim"
import { CONTRACT_SIDE_LABELS, formatLeverage } from "./contractDisplay"

export type CloseOutcome = "closed" | "liquidated"

export interface CloseContractForm {
  outcome: CloseOutcome
  /** Required for a normal close; optional when the final mark of a liquidation is known. */
  exitPrice: string
  closedAt: string
}

export function closeContractForm(): CloseContractForm {
  return { outcome: "closed", exitPrice: "", closedAt: todayKey() }
}

const OUTCOME_LABELS: Record<CloseOutcome, string> = {
  closed: "正常平仓",
  liquidated: "爆仓强平",
}

interface Props {
  open: boolean
  form: CloseContractForm
  position: ContractPositionSummary | null
  saving: boolean
  onSave: (form: CloseContractForm) => void
  onClose: () => void
}

export function CloseContractModal({ open, form, position, saving, onSave, onClose }: Props) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<CloseContractForm>({ defaultValues: form })

  useEffect(() => {
    if (open) reset(form)
  }, [form, open, reset])

  const outcome = watch("outcome")
  const requiresExit = outcome === "closed"

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
            <Modal.Heading>平仓合约</Modal.Heading>
            {position != null && (
              <Dim style={{ fontSize: 11, marginTop: 2 }}>
                {position.symbol} · {CONTRACT_SIDE_LABELS[position.side]}{" "}
                {formatLeverage(position.leverageBps)} · 开仓价 {Number(position.entryPrice)}
              </Dim>
            )}
          </Modal.Header>

          <Modal.Body>
            <form
              id="contract-close-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <FormField label="结果" required error={errors.outcome?.message}>
                <Controller
                  control={control}
                  name="outcome"
                  rules={{ required: "请选择结果" }}
                  render={({ field }) => (
                    <Select
                      variant="secondary"
                      selectedKey={field.value}
                      onSelectionChange={(key) => field.onChange(key as CloseOutcome)}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {(Object.keys(OUTCOME_LABELS) as CloseOutcome[]).map((value) => (
                            <ListBox.Item key={value} id={value} textValue={OUTCOME_LABELS[value]}>
                              {OUTCOME_LABELS[value]}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                />
              </FormField>

              <FormField
                label={requiresExit ? "平仓价" : "最终标记价"}
                required={requiresExit}
                error={errors.exitPrice?.message}
              >
                <Input
                  variant="secondary"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={requiresExit ? "平仓成交价" : "可选"}
                  aria-invalid={Boolean(errors.exitPrice)}
                  {...register("exitPrice", {
                    validate: (value) => {
                      if (value.trim() === "") return requiresExit ? "请输入平仓价" : true
                      return (
                        (Number.isFinite(Number(value)) && Number(value) > 0) ||
                        "请输入大于 0 的价格"
                      )
                    },
                  })}
                />
              </FormField>

              <FormField label="平仓日期" required error={errors.closedAt?.message}>
                <Controller
                  control={control}
                  name="closedAt"
                  rules={{ validate: (value) => Boolean(value) || "请选择日期" }}
                  render={({ field }) => (
                    <DateInput value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>

              {!requiresExit && (
                <Dim style={{ fontSize: 10.5, lineHeight: 1.7 }}>
                  爆仓按损失全部保证金记账；若知道最终标记价可填写，仅用于展示。
                </Dim>
              )}
            </form>
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="primary"
              isDisabled={saving}
              onPress={() => void handleSubmit(onSave)()}
            >
              {saving ? "保存中…" : "确认平仓"}
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
