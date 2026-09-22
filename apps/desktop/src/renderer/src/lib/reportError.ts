/**
 * @purpose Report action failures to the user exactly once per error object.
 * @role    Renderer bridge between mutation failures and toast notifications.
 * @deps    @bubo/ui notify.
 * @gotcha  Dedupe by error identity so a mutation that toasts through the global
 *          MutationCache is not toasted again when the same error propagates
 *          through a caller (ConfirmModal, per-mutation onError handlers).
 */

import { notify } from "@bubo/ui"

const reportedErrors = new WeakSet<object>()

function errorDescription(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/** Toast an action failure unless the same error object was already reported. */
export function reportActionError(error: unknown, title = "操作失败"): void {
  if (typeof error === "object" && error !== null) {
    if (reportedErrors.has(error)) return
    reportedErrors.add(error)
  }
  notify.error(title, { description: errorDescription(error) })
}
