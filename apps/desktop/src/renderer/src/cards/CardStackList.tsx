/**
 * @purpose Render the wallet as image-first card piles, one pile per bank.
 * @role    Alternate view of the card wallet column; the flat row list stays the default.
 * @deps    useCardScan, the shared card face bits, and the card contracts.
 * @gotcha  The pile is pure geometry, not stored state: the selected card is the only fully
 *          visible one and sits at the bottom, every other card shows a PEEK-pixel strip above
 *          it, scaled slightly narrower. Clicking a strip selects that card, which re-derives
 *          the order so it comes to the front — never keep a second ordering in state.
 *          Each face is drawn twice: a sharp copy masked to the top band and a blurred copy
 *          taking over below it, so a pile reads as crisp card tops fading into colour rather
 *          than a stack of full card faces. Layers are always absolute (never toggling
 *          relative/absolute) — switching position would kill the transition, and the spring
 *          on `top` is what makes a selection ripple through the pile.
 */

import { useState, type CSSProperties } from "react"
import type { CardSummary } from "@bubo/shared/contracts"
import { AppIcon } from "@bubo/ui"
import { CARD_TYPE_LABEL } from "./labels"
import { CardFacePlaceholder, cardFaceBackground } from "./CardVisual"
import { useCardScan } from "./useCardScan"

/** Card width: half of the old full-column pile, which read as too heavy in the rail. */
const CARD_WIDTH = 176
/** Real bank cards are 85.6 × 54 mm. */
const CARD_ASPECT = 86 / 54
const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT)
/**
 * Strip each card behind the front one shows. 24px is the smallest value that still fits a
 * whole 9px bank name inside the strip — anything tighter cuts the text in half and the pile
 * stops reading as cards. Hover opens it to 34px, which is the pile's "breath".
 */
const PEEK_REST = 24
const PEEK_HOVER = 34
/** Each level behind the front card is this much narrower. */
const SCALE_STEP = 0.04
/**
 * Focus band, in percent of the card height: opaque and sharp down to 26%, crossfading into
 * the blurred twin until 46%. Past half the card the face is pure gaussian wash, so a pile
 * reads as crisp card tops over frosted colour instead of a grid of full card faces.
 */
const FOCUS_SHARP = 26
const FOCUS_SOFT = 46
const SHARP_MASK = `linear-gradient(to bottom, #000 0%, #000 ${FOCUS_SHARP}%, transparent ${FOCUS_SOFT}%)`
/** The blurred twin: transparent where the sharp copy still covers the card. */
const SOFT_MASK = `linear-gradient(to bottom, transparent ${FOCUS_SHARP}%, #000 ${FOCUS_SOFT}%)`

interface CardStackListProps {
  /** Bank name → its cards, already ordered by the page. */
  groups: Array<[string, CardSummary[]]>
  selectedId: string | null
  collapsedBanks: Set<string>
  onSelect: (card: CardSummary) => void
  onToggleBank: (bank: string) => void
}

export function CardStackList({
  groups,
  selectedId,
  collapsedBanks,
  onSelect,
  onToggleBank,
}: CardStackListProps) {
  return (
    <div className="px-4 pb-6">
      {groups.map(([bank, bankCards]) => {
        const isCollapsed = collapsedBanks.has(bank)
        const ordered = frontFirst(bankCards, selectedId)
        const front = ordered[0]
        return (
          <section key={bank} className="mt-3 first:mt-1">
            <button
              type="button"
              onClick={() => onToggleBank(bank)}
              aria-expanded={!isCollapsed}
              className="sticky top-0 z-20 flex w-full items-center gap-1.5 rounded-[2px] bg-[var(--surface-1)] px-1 py-1.5 text-left"
            >
              <AppIcon
                name="chevronRight"
                size={11}
                className={`text-[var(--ink-4)] transition-transform duration-150 ${
                  isCollapsed ? "" : "rotate-90"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[.04em] text-[var(--ink-3)]">
                {bank}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-[var(--ink-4)]">
                {bankCards.length} 张
              </span>
            </button>

            {!isCollapsed && front != null && (
              <>
                <CardPile cards={ordered} selectedId={selectedId} onSelect={onSelect} />
                <StackCaption card={front} />
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Selected card first (it owns the bottom, fully visible slot), the rest keep page order. */
function frontFirst(cards: CardSummary[], selectedId: string | null): CardSummary[] {
  const index = cards.findIndex((card) => String(card.id) === selectedId)
  if (index <= 0) return cards
  return [cards[index]!, ...cards.filter((_, i) => i !== index)]
}

/**
 * One bank's pile. Hovering the pile widens the strips a few pixels and lifts the front
 * card: that small inhale is what makes the wallet feel alive instead of stacked paper.
 */
function CardPile({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CardSummary[]
  selectedId: string | null
  onSelect: (card: CardSummary) => void
}) {
  const [hovered, setHovered] = useState(false)
  const peek = hovered ? PEEK_HOVER : PEEK_REST
  const levels = cards.length

  return (
    <div
      className="relative isolate mx-auto mt-2"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT + (levels - 1) * peek,
        transition: "height 460ms var(--ease-spring)",
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {cards.map((card, depth) => (
        <StackedCard
          key={String(card.id)}
          card={card}
          depth={depth}
          levels={levels}
          peek={peek}
          hovered={hovered}
          selected={String(card.id) === selectedId}
          onSelect={() => onSelect(card)}
        />
      ))}
    </div>
  )
}

function StackedCard({
  card,
  depth,
  levels,
  peek,
  hovered,
  selected,
  onSelect,
}: {
  card: CardSummary
  depth: number
  levels: number
  peek: number
  hovered: boolean
  selected: boolean
  onSelect: () => void
}) {
  const front = useCardScan(card, "front")
  const isFront = depth === 0
  const scale = (1 - depth * SCALE_STEP) * (hovered && isFront ? 1.015 : 1)
  const lift = hovered && isFront ? -2 : 0
  const background = cardFaceBackground(card)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-selected={selected}
      aria-label={`${card.bank} ${card.name}${card.numberLast4 ? ` •••• ${card.numberLast4}` : ""}`}
      className="bubo-pile__layer absolute left-0 block text-left"
      style={
        {
          top: (levels - 1 - depth) * peek,
          zIndex: levels - depth,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: `translateY(${lift}px) scale(${scale})`,
          transformOrigin: "top center",
          // Deeper layers arrive later, so a selection ripples down the pile instead of snapping.
          "--pile-delay": `${depth * 45}ms`,
        } as CSSProperties
      }
    >
      <span
        className="relative block h-full w-full overflow-hidden rounded-[8px]"
        style={{
          background,
          boxShadow: isFront
            ? "0 0 0 1px var(--hair-3), 0 10px 22px rgba(16, 24, 20, 0.16)"
            : "0 0 0 1px var(--hair-2), 0 2px 8px rgba(16, 24, 20, 0.10)",
        }}
      >
        {/* Sharp band: the top of the card, which is all a pile needs to be recognisable. */}
        <span
          className="absolute inset-0"
          style={{ WebkitMaskImage: SHARP_MASK, maskImage: SHARP_MASK }}
        >
          <CardFace card={card} imageUrl={front.data} />
        </span>
        {/* Blurred twin: the rest of the card melts into a frosted colour wash. */}
        <span
          className="bubo-pile__soft"
          style={{ WebkitMaskImage: SOFT_MASK, maskImage: SOFT_MASK }}
        >
          <CardFace card={card} imageUrl={front.data} />
        </span>
        {/* Deep cards read as paper stock behind the front one, not as a second front. */}
        {!isFront && <span className="absolute inset-0 bg-black/[0.06]" />}
      </span>
    </button>
  )
}

/** One face's content; rendered twice per card, once sharp and once blurred. */
function CardFace({ card, imageUrl }: { card: CardSummary; imageUrl: string | null }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
  }
  return <CardFacePlaceholder card={card} side="front" compact />
}

/** The two lines the reference wallet puts under the pile: name, then number and type. */
function StackCaption({ card }: { card: CardSummary }) {
  return (
    <div className="mx-auto mt-2 text-center" style={{ width: CARD_WIDTH }}>
      <div className="flex items-center justify-center gap-1.5">
        <span className="min-w-0 truncate text-[12px] text-[var(--ink)]">{card.name}</span>
        {card.status === "archived" && (
          <span className="shrink-0 text-[10px] text-[var(--ink-4)]">已归档</span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[10.5px] text-[var(--ink-4)] tabular-nums">
        {card.numberLast4 ? `•••• ${card.numberLast4}` : "未填卡号"} ·{" "}
        {CARD_TYPE_LABEL[card.cardType]}
      </div>
    </div>
  )
}
