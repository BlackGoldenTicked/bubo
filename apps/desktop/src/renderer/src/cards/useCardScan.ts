/**
 * @purpose Load one card face's scan as a data URL for any surface that renders a card.
 * @role    Renderer hook shared by the wallet list, the card stack view, and the detail pane.
 * @deps    tRPC `cards.image` query and the shared card contracts.
 * @gotcha  The scan's `updatedAt` belongs in the query key: replacing an image must not serve
 *          the cached data URL. `staleTime: Infinity` is only safe because of that key.
 */

import { useQuery } from "@tanstack/react-query"
import type { CardSide, CardSummary } from "@bubo/shared/contracts"
import { trpcClient } from "@/lib/trpc"

export function useCardScan(card: CardSummary, side: CardSide) {
  const meta = card.images[side]
  const query = useQuery({
    // `updatedAt` is part of the key: replacing a scan must not serve the old data URL.
    queryKey: ["cards.image", String(card.id), side, meta?.updatedAt ?? "none"],
    queryFn: () => trpcClient.cards.image.query({ cardId: card.id, side }),
    enabled: meta != null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  return { data: meta ? (query.data?.dataUrl ?? null) : null }
}
