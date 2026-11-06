/**
 * @purpose Continue a confirmed batch after the user saves one prefilled form.
 * @role    Renderer glue between page modals and the voice queue.
 * @deps    Jotai's default store, the capture-sheet atom, and the intent queue.
 * @gotcha  Only a form that came from the sheet should advance the batch: closing a form
 *          the user opened by hand must never pull the next record or reopen the sheet.
 *          When the next record belongs to another domain, reopen the sheet instead of
 *          leaving it behind a badge, so a mixed batch keeps the one-by-one flow.
 */

import { getDefaultStore } from "jotai"
import { voiceCaptureOpenAtom } from "@/lib/state/uiAtoms"
import type { VoiceIntentDomain } from "@bubo/shared/contracts"
import { deliverNextQueuedFor, getVoiceIntentQueueSnapshot } from "./intentHandoff"

export function continueVoiceQueue(domain: VoiceIntentDomain, wasVoicePrefilled: boolean): void {
  if (!wasVoicePrefilled) return
  if (deliverNextQueuedFor(domain)) return
  if (getVoiceIntentQueueSnapshot().length > 0) {
    getDefaultStore().set(voiceCaptureOpenAtom, true)
  }
}
