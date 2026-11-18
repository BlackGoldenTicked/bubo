/**
 * @purpose Paint the "record landed" light once per successful save.
 * @role    Shell-level overlay mounted next to the voice sheet; carries no markup of its own.
 * @deps    Jotai's save-glow nonce and the `bubo-save-glow*` classes in @bubo/ui primitives.
 * @gotcha  The `key` remount is what restarts the CSS animation, and the node unmounts one frame
 *          after the last layer ends: leaving a 220vw blurred sheet mounted would keep a large
 *          composited bitmap alive for the rest of the session. Motion is compositor-only
 *          (opacity/transform); `prefers-reduced-motion` disables all four animations.
 */

import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"
import { saveGlowNonceAtom } from "@/lib/state/uiAtoms"

/** Longest layer is the 1600ms wash; the extra frames avoid clipping the tail. */
const RUN_MS = 1900

export function SaveGlow() {
  const nonce = useAtomValue(saveGlowNonceAtom)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (nonce === 0) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), RUN_MS)
    return () => window.clearTimeout(timer)
  }, [nonce])

  if (!visible) return null
  return (
    <div key={nonce} className="bubo-save-glow" aria-hidden="true">
      <span className="bubo-save-glow__wash" />
      <span className="bubo-save-glow__bloom" />
      <span className="bubo-save-glow__wave" />
      <span className="bubo-save-glow__flare" />
    </div>
  )
}
