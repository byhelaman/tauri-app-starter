import { describe, expect, it } from "vitest"
import { deselectIds, selectIds, selectedIdsInScope } from "./data-table-selection"

describe("data-table selection", () => {
  it("keeps all selected rows selected when a narrower filter is applied and removed", () => {
    const allIds = ["a", "b", "c", "d"]
    const filteredIds = ["b", "d"]

    const selection = selectIds({}, allIds)

    expect(selectedIdsInScope(selection, filteredIds)).toEqual(["b", "d"])
    expect(selectedIdsInScope(selection, allIds)).toEqual(["a", "b", "c", "d"])
  })

  it("selects only the current filtered scope and preserves that subset after filters are removed", () => {
    const allIds = ["a", "b", "c", "d"]
    const filteredIds = ["b", "d"]

    const selection = selectIds({}, filteredIds)

    expect(selectedIdsInScope(selection, filteredIds)).toEqual(["b", "d"])
    expect(selectedIdsInScope(selection, allIds)).toEqual(["b", "d"])
  })

  it("deselects only the current scope", () => {
    const selection = selectIds({}, ["a", "b", "c", "d"])

    expect(deselectIds(selection, ["b", "d"])).toEqual({ a: true, c: true })
  })
})
