/**
 * @purpose Render one payment card as a single flippable surface.
 * @role    Presentational card face shared by the wallet list and the detail pane.
 * @deps    Shared card contracts, the AppIcon set, and the `.bubo-flipcard` primitive.
 * @gotcha  Front and back are the same element rotated on the Y axis, not two stacked pages:
 *          a scan is an image, so the whole face is `object-fit: cover` and the placeholder
 *          must read like a real card (bank, last four, brand) when no scan exists yet.
 *          The surface carries `bubo-flipcard--gilt`: a 1.5px metal-gradient hairline drawn by
 *          a masked pseudo-element on each face, because a real `border` would shrink the
 *          image box and a `background` ring would fight the per-brand gradient underneath.
 */

import { Button } from "@heroui/react"
import { AppIcon } from "@bubo/ui"
import type { CardBrand, CardSide, CardSummary } from "@bubo/shared/contracts"
import { currencySymbol } from "@bubo/shared"

const BRAND_LABEL: Record<CardBrand, string> = {
  unionpay: "银联",
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "American Express",
  jcb: "JCB",
  other: "银行卡",
}

/** Placeholder gradients: a card without a scan still has to look like a card. */
const BRAND_GRADIENT: Record<CardBrand, string> = {
  unionpay: "linear-gradient(135deg, #1b3a5c 0%, #2f6f8f 58%, #3f8fa6 100%)",
  visa: "linear-gradient(135deg, #17224a 0%, #2b3f7a 60%, #46599c 100%)",
  mastercard: "linear-gradient(135deg, #3a1b28 0%, #6d2a3f 58%, #9a4457 100%)",
  amex: "linear-gradient(135deg, #103a4f 0%, #1f6b7a 60%, #2f97a0 100%)",
  jcb: "linear-gradient(135deg, #22262f 0%, #3b4557 60%, #59657c 100%)",
  other: "linear-gradient(135deg, #24312f 0%, #3d4f4a 62%, #5c6f68 100%)",
}

/** The face colour of a card: its own colour when set, else the brand gradient. */
export function cardFaceBackground(card: CardSummary): string {
  return card.colorHex
    ? `linear-gradient(135deg, color-mix(in srgb, ${card.colorHex} 88%, #000) 0%, ${card.colorHex} 62%, color-mix(in srgb, ${card.colorHex} 74%, #fff) 100%)`
    : BRAND_GRADIENT[card.brand]
}

interface CardVisualProps {
  card: CardSummary
  frontUrl: string | null
  backUrl: string | null
  flipped: boolean
  onFlip: () => void
}

export function CardVisual({ card, frontUrl, backUrl, flipped, onFlip }: CardVisualProps) {
  const background = cardFaceBackground(card)
  const hasBack = backUrl != null

  return (
    <div
      className="bubo-flipcard bubo-flipcard--gilt"
      data-flipped={flipped}
      onClick={hasBack ? onFlip : undefined}
      role={hasBack ? "button" : undefined}
      tabIndex={hasBack ? 0 : undefined}
      aria-label={hasBack ? (flipped ? "查看卡片正面" : "查看卡片反面") : undefined}
      onKeyDown={(event) => {
        if (!hasBack) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onFlip()
        }
      }}
      style={{ cursor: hasBack ? "pointer" : "default" }}
    >
      <div className="bubo-flipcard__inner">
        <div className="bubo-flipcard__face" style={{ background }}>
          {frontUrl ? (
            <img className="bubo-flipcard__image" src={frontUrl} alt={`${card.name} 正面`} />
          ) : (
            <CardFacePlaceholder card={card} side="front" />
          )}
        </div>
        <div className="bubo-flipcard__face bubo-flipcard__face--back" style={{ background }}>
          {backUrl ? (
            <img className="bubo-flipcard__image" src={backUrl} alt={`${card.name} 反面`} />
          ) : (
            <CardFacePlaceholder card={card} side="back" />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The no-scan front face, shared with the wallet stack so both read as the same card.
 * `compact` re-scales it for the half-width pile card, whose top band is the only part the
 * mask keeps in focus: one bank name plus one number line, because four short rows of type
 * blur into smudges that read as dirt rather than as a card.
 */
export function CardFacePlaceholder({
  card,
  side,
  compact = false,
}: {
  card: CardSummary
  side: CardSide
  compact?: boolean
}) {
  if (side === "back") {
    return (
      <div className="flex h-full flex-col justify-between p-[6%] text-white/85">
        <div className="text-[11px] tracking-[.18em] uppercase opacity-70">{card.bank}</div>
        <div className="h-[18%] w-full rounded-[2px] bg-black/45" />
        <div className="flex items-center justify-between text-[10px] opacity-70">
          <span>反面待上传</span>
          <span className="tabular-nums">
            {card.numberLast4 ? `•••• ${card.numberLast4}` : "••••"}
          </span>
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex h-full flex-col p-[7%] text-white">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[9px] font-semibold tracking-[.02em]">{card.bank}</span>
          <span className="shrink-0 text-[7px] font-semibold tracking-[.12em] opacity-85">
            {BRAND_LABEL[card.brand]}
          </span>
        </div>
        <div className="mt-auto pb-[10%] text-[13px] tabular-nums tracking-[.18em] opacity-45">
          •••• {card.numberLast4 ?? "••••"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-between p-[6%] text-white">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-semibold tracking-wide">{card.bank}</div>
          <div className="mt-0.5 text-[10px] opacity-70">{card.name}</div>
        </div>
        <div className="text-[10px] font-semibold tracking-[.12em] opacity-80">
          {BRAND_LABEL[card.brand]}
        </div>
      </div>
      <div className="tabular-nums text-[15px] tracking-[.22em] opacity-90">
        ••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;{card.numberLast4 ?? "••••"}
      </div>
      <div className="flex items-end justify-between text-[10px] opacity-75">
        <span>{card.holderName ?? "持卡人"}</span>
        <span className="tabular-nums">
          {card.expiryMonth && card.expiryYear
            ? `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`
            : "MM/YY"}
        </span>
        <span>{currencySymbol(card.currency)}</span>
      </div>
    </div>
  )
}

interface CardScanControlsProps {
  card: CardSummary
  flipped: boolean
  busySide: CardSide | null
  onFlipTo: (flipped: boolean) => void
  onPick: (side: CardSide) => void
  onRemove: (side: CardSide) => void
}

/** The face switch plus upload/replace/remove actions for the selected card. */
export function CardScanControls({
  card,
  flipped,
  busySide,
  onFlipTo,
  onPick,
  onRemove,
}: CardScanControlsProps) {
  const activeSide: CardSide = flipped ? "back" : "front"
  const activeImage = card.images[activeSide]
  const hasBoth = card.images.front != null && card.images.back != null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="bubo-seg" role="tablist" aria-label="卡片面">
        {(["front", "back"] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={(side === "front") !== flipped}
            onClick={() => onFlipTo(side === "back")}
            className="bubo-seg__item"
          >
            {side === "front" ? "正面" : "反面"}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        isDisabled={busySide != null}
        onPress={() => onPick(activeSide)}
      >
        <AppIcon name={activeImage ? "edit" : "add"} size={12} />
        {activeImage ? "替换图片" : "上传图片"}
      </Button>

      {activeImage && (
        <Button size="sm" variant="ghost" onPress={() => onRemove(activeSide)}>
          <AppIcon name="remove" size={12} />
          移除
        </Button>
      )}

      <span className="text-[10.5px] text-[var(--ink-4)]">
        {hasBoth ? "点击卡面可翻面" : "上传正反两面后点击卡面翻面"}
      </span>
    </div>
  )
}
