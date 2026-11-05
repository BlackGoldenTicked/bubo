/**
 * @purpose Subscribe a feature page to voice intents for its own domain.
 * @role    Renderer hook gluing the intent bus to page-level form prefills.
 * @deps    React and the intent handoff store.
 * @gotcha  The handler runs during the subscribing effect, so keep it synchronous and idempotent
 *          (set state / open a modal). Heavy work belongs in the page's own save path.
 */

import { useEffect, useRef } from "react"
import type { VoiceIntent, VoiceIntentDomain } from "@bubo/shared/contracts"
import { subscribeVoiceIntent } from "./intentHandoff"

type IntentOf<D extends VoiceIntentDomain> = Extract<VoiceIntent, { domain: D }>

export function useVoiceIntent<D extends VoiceIntentDomain>(
  domain: D,
  handler: (intent: IntentOf<D>) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(
    () =>
      subscribeVoiceIntent(domain, (intent) => {
        if (intent.domain !== domain) return
        handlerRef.current(intent as IntentOf<D>)
      }),
    [domain],
  )
}
