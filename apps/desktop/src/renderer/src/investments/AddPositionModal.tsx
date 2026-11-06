/**
 * @purpose Render the create-investment-position modal, including the opening buy.
 * @role    Renderer feature surface for trade-driven positions.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  Positions start from a buy; currency must match the linked account.
 */

import { Button, Input, ListBox, Modal, Select } from "@heroui/react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import type { BuboId, InstrumentKind } from "@bubo/shared/contracts"
import { todayKey } from "@/lib/dates"
import { FormField } from "../components/ui/FormField"
import { DateInput } from "../components/ui/DateInput"
import { CurrencySelect } from "../components/ui/CurrencySelect"
import { Dim } from "../components/ui/Dim"
import { INSTRUMENT_KIND_OPTIONS, INSTRUMENT_LABELS } from "./investmentDisplay"

export interface PositionForm {
  symbol: string
  name: string
  instrumentKind: InstrumentKind
  /** Empty string means the position is tracked without a linked account. */
  assetItemId: string
  currency: string
  initialQuantity: string
  initialPrice: string
  initialFeeAmount: string
  initialExecutedAt: string
  note: string
}

export interface AccountOption {
  id: BuboId
  name: string
  defaultCurrency: string
}

export function emptyPositionForm(): PositionForm {
  return {
    symbol: "",
    name: "",
    instrumentKind: "stock",
    assetItemId: "",
    currency: "CNY",
    initialQuantity: "",
    initialPrice: "",
    initialFeeAmount: "",
    initialExecutedAt: todayKey(),
    note: "",
  }
}

interface Props {
  open: boolean
  form: PositionForm
  accounts: AccountOption[]
  saving: boolean
  onSave: (form: PositionForm) => void
  onClose: () => void
}

export function AddPositionModal({ open, form, accounts, saving, onSave, onClose }: Props) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<PositionForm>({ defaultValues: form })

  useEffect(() => {
    if (open) reset(form)
  }, [form, open, reset])

  const linkedAccountId = watch("assetItemId")
  const linkedAccount = accounts.find((account) => String(account.id) === linkedAccountId)

  // A linked account fixes the currency by design (the API rejects mismatches),
  // so the selector follows the account and locks while linked.
  useEffect(() => {
    if (linkedAccount) setValue("currency", linkedAccount.defaultCurrency)
  }, [linkedAccount, setValue])

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
            <Modal.Heading>新建持仓</Modal.Heading>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
              从首笔买入开始记录，后续交易按加权平均成本重放
            </p>
          </Modal.Header>

          <Modal.Body>
            <form
              id="position-form"
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
                    placeholder="例如：600519 / AAPL / BTC"
                    aria-invalid={Boolean(errors.symbol)}
                    {...register("symbol", {
                      validate: (value) => value.trim().length > 0 || "请输入标的代码",
                    })}
                  />
                </FormField>
                <FormField label="名称" error={errors.name?.message}>
                  <Input
                    variant="secondary"
                    placeholder="例如：贵州茅台（可选）"
                    {...register("name")}
                  />
                </FormField>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="类型" required error={errors.instrumentKind?.message}>
                  <Controller
                    control={control}
                    name="instrumentKind"
                    rules={{ required: "请选择类型" }}
                    render={({ field }) => (
                      <Select
                        variant="secondary"
                        selectedKey={field.value}
                        onSelectionChange={(key) => field.onChange(key as InstrumentKind)}
                      >
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {INSTRUMENT_KIND_OPTIONS.map((kind) => (
                              <ListBox.Item
                                key={kind}
                                id={kind}
                                textValue={INSTRUMENT_LABELS[kind]}
                              >
                                {INSTRUMENT_LABELS[kind]}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="币种" required error={errors.currency?.message}>
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field }) => (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <CurrencySelect
                          value={field.value}
                          onChange={field.onChange}
                          isDisabled={linkedAccount != null}
                        />
                        {linkedAccount != null && (
                          <Dim style={{ fontSize: 10.5 }}>跟随关联账户币种</Dim>
                        )}
                      </div>
                    )}
                  />
                </FormField>
              </div>

              <FormField label="关联账户" error={errors.assetItemId?.message}>
                <Controller
                  control={control}
                  name="assetItemId"
                  render={({ field }) => (
                    <Select
                      variant="secondary"
                      selectedKey={field.value === "" ? "none" : field.value}
                      onSelectionChange={(key) => field.onChange(key === "none" ? "" : String(key))}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item id="none" textValue="不关联账户">
                            不关联账户
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          {accounts.map((account) => (
                            <ListBox.Item
                              key={account.id}
                              id={String(account.id)}
                              textValue={account.name}
                            >
                              {account.name} · {account.defaultCurrency}
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
                <FormField label="首笔数量" required error={errors.initialQuantity?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="例如：100"
                    aria-invalid={Boolean(errors.initialQuantity)}
                    {...register("initialQuantity", {
                      validate: (value) =>
                        (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的数量",
                    })}
                  />
                </FormField>
                <FormField label="买入价格" required error={errors.initialPrice?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="每股 / 每单位价格"
                    aria-invalid={Boolean(errors.initialPrice)}
                    {...register("initialPrice", {
                      validate: (value) =>
                        (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的价格",
                    })}
                  />
                </FormField>
                <FormField label="手续费" error={errors.initialFeeAmount?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="可选"
                    aria-invalid={Boolean(errors.initialFeeAmount)}
                    {...register("initialFeeAmount", {
                      validate: (value) =>
                        value.trim() === "" ||
                        (Number.isFinite(Number(value)) && Number(value) >= 0) ||
                        "请输入有效金额",
                    })}
                  />
                </FormField>
              </div>

              <FormField label="买入日期" required error={errors.initialExecutedAt?.message}>
                <Controller
                  control={control}
                  name="initialExecutedAt"
                  rules={{ validate: (value) => Boolean(value) || "请选择日期" }}
                  render={({ field }) => (
                    <DateInput value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>

              <FormField label="备注">
                <Input
                  variant="secondary"
                  placeholder="交易平台、策略等（可选）"
                  {...register("note")}
                />
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
