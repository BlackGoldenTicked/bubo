/**
 * @purpose Verify command parser.test behavior in the renderer test suite.
 * @role    Regression test for renderer utilities and shared UI behavior.
 * @deps    Vitest and the module under test.
 * @gotcha  Keep assertions deterministic and independent of live SQLite data.
 */

import { describe, expect, it } from "vitest"
import { parseBuboCommand } from "../lib/commands/parser"

describe("parseBuboCommand", () => {
  it("parses REFRESH command", () => {
    const result = parseBuboCommand("REFRESH")
    expect(result.success).toBe(true)
    expect(result.command).toMatchObject({ kind: "refresh" })
  })

  it("rejects unsupported commands", () => {
    expect(parseBuboCommand("HELLO").success).toBe(false)
    expect(parseBuboCommand("").success).toBe(false)
  })
})
