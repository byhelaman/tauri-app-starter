import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ColumnFiltersState } from "@tanstack/react-table"
import { useInfiniteSelection } from "./use-infinite-selection"

const emptyFilters: ColumnFiltersState = []
const processingFilter: ColumnFiltersState = [{ id: "status", value: ["processing"] }]

function renderSelection({
  filters = emptyFilters,
  total = 50,
  ids = ["a", "b", "c"],
  rows,
}: {
  filters?: ColumnFiltersState
  total?: number
  ids?: string[]
  rows?: Record<string, Record<string, unknown>>
} = {}) {
  type Props = { filters: ColumnFiltersState; total: number; ids: string[]; rows?: Record<string, Record<string, unknown>> }
  return renderHook((props: Props) =>
    useInfiniteSelection({
      enabled: true,
      globalFilter: "",
      columnFilters: props.filters,
      sorting: [],
      totalRowCount: props.total,
      loadedRowIds: props.ids,
      loadedRowsById: props.rows,
    }), {
    initialProps: { filters, total, ids, rows } satisfies Props,
  })
}

describe("useInfiniteSelection", () => {
  it("keeps an unfiltered select-all visually selected after filters are applied", async () => {
    const { result, rerender } = renderSelection({ total: 50, ids: ["a", "b", "c"] })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(50)
    expect(result.current.visibleSelectedIds).toEqual(["a", "b", "c"])

    rerender({ filters: processingFilter, total: 9, ids: ["b", "c"], rows: undefined })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(2)
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"])
    expect(result.current.rowSelection).toEqual({ b: true, c: true })

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c"], rows: undefined })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(50)
    expect(result.current.visibleSelectedIds).toEqual(["a", "b", "c"])
  })

  it("keeps a filtered select-all scoped after filters are removed", async () => {
    const { result, rerender } = renderSelection({ filters: processingFilter, total: 9, ids: ["b", "c"] })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(9)
    expect(result.current.displaySelectedCount).toBe(2)
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"])

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c", "d"], rows: undefined })

    expect(result.current.selectedCount).toBe(9)
    expect(result.current.displaySelectedCount).toBe(9)
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"])
    expect(result.current.rowSelection).toEqual({ b: true, c: true })
  })

  it("excludes a filtered scope from an existing unfiltered select-all", async () => {
    const rows = {
      a: { id: "a", status: "pending" },
      b: { id: "b", status: "processing" },
      c: { id: "c", status: "processing" },
    }
    const { result, rerender } = renderSelection({ total: 50, ids: ["a", "b", "c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: processingFilter, total: 9, ids: ["b", "c"], rows })

    await act(async () => {
      await result.current.deselectAll()
    })

    expect(result.current.selectedCount).toBe(41)
    expect(result.current.displaySelectedCount).toBe(0)
    expect(result.current.visibleSelectedIds).toEqual([])
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      total: 50,
      excludedScopes: [{ total: 9 }],
    })

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c"], rows })

    expect(result.current.selectedCount).toBe(41)
    expect(result.current.visibleSelectedIds).toEqual(["a"])
    expect(result.current.rowSelection).toEqual({ a: true })
  })
})
