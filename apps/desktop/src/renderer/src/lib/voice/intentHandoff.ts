/**
 * @purpose Hand parsed voice intents from the global capture sheet to the matching page.
 * @role    Renderer-level intent bus plus the batch confirmation queue.
 * @deps    Shared voice contracts only.
 * @gotcha  Delivery is domain-scoped and order-preserving: an intent goes to a live listener of
 *          its own domain, otherwise it waits in the queue until that page subscribes. A batch is
 *          confirmed one item at a time, so every queue mutation is immutable — the UI reads it
 *          through `useSyncExternalStore`, and mutating in place would leave the badge stale.
 */

import type { VoiceIntent, VoiceIntentDomain } from "@bubo/shared/contracts"

type IntentListener = (intent: VoiceIntent) => void

const listeners = new Map<VoiceIntentDomain, Set<IntentListener>>()
const queueListeners = new Set<() => void>()
let pending: VoiceIntent[] = []

function emitQueue(): void {
  for (const listener of queueListeners) listener()
}

function deliverToPage(intent: VoiceIntent): boolean {
  const set = listeners.get(intent.domain)
  if (!set || set.size === 0) return false
  for (const listener of set) listener(intent)
  return true
}

/** Deliver to a live listener, or park the intent until the target page mounts. */
export function deliverVoiceIntent(intent: VoiceIntent): void {
  if (deliverToPage(intent)) return
  pending = [...pending, intent]
  emitQueue()
}

/** Append a parsed batch; the sheet then confirms its head one item at a time. */
export function queueVoiceIntents(intents: readonly VoiceIntent[]): void {
  if (intents.length === 0) return
  pending = [...pending, ...intents]
  emitQueue()
}

export function peekQueuedIntents(): VoiceIntent[] {
  return pending
}

/** Remove one intent because the user skipped it. */
export function dropQueuedVoiceIntent(intent: VoiceIntent): void {
  const next = pending.filter((item) => item !== intent)
  if (next.length === pending.length) return
  pending = next
  emitQueue()
}

/**
 * Confirm one queued intent. When its page is already mounted the intent goes straight to that
 * page; otherwise it returns to the head of the queue so the page's subscription picks it up
 * immediately after navigation.
 */
export function confirmQueuedIntent(intent: VoiceIntent): void {
  pending = pending.filter((item) => item !== intent)
  emitQueue()
  if (deliverToPage(intent)) return
  pending = [intent, ...pending]
  emitQueue()
}

/** Pop the first queued intent for a domain; used when a page mounts or finishes saving. */
export function takeQueuedIntent(domain: VoiceIntentDomain): VoiceIntent | null {
  const index = pending.findIndex((item) => item.domain === domain)
  if (index < 0) return null
  const intent = pending[index] ?? null
  pending = pending.filter((_, position) => position !== index)
  emitQueue()
  return intent
}

/**
 * After a save, feed the next intent of the same domain into the page that just closed.
 * Returns whether one was delivered, so the caller can resume the sheet for other domains.
 */
export function deliverNextQueuedFor(domain: VoiceIntentDomain): boolean {
  const next = takeQueuedIntent(domain)
  if (!next) return false
  deliverVoiceIntent(next)
  return true
}

/** Subscribe a page for one domain; returns an unsubscribe function. */
export function subscribeVoiceIntent(
  domain: VoiceIntentDomain,
  listener: IntentListener,
): () => void {
  const set = listeners.get(domain) ?? new Set<IntentListener>()
  listeners.set(domain, set)
  set.add(listener)

  const queued = takeQueuedIntent(domain)
  if (queued) listener(queued)

  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(domain)
  }
}

/** Queue subscription for UI (badge and resume view). */
export function subscribeVoiceIntentQueue(listener: () => void): () => void {
  queueListeners.add(listener)
  return () => {
    queueListeners.delete(listener)
  }
}

export function getVoiceIntentQueueSnapshot(): VoiceIntent[] {
  return pending
}

/** Drop the whole parked batch (used when the user abandons capture). */
export function clearQueuedVoiceIntent(): void {
  if (pending.length === 0) return
  pending = []
  emitQueue()
}
