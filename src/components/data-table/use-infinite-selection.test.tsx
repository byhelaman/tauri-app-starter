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
}: {
  filters?: ColumnFiltersState
  total?: number
  ids?: string[]
} = {}) {
  return renderHook((props: { filters: ColumnFiltersState; total: number; ids: string[] }) =>
    useInfiniteSelection({
      enabled: true,
      globalFilter: "",
      columnFilters: props.filters,
      sorting: [],
      totalRowCount: props.total,
      loadedRowIds: props.ids,
    }), {
    initialProps: { filters, total, ids },
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

    rerender({ filters: processingFilter, total: 9, ids: ["b", "c"] })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(2)
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"])
    expect(result.current.rowSelection).toEqual({ b: true, c: true })

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c"] })

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

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c", "d"] })

    expect(result.current.selectedCount).toBe(9)
    expect(result.current.displaySelectedCount).toBe(9)
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"])
    expect(result.current.rowSelection).toEqual({ b: true, c: true })
  })
})
