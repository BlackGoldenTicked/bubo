/**
 * @purpose Paint the "record landed" light — on the page, or inside the dialog that saved.
 * @role    `SaveGlow` is the shell-level overlay; `DialogSaveGlow` is mounted by a dialog itself.
 * @deps    Jotai's save-glow nonce and the `bubo-save-glow*` classes in @bubo/ui primitives.
 * @gotcha  The `key` remount is what restarts the CSS animation, and the page node unmounts one
 *          frame after the last layer ends: leaving a 220vw blurred sheet mounted would keep a
 *          large composited bitmap alive for the rest of the session. The dialog variant is
 *          mounted only while the dialog celebrates, and inherits the dialog radius so the wave
 *          never spills past the corners.
 */

import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"
import { saveGlowNonceAtom } from "@/lib/state/uiAtoms"
import { GlowWaveCanvas, supportsShaderGlow } from "./GlowWaveCanvas"

/** Longest page layer is the 1600ms wash; the extra frames avoid clipping the tail. */
const RUN_MS = 1900

function GlowLayers() {
  return (
    <>
      <span className="bubo-save-glow__wash" />
      <span className="bubo-save-glow__bloom" />
      <span className="bubo-save-glow__wave" />
      <span className="bubo-save-glow__flare" />
    </>
  )
}

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
      <GlowLayers />
    </div>
  )
}

/**
 * Clipped to its parent dialog: the form celebrates first, then closes. The shader version is
 * the reference look (noise-warped chromatic front); the CSS layers are only the fallback for a
 * webview without WebGL, so the two are never drawn together.
 */
export function DialogSaveGlow({ onStart }: { onStart?: (durationMs: number) => void }) {
  const [useShader, setUseShader] = useState(supportsShaderGlow)
  return (
    <span className="bubo-save-glow bubo-save-glow--dialog" aria-hidden="true">
      {useShader ? (
        <GlowWaveCanvas onStart={onStart} onUnavailable={() => setUseShader(false)} />
      ) : (
        <GlowLayers />
      )}
    </span>
  )
}

export { RUN_MS as SAVE_GLOW_PAGE_MS }
