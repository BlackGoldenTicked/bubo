/**
 * @purpose Render the create-contract-position modal for futures/perpetual rows.
 * @role    Renderer feature surface for the contract tab's opening entry.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  A contract row is direction plus margin; it never materializes into an asset
 *          snapshot, so currency is free-standing rather than tied to a linked account.
 */

import {
  Button,
  Calendar,
  DateField,
  DatePicker,
  Input,
  ListBox,
  Modal,
  Select,
} from "@heroui/react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import type { DateValue } from "@internationalized/date"
import { parseDate } from "@internationalized/date"
import type { ContractMarginMode, ContractSide } from "@bubo/shared/contracts"
import { todayKey } from "@/lib/dates"
import { FormField } from "../components/ui/FormField"
import { CurrencySelect } from "../components/ui/CurrencySelect"
import { Dim } from "../components/ui/Dim"
import {
  CONTRACT_SIDE_LABELS,
  CONTRACT_SIDE_OPTIONS,
  MARGIN_MODE_LABELS,
  MARGIN_MODE_OPTIONS,
} from "./contractDisplay"

export interface ContractForm {
  symbol: string
  side: ContractSide
  marginMode: ContractMarginMode
  /** Leverage as a multiple (1–125); the API receives ×10000 bps. */
  leverage: string
  quantity: string
  entryPrice: string
  currency: string
  /** Empty string means "estimate from notional/leverage" in the display math. */
  marginAmount: string
  markPrice: string
  liquidationPrice: string
  openedAt: string
  note: string
}

export function emptyContractForm(): ContractForm {
  return {
    symbol: "",
    side: "long",
    marginMode: "isolated",
    leverage: "1",
    quantity: "",
    entryPrice: "",
    currency: "USD",
    marginAmount: "",
    markPrice: "",
    liquidationPrice: "",
    openedAt: todayKey(),
    note: "",
  }
}

interface Props {
  open: boolean
  form: ContractForm
  saving: boolean
  onSave: (form: ContractForm) => void
  onClose: () => void
}

export function AddContractModal({ open, form, saving, onSave, onClose }: Props) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<ContractForm>({ defaultValues: form })

  useEffect(() => {
    if (open) reset(form)
  }, [form, open, reset])

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
            <Modal.Heading>新建合约仓位</Modal.Heading>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
              记录方向、杠杆与保证金；盈亏按标记价派生，保证金余额请在资产页记录快照
            </p>
          </Modal.Header>

          <Modal.Body>
            <form
              id="contract-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="标的代码" required error={errors.symbol?.message}>
                  <Input
                    variant="secondary"
                    placeholder="例如：BTCUSDT / ETHUSDT"
                    aria-invalid={Boolean(errors.symbol)}
                    {...register("symbol", {
                      validate: (value) => value.trim().length > 0 || "请输入标的代码",
                    })}
                  />
                </FormField>
                <FormField label="币种" required error={errors.currency?.message}>
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field }) => (
                      <CurrencySelect value={field.value} onChange={field.onChange} />
                    )}
                  />
                </FormField>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="方向" required error={errors.side?.message}>
                  <Controller
                    control={control}
                    name="side"
                    rules={{ required: "请选择方向" }}
                    render={({ field }) => (
                      <Select
                        variant="secondary"
                        selectedKey={field.value}
                        onSelectionChange={(key) => field.onChange(key as ContractSide)}
                      >
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {CONTRACT_SIDE_OPTIONS.map((side) => (
                              <ListBox.Item
                                key={side}
                                id={side}
                                textValue={CONTRACT_SIDE_LABELS[side]}
                              >
                                {CONTRACT_SIDE_LABELS[side]}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="保证金模式" required error={errors.marginMode?.message}>
                  <Controller
                    control={control}
                    name="marginMode"
                    rules={{ required: "请选择保证金模式" }}
                    render={({ field }) => (
                      <Select
                        variant="secondary"
                        selectedKey={field.value}
                        onSelectionChange={(key) => field.onChange(key as ContractMarginMode)}
                      >
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {MARGIN_MODE_OPTIONS.map((mode) => (
                              <ListBox.Item
                                key={mode}
                                id={mode}
                                textValue={MARGIN_MODE_LABELS[mode]}
                              >
                                {MARGIN_MODE_LABELS[mode]}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="杠杆（倍）" required error={errors.leverage?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="1"
                    max="125"
                    step="1"
                    placeholder="1–125"
                    aria-invalid={Boolean(errors.leverage)}
                    {...register("leverage", {
                      validate: (value) => {
                        const parsed = Number(value)
                        if (value.trim() === "" || !Number.isFinite(parsed)) return "请输入杠杆倍数"
                        return (parsed >= 1 && parsed <= 125) || "杠杆需在 1–125 倍之间"
                      },
                    })}
                  />
                </FormField>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="数量" required error={errors.quantity?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="例如：0.5"
                    aria-invalid={Boolean(errors.quantity)}
                    {...register("quantity", {
                      validate: (value) =>
                        (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的数量",
                    })}
                  />
                </FormField>
                <FormField label="开仓均价" required error={errors.entryPrice?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="开仓成交均价"
                    aria-invalid={Boolean(errors.entryPrice)}
                    {...register("entryPrice", {
                      validate: (value) =>
                        (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的价格",
                    })}
                  />
                </FormField>
                <FormField label="保证金" error={errors.marginAmount?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="可选，默认按名义价值/杠杆"
                    aria-invalid={Boolean(errors.marginAmount)}
                    {...register("marginAmount", {
                      validate: (value) =>
                        value.trim() === "" ||
                        (Number.isFinite(Number(value)) && Number(value) > 0) ||
                        "请输入大于 0 的保证金",
                    })}
                  />
                </FormField>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="标记价" error={errors.markPrice?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="可选，未填时按开仓价计算"
                    aria-invalid={Boolean(errors.markPrice)}
                    {...register("markPrice", {
                      validate: (value) =>
                        value.trim() === "" ||
                        (Number.isFinite(Number(value)) && Number(value) > 0) ||
                        "请输入大于 0 的价格",
                    })}
                  />
                </FormField>
                <FormField label="强平价" error={errors.liquidationPrice?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="可选"
                    aria-invalid={Boolean(errors.liquidationPrice)}
                    {...register("liquidationPrice", {
                      validate: (value) =>
                        value.trim() === "" ||
                        (Number.isFinite(Number(value)) && Number(value) > 0) ||
                        "请输入大于 0 的价格",
                    })}
                  />
                </FormField>
              </div>

              <FormField label="开仓日期" required error={errors.openedAt?.message}>
                <Controller
                  control={control}
                  name="openedAt"
                  rules={{ validate: (value) => Boolean(value) || "请选择日期" }}
                  render={({ field }) => (
                    <DatePicker
                      value={parseDate(field.value)}
                      onChange={(v: DateValue | null) => {
                        if (v) field.onChange(v.toString())
                      }}
                    >
                      <DateField.Group fullWidth variant="secondary">
                        <DateField.Input>
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                        <DateField.Suffix>
                          <DatePicker.Trigger>
                            <DatePicker.TriggerIndicator />
                          </DatePicker.Trigger>
                        </DateField.Suffix>
                      </DateField.Group>
                      <DatePicker.Popover placement="top" style={{ maxWidth: "none" }}>
                        <Calendar>
                          <Calendar.Header>
                            <Calendar.YearPickerTrigger>
                              <Calendar.YearPickerTriggerHeading />
                              <Calendar.YearPickerTriggerIndicator />
                            </Calendar.YearPickerTrigger>
                            <Calendar.NavButton slot="previous" />
                            <Calendar.NavButton slot="next" />
                          </Calendar.Header>
                          <Calendar.Grid>
                            <Calendar.GridHeader>
                              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                            </Calendar.GridHeader>
                            <Calendar.GridBody>
                              {(date) => <Calendar.Cell date={date} />}
                            </Calendar.GridBody>
                          </Calendar.Grid>
                        </Calendar>
                      </DatePicker.Popover>
                    </DatePicker>
                  )}
                />
              </FormField>

              <FormField label="备注">
                <Input
                  variant="secondary"
                  placeholder="交易所、策略等（可选）"
                  {...register("note")}
                />
              </FormField>

              <Dim style={{ fontSize: 10.5, lineHeight: 1.7 }}>
                合约盈亏只在本页展示；保证金实际占用请在资产页以快照记录，净资产才会体现。
              </Dim>
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
