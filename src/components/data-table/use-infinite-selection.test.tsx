import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ColumnFiltersState } from "@tanstack/react-table"
import { useInfiniteSelection } from "./use-infinite-selection"

const emptyFilters: ColumnFiltersState = []
const processingFilter: ColumnFiltersState = [{ id: "status", value: ["processing"] }]
const onlineFilter: ColumnFiltersState = [{ id: "channel", value: ["Online"] }]
const processingOnlineFilter: ColumnFiltersState = [
  { id: "status", value: ["processing"] },
  { id: "channel", value: ["Online"] },
]
const processingOnlineHourFilter: ColumnFiltersState = [
  { id: "status", value: ["processing"] },
  { id: "channel", value: ["Online"] },
  { id: "time", value: ["10"] },
]

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
    expect(result.current.displaySelectedCount).toBe(9)
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
    expect(result.current.displaySelectedCount).toBe(9)
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

  it("re-includes an excluded filtered scope without losing the original selection", async () => {
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

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(9)
    expect(result.current.rowSelection).toEqual({ b: true, c: true })
  })

  it("accumulates select-all across different filtered scopes", async () => {
    const rows = {
      b: { id: "b", status: "processing" },
      c: { id: "c", status: "processing" },
      d: { id: "d", channel: "Online" },
    }
    const { result, rerender } = renderSelection({ filters: processingFilter, total: 9, ids: ["b", "c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: onlineFilter, total: 7, ids: ["d"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(16)
    expect(result.current.displaySelectedCount).toBe(7)
    expect(result.current.rowSelection).toEqual({ d: true })
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      total: 9,
      includedScopes: [{ total: 7 }],
    })
  })

  it("normalizes a broader select-all instead of double counting a previous filtered scope", async () => {
    const { result, rerender } = renderSelection({ filters: processingFilter, total: 9, ids: ["b", "c"] })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(9)

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c", "d"], rows: undefined })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.displaySelectedCount).toBe(50)
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      total: 50,
      includedScopes: [],
      excludedIds: [],
      excludedScopes: [],
    })
  })

  it("does not double count a row re-selected after being excluded from select-all", async () => {
    const { result } = renderSelection({ total: 50, ids: ["a", "b", "c"] })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(50)

    act(() => {
      result.current.setRowSelection({ a: true, c: true })
    })

    expect(result.current.selectedCount).toBe(49)
    expect(result.current.rowSelection).toEqual({ a: true, c: true })

    act(() => {
      result.current.setRowSelection({ a: true, b: true, c: true })
    })

    expect(result.current.selectedCount).toBe(50)
    expect(result.current.rowSelection).toEqual({ a: true, b: true, c: true })
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      includedIds: [],
      excludedIds: [],
    })
  })

  it("keeps manual selections when select-all is later applied to a filtered scope", async () => {
    const { result, rerender } = renderSelection({ total: 50, ids: ["a"] })

    act(() => {
      result.current.setRowSelection({ a: true })
    })

    expect(result.current.selectedCount).toBe(1)

    rerender({ filters: processingFilter, total: 9, ids: ["b", "c"], rows: undefined })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(10)
    expect(result.current.displaySelectedCount).toBe(9)
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      total: 9,
      includedIds: ["a"],
    })
  })

  it("allows individual selection outside a previously selected filtered scope", async () => {
    const rows = {
      a: { id: "a", status: "pending" },
      b: { id: "b", status: "processing" },
      c: { id: "c", status: "processing" },
    }
    const { result, rerender } = renderSelection({ filters: processingFilter, total: 9, ids: ["b", "c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c"], rows })

    act(() => {
      result.current.setRowSelection({ a: true, b: true, c: true })
    })

    expect(result.current.selectedCount).toBe(10)
    expect(result.current.rowSelection).toEqual({ a: true, b: true, c: true })

    act(() => {
      result.current.setRowSelection({ b: true, c: true })
    })

    expect(result.current.selectedCount).toBe(9)
    expect(result.current.rowSelection).toEqual({ b: true, c: true })
  })

  it("allows re-selecting individual rows from a deselected filtered scope after filters are removed", async () => {
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

    rerender({ filters: emptyFilters, total: 50, ids: ["a", "b", "c"], rows })

    expect(result.current.selectedCount).toBe(41)
    expect(result.current.rowSelection).toEqual({ a: true })

    act(() => {
      result.current.setRowSelection({ a: true, b: true })
    })

    expect(result.current.selectedCount).toBe(42)
    expect(result.current.rowSelection).toEqual({ a: true, b: true })

    act(() => {
      result.current.setRowSelection({ a: true })
    })

    expect(result.current.selectedCount).toBe(41)
    expect(result.current.rowSelection).toEqual({ a: true })
  })

  it("allows select-all on a narrower scope inside a previously deselected filtered scope", async () => {
    const rows = {
      a: { id: "a", status: "pending", channel: "Retail" },
      b: { id: "b", status: "processing", channel: "Retail" },
      c: { id: "c", status: "processing", channel: "Online" },
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

    rerender({ filters: processingOnlineFilter, total: 4, ids: ["c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(45)
    expect(result.current.displaySelectedCount).toBe(4)
    expect(result.current.rowSelection).toEqual({ c: true })
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      total: 50,
      includedScopes: [{ total: 4 }],
      excludedScopes: [{ total: 9 }],
    })
  })

  it("clears visible row checks when deselect-all is applied to a scope that was explicitly included", async () => {
    const rows = {
      a: { id: "a", status: "pending", channel: "Retail" },
      b: { id: "b", status: "shipped", channel: "Retail" },
      c: { id: "c", status: "shipped", channel: "Online" },
    }
    const shippedFilter: ColumnFiltersState = [{ id: "status", value: ["shipped"] }]
    const shippedOnlineFilter: ColumnFiltersState = [
      { id: "status", value: ["shipped"] },
      { id: "channel", value: ["Online"] },
    ]
    const { result, rerender } = renderSelection({ total: 50, ids: ["a", "b", "c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: shippedFilter, total: 9, ids: ["b", "c"], rows })

    await act(async () => {
      await result.current.deselectAll()
    })

    rerender({ filters: shippedOnlineFilter, total: 4, ids: ["c"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(45)
    expect(result.current.rowSelection).toEqual({ c: true })

    await act(async () => {
      await result.current.deselectAll()
    })

    expect(result.current.selectedCount).toBe(41)
    expect(result.current.displaySelectedCount).toBe(0)
    expect(result.current.rowSelection).toEqual({})
    expect(result.current.visibleSelectedIds).toEqual([])
  })

  it("allows deselecting an individual row inside a re-included filtered scope", async () => {
    const rows = {
      a: { id: "a", status: "pending", channel: "Retail" },
      b: { id: "b", status: "shipped", channel: "Retail" },
      c: { id: "c", status: "shipped", channel: "Online" },
      d: { id: "d", status: "shipped", channel: "Online" },
    }
    const shippedFilter: ColumnFiltersState = [{ id: "status", value: ["shipped"] }]
    const shippedOnlineFilter: ColumnFiltersState = [
      { id: "status", value: ["shipped"] },
      { id: "channel", value: ["Online"] },
    ]
    const { result, rerender } = renderSelection({ total: 50, ids: ["a", "b", "c", "d"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: shippedFilter, total: 9, ids: ["b", "c", "d"], rows })

    await act(async () => {
      await result.current.deselectAll()
    })

    rerender({ filters: shippedOnlineFilter, total: 4, ids: ["c", "d"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(45)
    expect(result.current.rowSelection).toEqual({ c: true, d: true })

    act(() => {
      result.current.setRowSelection({ d: true })
    })

    expect(result.current.selectedCount).toBe(44)
    expect(result.current.displaySelectedCount).toBe(3)
    expect(result.current.rowSelection).toEqual({ d: true })
    expect(result.current.selectionState).toMatchObject({
      mode: "filter",
      excludedIds: ["c"],
    })
  })

  it("allows deselect-all on a narrower interval scope after excluding status and re-including channel", async () => {
    const rows = {
      a: { id: "a", status: "pending", channel: "Retail", start_time: "09:00" },
      b: { id: "b", status: "processing", channel: "Retail", start_time: "10:00" },
      c: { id: "c", status: "processing", channel: "Online", start_time: "10:30" },
      d: { id: "d", status: "processing", channel: "Online", start_time: "11:00" },
    }
    const { result, rerender } = renderSelection({ total: 50, ids: ["a", "b", "c", "d"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    rerender({ filters: processingFilter, total: 9, ids: ["b", "c", "d"], rows })

    await act(async () => {
      await result.current.deselectAll()
    })

    rerender({ filters: processingOnlineFilter, total: 4, ids: ["c", "d"], rows })

    await act(async () => {
      await result.current.selectAll()
    })

    expect(result.current.selectedCount).toBe(45)
    expect(result.current.rowSelection).toEqual({ c: true, d: true })

    rerender({ filters: processingOnlineHourFilter, total: 1, ids: ["c"], rows })

    expect(result.current.displaySelectedCount).toBe(1)
    expect(result.current.rowSelection).toEqual({ c: true })

    await act(async () => {
      await result.current.deselectAll()
    })

    expect(result.current.selectedCount).toBe(44)
    expect(result.current.displaySelectedCount).toBe(0)
    expect(result.current.rowSelection).toEqual({})
    expect(result.current.visibleSelectedIds).toEqual([])
  })
})
