/**
 * @purpose Trigger the save-glow overlay from any successful save.
 * @role    Renderer-side one-shot signal between mutations and the `SaveGlow` overlay.
 * @deps    The shared renderer jotai store and the save-glow nonce atom.
 * @gotcha  Saves arrive in bursts (a voice batch fires one mutation per record), so calls inside
 *          a short window are coalesced: one sweep per user action, not one per row. A save almost
 *          always closes its dialog in the same tick, so playback is deferred by default — sweeping
 *          under a still-mounted dialog reads as "the light belongs to the dialog", not the window.
 *          The overlay itself is pure CSS on the compositor; nothing here touches layout.
 */

import { appStore } from "./state/store"
import { saveGlowNonceAtom } from "./state/uiAtoms"

/** Mutations under these domains count as "the user saved a record". */
const SAVE_DOMAINS = new Set([
  "cashflow",
  "subscriptions",
  "loans",
  "assets",
  "investments",
  "contracts",
  "budgets",
  "cards",
  "imports",
])

/** Second path segment verbs that write a record; deletes and archives stay silent. */
const SAVE_VERB = /^(create|update|upsert|add|record|convert)/

const COALESCE_MS = 700
/** Let the save dialog finish closing so the wave covers the page, not the dialog. */
const DEFAULT_DELAY_MS = 260
let lastScheduledAt = 0

function flattenKey(key: unknown): string[] {
  if (!Array.isArray(key)) return []
  return key.flatMap((part) => (Array.isArray(part) ? flattenKey(part) : [String(part)]))
}

/** Whether this tRPC mutation path is a record save worth celebrating. */
export function mutationTriggersSaveGlow(mutationKey: unknown): boolean {
  const path = flattenKey(mutationKey)
  const [domain, verb] = path
  if (!domain || !verb) return false
  return SAVE_DOMAINS.has(domain) && SAVE_VERB.test(verb)
}

export function playSaveGlow(options: { delayMs?: number } = {}): void {
  const now = Date.now()
  if (now - lastScheduledAt < COALESCE_MS) return
  lastScheduledAt = now
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const fire = () => appStore.set(saveGlowNonceAtom, (nonce) => nonce + 1)
  if (delayMs <= 0) {
    fire()
    return
  }
  window.setTimeout(fire, delayMs)
}
