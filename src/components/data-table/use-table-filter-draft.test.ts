import { describe, expect, it, vi } from "vitest"
import type { ColumnFiltersState, Table } from "@tanstack/react-table"
import {
  commitFilterDraft,
  filtersEqual,
  getDraftFilterValue,
  resetFilterDraft,
  setDraftFilterValue,
} from "./use-table-filter-draft"

function filters(entries: Record<string, string[]>): ColumnFiltersState {
  return Object.entries(entries).map(([id, value]) => ({ id, value }))
}

function createTableStub(columnIds: string[]) {
  const setGlobalFilter = vi.fn()
  const resetColumnFilters = vi.fn()
  const setFilterValue = vi.fn()
  const table = {
    setGlobalFilter,
    resetColumnFilters,
    getColumn: (id: string) => columnIds.includes(id)
      ? { setFilterValue }
      : undefined,
  } as unknown as Table<unknown>

  return { table, setGlobalFilter, resetColumnFilters, setFilterValue }
}

describe("table filter draft", () => {
  it("compares draft filters by id and ordered values", () => {
    expect(filtersEqual(filters({ status: ["processing"] }), filters({ status: ["processing"] }))).toBe(true)
    expect(filtersEqual(filters({ status: ["processing"] }), filters({ status: ["shipped"] }))).toBe(false)
    expect(filtersEqual(filters({ status: ["processing"], channel: ["Retail"] }), filters({ channel: ["Retail"], status: ["processing"] }))).toBe(false)
  })

  it("sets, replaces and removes draft filter values", () => {
    let draft: ColumnFiltersState = []

    draft = setDraftFilterValue(draft, "status", ["processing"])
    expect(getDraftFilterValue(draft, "status")).toEqual(["processing"])

    draft = setDraftFilterValue(draft, "status", ["shipped"])
    expect(getDraftFilterValue(draft, "status")).toEqual(["shipped"])

    draft = setDraftFilterValue(draft, "status", undefined)
    expect(getDraftFilterValue(draft, "status")).toBeUndefined()
  })

  it("commits added and removed filters to the table", () => {
    const { table, setGlobalFilter, setFilterValue } = createTableStub(["status", "channel"])

    commitFilterDraft({
      table,
      draftSearch: "acme",
      draftFilters: filters({ channel: ["Retail"] }),
      committedFilters: filters({ status: ["processing"] }),
    })

    expect(setGlobalFilter).toHaveBeenCalledWith("acme")
    expect(setFilterValue).toHaveBeenCalledWith(undefined)
    expect(setFilterValue).toHaveBeenCalledWith(["Retail"])
  })

  it("resets committed table filters", () => {
    const { table, setGlobalFilter, resetColumnFilters } = createTableStub(["status"])

    resetFilterDraft(table)

    expect(resetColumnFilters).toHaveBeenCalled()
    expect(setGlobalFilter).toHaveBeenCalledWith(undefined)
  })
})
