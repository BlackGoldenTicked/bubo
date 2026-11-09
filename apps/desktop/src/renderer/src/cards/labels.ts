/**
 * @purpose Name the card enums once so the list and the stack view cannot disagree.
 * @role    Shared Chinese labels for renderer card surfaces.
 * @deps    The shared card contracts only.
 * @gotcha  Keep this the single source: a second copy of these maps drifts silently, since
 *          both copies type-check against the same union.
 */

import type { CardSummary } from "@bubo/shared/contracts"

export const CARD_TYPE_LABEL: Record<CardSummary["cardType"], string> = {
  debit: "借记卡",
  credit: "信用卡",
  prepaid: "预付卡",
  virtual: "虚拟卡",
  other: "其他",
}
