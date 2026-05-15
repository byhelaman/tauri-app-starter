import { describe, expect, it } from "vitest"
import type { Table } from "@tanstack/react-table"
import type { DataTableMeta, InfiniteScrollConfig } from "../core/data-table-types"
import { buildServerDataActionRequest, resolveDataActionState } from "./data-actions"

function createTableStub() {
  return {
    getSelectedRowModel: () => ({ rows: [{ id: "a" }] }),
    getFilteredRowModel: () => ({ rows: [{ id: "a" }, { id: "b" }] }),
    getCoreRowModel: () => ({ rows: [{ id: "a" }, { id: "b" }, { id: "c" }] }),
    getState: () => ({ rowSelection: { a: true } }),
    getVisibleFlatColumns: () => [
      { id: "select" },
      { id: "code" },
      { id: "time" },
      { id: "actions" },
    ],
  } as unknown as Table<unknown>
}

function infiniteScroll(): InfiniteScrollConfig {
  return {
    fetchNextPage: () => undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    totalRowCount: 20,
    unfilteredTotalRowCount: 50,
    currentScope: {
      search: "acme",
      filters: [{ id: "status", value: ["processing"] }],
      date: "2026-05-14",
      sorting: [],
    },
  }
}

describe("data actions", () => {
  it("resolves server-side scope counts and falls selected back to filtered when empty", () => {
    const table = createTableStub()
    const tableMeta: DataTableMeta = {
      isInfiniteScroll: true,
      selectionState: { mode: "ids", ids: [] },
      visibleSelectedCount: 0,
    }

    expect(resolveDataActionState({
      table,
      tableMeta,
      infiniteScroll: infiniteScroll(),
      scope: "selected",
    })).toMatchObject({
      hasSelection: false,
      effectiveScope: "filtered",
      scopeCounts: { selected: 0, filtered: 20, all: 50 },
      selectedScopeCount: 20,
    })
  })

  it("builds a selected request from ordered operations", () => {
    const table = createTableStub()
    const operations = [{
      type: "select" as const,
      scope: { search: "", filters: [], sorting: [] },
      total: 50,
    }]
    const tableMeta: DataTableMeta = {
      isInfiniteScroll: true,
      selectionState: {
        mode: "operations",
        operations,
      },
      selectedCount: 50,
      visibleSelectedIds: ["a"],
    }

    expect(buildServerDataActionRequest({
      table,
      tableMeta,
      infiniteScroll: infiniteScroll(),
      effectiveScope: "selected",
      selectedIds: ["a"],
      purpose: "copy",
      format: "csv",
    })).toMatchObject({
      purpose: "copy",
      format: "csv",
      fields: ["code", "start_time", "end_time"],
      operations,
    })
  })

  it("builds filtered and all requests with the correct scopes", () => {
    const table = createTableStub()
    const tableMeta: DataTableMeta = { isInfiniteScroll: true }
    const scroll = infiniteScroll()

    expect(buildServerDataActionRequest({
      table,
      tableMeta,
      infiniteScroll: scroll,
      effectiveScope: "filtered",
      selectedIds: [],
      purpose: "export",
      format: "tsv",
    })?.scope).toEqual(scroll.currentScope)

    expect(buildServerDataActionRequest({
      table,
      tableMeta,
      infiniteScroll: scroll,
      effectiveScope: "all",
      selectedIds: [],
      purpose: "export",
      format: "tsv",
    })?.scope).toEqual({
      ...scroll.currentScope,
      search: "",
      filters: [],
      date: undefined,
    })
  })
})
