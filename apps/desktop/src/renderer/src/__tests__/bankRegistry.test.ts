/**
 * @purpose Guard the curated bank registry that the card form's picker and the wallet grouping rely on.
 * @role    Renderer-side unit test for @bubo/shared bank data.
 * @deps    @bubo/shared bank utilities.
 * @gotcha  The bank name is the card's stored value and therefore the wallet's grouping key:
 *          a duplicate or renamed entry silently splits existing cards across two groups.
 */

import { describe, expect, it } from "vitest"
import { BANK_KIND_LABEL, COMMON_BANKS, bankMeta } from "@bubo/shared"

describe("bank registry", () => {
  it("has unique names", () => {
    const names = COMMON_BANKS.map((bank) => bank.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("keeps every name non-empty and free of the legal-entity suffix", () => {
    for (const bank of COMMON_BANKS) {
      expect(bank.name.trim()).toBe(bank.name)
      expect(bank.name.length).toBeGreaterThan(1)
      expect(bank.name).not.toContain("股份有限")
    }
  })

  it("maps every kind onto a display label", () => {
    for (const bank of COMMON_BANKS) {
      expect(BANK_KIND_LABEL[bank.kind]).toBeTruthy()
    }
  })

  it("resolves aliases to exactly one bank so search cannot be ambiguous", () => {
    const owners = new Map<string, string[]>()
    for (const bank of COMMON_BANKS) {
      for (const alias of bank.aliases ?? []) {
        owners.set(alias, [...(owners.get(alias) ?? []), bank.name])
      }
    }
    const ambiguous = [...owners.entries()].filter(([, names]) => names.length > 1)
    expect(ambiguous).toEqual([])
  })

  it("looks banks up by their stored name and rejects free-typed banks", () => {
    expect(bankMeta("招商银行")?.kind).toBe("joint")
    expect(bankMeta(" 工商银行 ")?.name).toBe("工商银行")
    expect(bankMeta("某某村镇银行")).toBeUndefined()
    expect(bankMeta("")).toBeUndefined()
  })
})
