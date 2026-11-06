/**
 * @purpose Keep imported brand names out of the ledger UI.
 * @role    Unit tests for the source label mapping in lib/domainDisplay.ts.
 * @deps    Vitest and the renderer display helpers.
 * @gotcha  The stored source value must stay untouched — filters and writes key on it, so
 *          only the label may change. A blank source still reads 手动.
 */

import { describe, expect, it } from "vitest"
import { sourceLabel } from "../lib/domainDisplay"

describe("sourceLabel", () => {
  it("shows an imported ledger as a neutral source instead of the exporting app's name", () => {
    expect(sourceLabel("钱迹")).toBe("历史导入")
  })

  it("leaves ordinary sources alone", () => {
    expect(sourceLabel("支付宝")).toBe("支付宝")
    expect(sourceLabel("现金")).toBe("现金")
  })

  it("falls back to 手动 when the row carries no source", () => {
    expect(sourceLabel(null)).toBe("手动")
    expect(sourceLabel(undefined)).toBe("手动")
    expect(sourceLabel("   ")).toBe("手动")
  })
})
