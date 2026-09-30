/**
 * @purpose Render the confirm modal renderer UI primitive.
 * @role    Local desktop UI atom shared across feature pages.
 * @deps    React props, the @bubo/ui Modal and Button primitives, and reportActionError.
 * @gotcha  onConfirm/onCancel rejections are reported through reportActionError;
 *          callers must not toast the same error again.
 */

import { useCallback, useId, useState, type ReactNode } from "react"
import { atom, useAtom, useSetAtom } from "jotai"
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalHeading } from "@bubo/ui"
import { reportActionError } from "@/lib/reportError"

export interface ConfirmOptions {
  title: string
  /** Middle description shown in the modal body. */
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  loadingText?: string
  /** Render the confirm button in the destructive (red) style. */
  danger?: boolean
  /** Runs on confirm. May be async — the confirm button shows loading while it resolves. */
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
}

const confirmDialogAtom = atom<ConfirmOptions | null>(null)

/** Returns an imperative `confirm(options)` that opens the global confirm modal. */
export function useConfirm(): (options: ConfirmOptions) => void {
  const set = useSetAtom(confirmDialogAtom)
  return useCallback((options: ConfirmOptions) => set(options), [set])
}

/** Mount once near the app root. Reads the global atom and renders the dialog. */
export function GlobalConfirmModal() {
  const [opts, setOpts] = useAtom(confirmDialogAtom)
  const [loading, setLoading] = useState(false)
  const titleId = useId()

  async function handleConfirm() {
    setLoading(true)
    try {
      await opts?.onConfirm?.()
    } catch (error) {
      // The global mutation cache already toasts mutation failures; this keeps
      // non-mutation rejections visible instead of becoming unhandled.
      reportActionError(error)
    } finally {
      setLoading(false)
      setOpts(null)
    }
  }

  async function handleCancel() {
    if (loading) return
    try {
      await opts?.onCancel?.()
    } catch (error) {
      reportActionError(error)
    } finally {
      setOpts(null)
    }
  }

  return (
    <Modal
      open={opts != null}
      onClose={() => void handleCancel()}
      dismissable={!loading}
      labelledBy={titleId}
      className="max-w-[380px]"
    >
      <ModalHeader>
        <ModalHeading id={titleId}>{opts?.title}</ModalHeading>
      </ModalHeader>
      {opts?.description != null && (
        <ModalBody>
          <div className="text-[13px] leading-[1.6] text-[var(--ink-3)]">{opts.description}</div>
        </ModalBody>
      )}
      <ModalFooter>
        <Button
          variant={opts?.danger ? "danger" : "primary"}
          disabled={loading}
          onClick={() => void handleConfirm()}
        >
          {loading ? (opts?.loadingText ?? "处理中…") : (opts?.confirmText ?? "确认")}
        </Button>
        <Button variant="secondary" disabled={loading} onClick={() => void handleCancel()}>
          {opts?.cancelText ?? "取消"}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
