/**
 * @purpose Bank picker for the card form: search over the curated Chinese bank list.
 * @role    Renderer-local form control; the list itself lives in @bubo/shared.
 * @deps    The @bubo/ui Combobox primitive and the shared bank registry.
 * @gotcha  Free text is allowed on purpose — 村镇银行/信用社 are not in the registry and a
 *          card must still be saveable. The stored value is the plain bank name (the wallet
 *          groups by it), while aliases (农行, 招行) are search-only keywords.
 */

import { BANK_KIND_LABEL, COMMON_BANKS } from "@bubo/shared"
import { Combobox, type SelectOption } from "@bubo/ui"

const OPTIONS: SelectOption[] = COMMON_BANKS.map((bank) => ({
  key: bank.name,
  label: bank.name,
  keywords: bank.aliases,
  content: (
    <span className="inline-flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 truncate">{bank.name}</span>
      <span className="shrink-0 text-[10px] text-[var(--ink-4)]">
        {BANK_KIND_LABEL[bank.kind]}
      </span>
    </span>
  ),
}))

interface BankSelectProps {
  value: string
  onChange: (name: string) => void
  ariaLabel?: string
  isDisabled?: boolean
  invalid?: boolean
  className?: string
  inputClassName?: string
}

export function BankSelect({
  value,
  onChange,
  ariaLabel = "发卡银行",
  isDisabled,
  invalid,
  className,
  inputClassName = "text-[12px] h-9",
}: BankSelectProps) {
  return (
    <Combobox
      aria-label={ariaLabel}
      className={className}
      inputClassName={inputClassName}
      isDisabled={isDisabled}
      invalid={invalid}
      allowCustom
      options={OPTIONS}
      // An empty string means "unset", which the combobox models as null.
      value={value.trim() === "" ? null : value}
      onChange={onChange}
      placeholder="搜索银行，或直接输入"
    />
  )
}
