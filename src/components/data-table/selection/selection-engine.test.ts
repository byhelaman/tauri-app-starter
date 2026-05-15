import { describe, expect, it } from "vitest"
import type { ColumnFiltersState } from "@tanstack/react-table"
import type { DataTableSelectionOperation, DataTableSelectionState } from "../core/data-table-types"
import {
  applyRowSelectionChange,
  createSelectionScope,
  deselectScope,
  exactScopeSelectionCount,
  rowIsSelectedByOperations,
  selectScope,
} from "./selection-engine"

const rows: Record<string, Record<string, unknown>> = {
  a: { id: "a", status: "pending", channel: "Retail", start_time: "08:10" },
  b: { id: "b", status: "processing", channel: "Retail", start_time: "08:20" },
  c: { id: "c", status: "processing", channel: "Online", start_time: "09:10" },
  d: { id: "d", status: "shipped", channel: "Online", start_time: "10:10" },
}

const ids = Object.keys(rows)

function filters(entries: Record<string, string[]>): ColumnFiltersState {
  return Object.entries(entries).map(([id, value]) => ({ id, value }))
}

function scope(columnFilters: ColumnFiltersState = []) {
  return createSelectionScope({
    search: "",
    filters: columnFilters,
    sorting: [],
  })
}

function selectedIds(selection: DataTableSelectionState): string[] {
  if (selection.mode === "ids") return selection.ids
  return ids.filter((id) => rowIsSelectedByOperations(id, rows[id], selection.operations))
}

describe("selection engine", () => {
  it("uses ordered scope operations where the last matching operation wins", () => {
    let selection: DataTableSelectionState = { mode: "ids", ids: [] }

    selection = selectScope(selection, scope(), ids.length)
    selection = deselectScope(selection, scope(filters({ status: ["processing"] })), 2)
    selection = selectScope(selection, scope(filters({ channel: ["Online"] })), 2)

    expect(selectedIds(selection)).toEqual(["a", "c", "d"])
  })

  it("keeps manual row toggles as operations after a scope selection", () => {
    let selection: DataTableSelectionState = selectScope({ mode: "ids", ids: [] }, scope(), ids.length)

    selection = applyRowSelectionChange(selection, ids, rows, { a: false, b: true, c: true, d: true })
    expect(selectedIds(selection)).toEqual(["b", "c", "d"])

    selection = applyRowSelectionChange(selection, ids, rows, { a: true, b: true, c: true, d: true })
    expect(selectedIds(selection)).toEqual(ids)
  })

  it("normalizes all-values filters before comparing scopes", () => {
    let selection: DataTableSelectionState = { mode: "ids", ids: [] }
    const allChannels = scope(filters({ channel: ["Online", "Retail", "Partner", "Phone"] }))

    selection = selectScope(selection, allChannels, ids.length)

    expect(exactScopeSelectionCount(
      (selection as { mode: "operations"; operations: DataTableSelectionOperation[] }).operations,
      scope(),
      ids.length,
      rows,
    )).toBe(ids.length)
  })
})
