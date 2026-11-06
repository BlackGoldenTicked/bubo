/**
 * @purpose Render the manual price-quote modal for a position.
 * @role    Renderer feature surface for manually maintained market prices.
 * @deps    React Hook Form, HeroUI inputs, and shared renderer UI primitives.
 * @gotcha  Quotes only re-value materialized snapshots; they never rewrite position state.
 */

import { Button, Input, Modal } from "@heroui/react"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import type { InvestmentPositionSummary } from "@bubo/shared/contracts"
import { todayKey } from "@/lib/dates"
import { FormField } from "../components/ui/FormField"
import { DateInput } from "../components/ui/DateInput"
import { Dim } from "../components/ui/Dim"

export interface QuoteForm {
  price: string
  quotedAt: string
}

export function emptyQuoteForm(lastPrice: string | null): QuoteForm {
  return {
    price: lastPrice != null ? String(Number(lastPrice)) : "",
    quotedAt: todayKey(),
  }
}

interface Props {
  open: boolean
  form: QuoteForm
  position: InvestmentPositionSummary | null
  saving: boolean
  onSave: (form: QuoteForm) => void
  onClose: () => void
}

export function QuoteModal({ open, form, position, saving, onSave, onClose }: Props) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    control,
  } = useForm<QuoteForm>({ defaultValues: form })

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
            <Modal.Heading>记录现价</Modal.Heading>
            {position != null && (
              <Dim style={{ fontSize: 11, marginTop: 2 }}>
                {position.symbol}
                {position.name ? ` · ${position.name}` : ""} · {position.currency}
                {position.lastPrice != null
                  ? ` · 上次现价 ${Number(position.lastPrice)}`
                  : " · 尚未记录现价"}
              </Dim>
            )}
          </Modal.Header>

          <Modal.Body>
            <form
              id="quote-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSubmit(onSave)()
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <FormField label="最新价格" required error={errors.price?.message}>
                <Input
                  variant="secondary"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="每单位价格"
                  aria-invalid={Boolean(errors.price)}
                  {...register("price", {
                    validate: (value) =>
                      (value.trim().length > 0 && Number(value) > 0) || "请输入大于 0 的价格",
                  })}
                />
              </FormField>

              <FormField label="报价日期" required error={errors.quotedAt?.message}>
                <Controller
                  control={control}
                  name="quotedAt"
                  rules={{ validate: (value) => Boolean(value) || "请选择日期" }}
                  render={({ field }) => (
                    <DateInput value={field.value} onChange={field.onChange} />
                  )}
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
