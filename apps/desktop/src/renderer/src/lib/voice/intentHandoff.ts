/**
 * @purpose Hand one parsed voice intent from the global capture sheet to the matching page.
 * @role    Renderer-level intent bus; keeps the capture UI decoupled from every feature page.
 * @deps    Shared voice contracts only.
 * @gotcha  Delivery is domain-scoped: an intent is handed to a live listener of its own domain,
 *          otherwise it is queued for the next page that subscribes with that domain. This is what
 *          lets "deliver → navigate → page mounts" work without the old page swallowing the intent.
 */

import type { VoiceIntent, VoiceIntentDomain } from "@bubo/shared/contracts"

type IntentListener = (intent: VoiceIntent) => void

const listeners = new Map<VoiceIntentDomain, Set<IntentListener>>()
let queued: VoiceIntent | null = null

/** Deliver to a live listener, or park the intent until the target page mounts. */
export function deliverVoiceIntent(intent: VoiceIntent): void {
  const set = listeners.get(intent.domain)
  if (set && set.size > 0) {
    // Listeners are few; a listener that unsubscribes itself is fine during Set iteration.
    for (const listener of set) listener(intent)
    return
  }
  queued = intent
}

/** Subscribe a page for one domain; returns an unsubscribe function. */
export function subscribeVoiceIntent(
  domain: VoiceIntentDomain,
  listener: IntentListener,
): () => void {
  const set = listeners.get(domain) ?? new Set<IntentListener>()
  listeners.set(domain, set)
  set.add(listener)

  if (queued && queued.domain === domain) {
    const pending = queued
    queued = null
    listener(pending)
  }

  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(domain)
  }
}

/** Drop a parked intent; used when the user abandons capture before navigating. */
export function clearQueuedVoiceIntent(): void {
  queued = null
}
