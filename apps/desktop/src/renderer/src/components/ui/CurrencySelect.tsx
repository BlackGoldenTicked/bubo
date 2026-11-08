/**
 * @purpose Currency picker: a type-to-filter combobox over the common-currency set.
 * @role    Renderer-local form control reused by asset, subscription, loan, and settings forms.
 * @deps    The @bubo/ui Combobox primitive and the @bubo/shared currency registry.
 * @gotcha  Stores the ISO code (uppercase); custom values are disallowed so only listed
 *          currencies can be picked. Filtering matches the option label, which carries
 *          both the code and the localized name.
 */

import { COMMON_CURRENCIES } from "@bubo/shared"
import { Combobox, type SelectOption } from "@bubo/ui"

const OPTIONS: SelectOption[] = COMMON_CURRENCIES.map((item) => ({
  key: item.code,
  label: `${item.code} ${item.name}`,
  content: (
    <span className="inline-flex items-baseline gap-2">
      <span className="min-w-[38px] font-semibold">{item.code}</span>
      <span className="text-[11px] text-[var(--ink-3)]">{item.symbol}</span>
      <span className="text-[var(--ink-2)]">{item.name}</span>
    </span>
  ),
}))

interface CurrencySelectProps {
  value: string
  onChange: (code: string) => void
  ariaLabel?: string
  isDisabled?: boolean
  className?: string
  /** Extra classes for the input itself, e.g. a height override that matches the form. */
  inputClassName?: string
}

export function CurrencySelect({
  value,
  onChange,
  ariaLabel = "币种",
  isDisabled,
  className,
  inputClassName = "",
}: CurrencySelectProps) {
  return (
    <Combobox
      aria-label={ariaLabel}
      className={className}
      isDisabled={isDisabled}
      options={OPTIONS}
      // An empty string means "unset", which the combobox models as null.
      value={value ? value.toUpperCase() : null}
      onChange={onChange}
      placeholder="搜索币种"
      inputClassName={`text-[12px] ${inputClassName}`.trim()}
    />
  )
}
