/**
 * @purpose Render the confirm modal renderer UI primitive.
 * @role    Local desktop UI atom shared across feature pages.
 * @deps    React props, HeroUI Modal, CSS tokens, and reportActionError.
 * @gotcha  onConfirm/onCancel rejections are reported through reportActionError;
 *          callers must not toast the same error again.
 */

import { useCallback, useState, type ReactNode } from "react"
import { atom, useAtom, useSetAtom } from "jotai"
import { Button, Modal } from "@heroui/react"
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
    <Modal.Backdrop
      isOpen={opts != null}
      isDismissable={!loading}
      onOpenChange={(v) => {
        if (!v) void handleCancel()
      }}
    >
      <Modal.Container>
        <Modal.Dialog style={{ maxWidth: 380 }}>
          <Modal.Header>
            <Modal.Heading>{opts?.title}</Modal.Heading>
          </Modal.Header>
          {opts?.description != null && (
            <Modal.Body>
              <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
                {opts.description}
              </div>
            </Modal.Body>
          )}
          <Modal.Footer>
            <Button
              variant={opts?.danger ? "danger" : "primary"}
              isDisabled={loading}
              onPress={() => void handleConfirm()}
            >
              {loading ? (opts?.loadingText ?? "处理中…") : (opts?.confirmText ?? "确认")}
            </Button>
            <Button variant="outline" isDisabled={loading} onPress={() => void handleCancel()}>
              {opts?.cancelText ?? "取消"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
