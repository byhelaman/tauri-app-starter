import { describe, expect, it } from "vitest"
import { buildOrderFieldDelta } from "./useOrderMutations"

describe("buildOrderFieldDelta", () => {
  it("trims editable text fields before persisting", () => {
    expect(buildOrderFieldDelta("product", " Storage Upgrade   ", true)).toEqual({
      product: "Storage Upgrade",
    })
    expect(buildOrderFieldDelta("code", " ORD-12345 ", true)).toEqual({
      code: "ORD-12345",
    })
  })

  it("parses valid quantities from their trimmed value", () => {
    expect(buildOrderFieldDelta("quantity", " 7 ", true)).toEqual({
      quantity: 7,
    })
  })
})
