/**
 * @purpose Render the update-contract-position modal for marks, margin, and notes.
 * @role    Renderer feature surface for keeping an open contract row current.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  Only trackable fields update here; direction, quantity, and leverage are
 *          part of the opening record and changing them is a new position.
 */

import { Button, Input, Modal } from "@heroui/react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import type { ContractPositionSummary } from "@bubo/shared/contracts"
import { FormField } from "../components/ui/FormField"
import { Dim } from "../components/ui/Dim"
import { CONTRACT_SIDE_LABELS, formatLeverage } from "./contractDisplay"

export interface ContractUpdateForm {
  markPrice: string
  liquidationPrice: string
  marginAmount: string
  note: string
}

export function contractUpdateForm(position: ContractPositionSummary): ContractUpdateForm {
  return {
    markPrice: position.markPrice != null ? String(Number(position.markPrice)) : "",
    liquidationPrice:
      position.liquidationPrice != null ? String(Number(position.liquidationPrice)) : "",
    marginAmount: position.marginAmount != null ? String(Number(position.marginAmount)) : "",
    note: position.note ?? "",
  }
}

interface Props {
  open: boolean
  form: ContractUpdateForm
  position: ContractPositionSummary | null
  saving: boolean
  onSave: (form: ContractUpdateForm) => void
  onClose: () => void
}

export function EditContractModal({ open, form, position, saving, onSave, onClose }: Props) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<ContractUpdateForm>({ defaultValues: form })

  useEffect(() => {
    if (open) reset(form)
  }, [form, open, reset])

  const optionalPrice = {
    validate: (value: string) =>
      value.trim() === "" ||
      (Number.isFinite(Number(value)) && Number(value) > 0) ||
      "请输入大于 0 的价格",
  }

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
            <Modal.Heading>更新合约</Modal.Heading>
            {position != null && (
              <Dim style={{ fontSize: 11, marginTop: 2 }}>
                {position.symbol} · {CONTRACT_SIDE_LABELS[position.side]}{" "}
                {formatLeverage(position.leverageBps)} · 开仓价 {Number(position.entryPrice)}
              </Dim>
            )}
          </Modal.Header>

          <Modal.Body>
            <form
              id="contract-update-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <FormField label="标记价" error={errors.markPrice?.message}>
                  <Input
                    variant="secondary"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="最新标记价"
                    aria-invalid={Boolean(errors.markPrice)}
                    {...register("markPrice", optionalPrice)}
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
                    {...register("liquidationPrice", optionalPrice)}
                  />
                </FormField>
              </div>

              <FormField label="保证金" error={errors.marginAmount?.message}>
                <Input
                  variant="secondary"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="留空时按名义价值/杠杆估算"
                  aria-invalid={Boolean(errors.marginAmount)}
                  {...register("marginAmount", {
                    validate: (value) =>
                      value.trim() === "" ||
                      (Number.isFinite(Number(value)) && Number(value) > 0) ||
                      "请输入大于 0 的保证金",
                  })}
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
