/**
 * @purpose Append a readable, append-only trace of every voice parse and its renderer handoff.
 * @role    Sidecar diagnostics for "the category did not arrive" style reports.
 * @deps    Node filesystem and the app-data directory shared with the voice settings file.
 * @gotcha  Diagnostics only: nothing here may influence parsing, and the file is capped by
 *          rotating once it grows past `MAX_BYTES` so a long-lived app cannot fill the disk.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

export const VOICE_TRACE_FILE = "bubo-voice-trace.log"
const MAX_BYTES = 1_000_000

function stamp(): string {
  const now = new Date()
  const pad = (value: number, width = 2) => String(value).padStart(width, "0")
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
    `${pad(now.getMilliseconds(), 3)}`
  )
}

export class VoiceTraceLog {
  readonly filePath: string

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, VOICE_TRACE_FILE)
  }

  /** One line per event; `detail` is serialized as JSON so the file stays greppable. */
  append(source: "server" | "renderer", event: string, detail?: unknown): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      this.rotateIfNeeded()
      const payload = detail === undefined ? "" : ` ${JSON.stringify(detail)}`
      appendFileSync(this.filePath, `${stamp()} [${source}] ${event}${payload}\n`, "utf8")
    } catch (error) {
      console.error("[voice] trace write failed", error)
    }
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.filePath)) return
    if (statSync(this.filePath).size < MAX_BYTES) return
    renameSync(this.filePath, `${this.filePath}.1`)
  }
}
