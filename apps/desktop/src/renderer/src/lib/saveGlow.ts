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

/**
 * Second path segment verbs that write a record; deletes and archives stay silent.
 * `cashflow` is handled per surface instead: the 记一笔 dialog and the batch window play the
 * light inside themselves and close afterwards, so a page-wide sweep would double up.
 */
const SAVE_VERB = /^(create|update|upsert|add|record|convert)/
const DIALOG_OWNED_PATHS = new Set(["cashflow.create", "cashflow.update"])

/**
 * Fallback length when the surface has not been measured yet: the diagonal of the reference
 * dialog (400x600) at the tuned speed. Real playback asks `saveGlowDurationMs` for its own size.
 */
export const SAVE_GLOW_DIALOG_MS = 3000

/** Diagonal of the dialog the pace was tuned on, in CSS pixels. */
const REFERENCE_DIAGONAL = Math.hypot(400, 600)

/**
 * The sweep covers the surface diagonal, so a bigger panel must take longer to keep the same
 * perceived speed. Returns milliseconds, clamped so a tiny dialog still reads as a sweep and a
 * large one never drags.
 */
export function saveGlowDurationMs(size?: { width: number; height: number }): number {
  if (!size) return SAVE_GLOW_DIALOG_MS
  const diagonal = Math.hypot(size.width, size.height)
  if (!Number.isFinite(diagonal) || diagonal <= 0) return SAVE_GLOW_DIALOG_MS
  const scaled = (SAVE_GLOW_DIALOG_MS * diagonal) / REFERENCE_DIAGONAL
  return Math.round(Math.min(3600, Math.max(1600, scaled)))
}

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
  if (DIALOG_OWNED_PATHS.has(`${domain}.${verb}`)) return false
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
