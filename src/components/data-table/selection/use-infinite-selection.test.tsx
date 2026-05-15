import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ColumnFiltersState } from "@tanstack/react-table"
import { useInfiniteSelection } from "./use-infinite-selection"
import type { DataTableSelectionOperation, DataTableSelectionState } from "../core/data-table-types"
import { filterValues, normalizeFilters } from "@/lib/table-filter-normalization"

const rows: Record<string, Record<string, unknown>> = {
  a: { id: "a", status: "pending", channel: "Retail", priority: "High", start_time: "08:10" },
  b: { id: "b", status: "processing", channel: "Retail", priority: "Medium", start_time: "08:20" },
  c: { id: "c", status: "processing", channel: "Online", priority: "Low", start_time: "09:10" },
  d: { id: "d", status: "shipped", channel: "Online", priority: "High", start_time: "10:10" },
  e: { id: "e", status: "shipped", channel: "Retail", priority: "Low", start_time: "10:20" },
  f: { id: "f", status: "cancelled", channel: "Partner", priority: "Medium", start_time: "11:10" },
}

const allIds = Object.keys(rows)

function filters(entries: Record<string, string[]>): ColumnFiltersState {
  return Object.entries(entries).map(([id, value]) => ({ id, value }))
}

function rowMatches(row: Record<string, unknown>, columnFilters: ColumnFiltersState): boolean {
  for (const filter of normalizeFilters(columnFilters)) {
    const values = filterValues(filter)
    if (values.length === 0) continue
    if (filter.id === "time") {
      const hour = String(Number.parseInt(String(row.start_time).split(":")[0] ?? "", 10))
      if (!values.includes(hour)) return false
      continue
    }
    if (!values.includes(String(row[filter.id]))) return false
  }
  return true
}

function operationMatches(id: string, operation: DataTableSelectionOperation): boolean {
  if (operation.type === "selectIds" || operation.type === "deselectIds") return operation.ids.includes(id)
  return rowMatches(rows[id], operation.scope.filters)
}

function selectedIdsForOperations(operations: DataTableSelectionOperation[]): string[] {
  return allIds.filter((id) => {
    let selected = false
    for (const operation of operations) {
      if (operationMatches(id, operation)) selected = operation.type === "select" || operation.type === "selectIds"
    }
    return selected
  })
}

async function countBySelection(selection: DataTableSelectionState, scope?: { filters: ColumnFiltersState }): Promise<number> {
  if (selection.mode === "ids") return selection.ids.length
  return selectedIdsForOperations(selection.operations)
    .filter((id) => !scope || rowMatches(rows[id], scope.filters))
    .length
}

function idsFor(columnFilters: ColumnFiltersState): string[] {
  return allIds.filter((id) => rowMatches(rows[id], columnFilters))
}

function renderSelection(columnFilters: ColumnFiltersState = [], remoteCount = true) {
  type Props = { filters: ColumnFiltersState; ids: string[]; total: number; remoteCount: boolean }
  return renderHook((props: Props) =>
    useInfiniteSelection({
      enabled: true,
      globalFilter: "",
      columnFilters: props.filters,
      sorting: [],
      totalRowCount: props.total,
      unfilteredTotalRowCount: allIds.length,
      loadedRowIds: props.ids,
      loadedRowsById: rows,
      countBySelection: props.remoteCount ? countBySelection : undefined,
    }), {
    initialProps: { filters: columnFilters, ids: idsFor(columnFilters), total: idsFor(columnFilters).length, remoteCount } satisfies Props,
  })
}

function rerenderScope(
  rerender: (props: { filters: ColumnFiltersState; ids: string[]; total: number; remoteCount: boolean }) => void,
  columnFilters: ColumnFiltersState,
  remoteCount = true
) {
  const ids = idsFor(columnFilters)
  rerender({ filters: columnFilters, ids, total: ids.length, remoteCount })
  return ids
}

async function expectState(
  result: ReturnType<typeof renderSelection>["result"],
  visibleIds: string[],
  expectedIds: string[]
) {
  await act(async () => { await vi.runAllTimersAsync() })
  expect(result.current.selectedCount).toBe(expectedIds.length)
  const expectedVisible = visibleIds.filter((id) => expectedIds.includes(id))
  expect(result.current.visibleSelectedIds).toEqual(expectedVisible)
  expect(result.current.rowSelection).toEqual(Object.fromEntries(expectedVisible.map((id) => [id, true])))
  expect(result.current.displaySelectedCount).toBe(expectedVisible.length)
}

describe("useInfiniteSelection operations model", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("uses ordered operations so the last matching scope wins", async () => {
    const time8910 = filters({ time: ["08", "09", "10"] })
    const time89 = filters({ time: ["08", "09"] })
    const time810 = filters({ time: ["08", "10"] })
    const { result, rerender } = renderSelection(time8910)

    await act(async () => { await result.current.selectAll() })
    let visible = rerenderScope(rerender, time89)
    await act(async () => { await result.current.deselectAll() })
    await expectState(result, visible, ["d", "e"])

    visible = rerenderScope(rerender, time810)
    await act(async () => { await result.current.selectAll() })
    await expectState(result, visible, ["a", "b", "d", "e"])

    visible = rerenderScope(rerender, time8910)
    await expectState(result, visible, ["a", "b", "d", "e"])
  })

  it("keeps independent filters coherent across status channel priority and time", async () => {
    const all = filters({})
    const processing = filters({ status: ["processing"] })
    const retail = filters({ channel: ["Retail"] })
    const retailHigh = filters({ channel: ["Retail"], priority: ["High"] })
    const time10 = filters({ time: ["10"] })
    const { result, rerender } = renderSelection(all)

    await act(async () => { await result.current.selectAll() })
    let visible = rerenderScope(rerender, processing)
    await act(async () => { await result.current.deselectAll() })
    await expectState(result, visible, ["a", "d", "e", "f"])

    visible = rerenderScope(rerender, retail)
    await act(async () => { await result.current.selectAll() })
    await expectState(result, visible, ["a", "b", "e", "d", "f"])

    visible = rerenderScope(rerender, retailHigh)
    await act(() => result.current.setRowSelection({}))
    await expectState(result, visible, ["b", "e", "d", "f"])

    visible = rerenderScope(rerender, time10)
    await expectState(result, visible, ["b", "e", "d", "f"])
  })

  it("checks a matrix of interval select-all and deselect-all combinations against the oracle", async () => {
    const subsets = [
      ["8"],
      ["9"],
      ["10"],
      ["8", "9"],
      ["8", "10"],
      ["9", "10"],
      ["8", "9", "10"],
    ]

    for (const removed of subsets) {
      for (const added of subsets) {
        const start = filters({ time: ["8", "9", "10"] })
        const { result, rerender, unmount } = renderSelection(start)
        await act(async () => { await result.current.selectAll() })

        rerenderScope(rerender, filters({ time: removed }))
        await act(async () => { await result.current.deselectAll() })

        rerenderScope(rerender, filters({ time: added }))
        await act(async () => { await result.current.selectAll() })

        const expected = selectedIdsForOperations(
          result.current.selectionState.mode === "operations" ? result.current.selectionState.operations : []
        )
        const visible = rerenderScope(rerender, start)
        await expectState(result, visible, expected)
        unmount()
      }
    }
  })

  it("treats a fixed filter with all options selected as no filter", async () => {
    const all = filters({})
    const processing = filters({ status: ["processing"] })
    const allChannels = filters({ channel: ["Online", "Retail", "Partner", "Phone"] })
    const processingAllChannels = filters({
      status: ["processing"],
      channel: ["Online", "Retail", "Partner", "Phone"],
    })
    const { result, rerender } = renderSelection(all)

    await act(async () => { await result.current.selectAll() })

    let visible = rerenderScope(rerender, processing)
    await act(async () => { await result.current.deselectAll() })
    await expectState(result, visible, ["a", "d", "e", "f"])

    visible = rerenderScope(rerender, processingAllChannels)
    await act(async () => { await result.current.selectAll() })
    await expectState(result, visible, allIds)

    visible = rerenderScope(rerender, allChannels)
    await expectState(result, visible, allIds)
  })

  it("does not drift selected count when the same filtered scope is toggled repeatedly", async () => {
    const all = filters({})
    const processing = filters({ status: ["processing"] })
    const { result, rerender } = renderSelection(all)

    await act(async () => { await result.current.selectAll() })
    const visible = rerenderScope(rerender, processing)

    for (let index = 0; index < 5; index += 1) {
      await act(async () => { await result.current.deselectAll() })
      await expectState(result, visible, ["a", "d", "e", "f"])

      await act(async () => { await result.current.selectAll() })
      await expectState(result, visible, allIds)
    }
  })

  it("accumulates manual rows with later filtered select-all operations", async () => {
    const all = filters({})
    const processing = filters({ status: ["processing"] })
    const { result, rerender } = renderSelection(all)

    await act(() => result.current.setRowSelection({ a: true }))
    await expectState(result, allIds, ["a"])

    const visible = rerenderScope(rerender, processing)
    await act(async () => { await result.current.selectAll() })
    await expectState(result, visible, ["a", "b", "c"])

    rerenderScope(rerender, all)
    await expectState(result, allIds, ["a", "b", "c"])
  })

  it("reselecting an individually excluded row after select-all does not exceed the dataset total", async () => {
    const all = filters({})
    const { result } = renderSelection(all)

    await act(async () => { await result.current.selectAll() })
    await act(() => result.current.setRowSelection({ ...result.current.rowSelection, a: false }))
    await expectState(result, allIds, ["b", "c", "d", "e", "f"])

    await act(() => result.current.setRowSelection({ ...result.current.rowSelection, a: true }))
    await expectState(result, allIds, allIds)
  })

  it("keeps counters coherent when clearing one filter from an overlapping all-options scope", async () => {
    const all = filters({})
    const processing = filters({ status: ["processing"] })
    const processingAllChannels = filters({
      status: ["processing"],
      channel: ["Online", "Retail", "Partner", "Phone"],
    })
    const allChannels = filters({ channel: ["Online", "Retail", "Partner", "Phone"] })
    const { result, rerender } = renderSelection(all)

    await act(async () => { await result.current.selectAll() })
    let visible = rerenderScope(rerender, processing)
    await act(async () => { await result.current.deselectAll() })
    await expectState(result, visible, ["a", "d", "e", "f"])

    visible = rerenderScope(rerender, processingAllChannels)
    await act(async () => { await result.current.selectAll() })
    await expectState(result, visible, allIds)

    visible = rerenderScope(rerender, allChannels)
    await expectState(result, visible, allIds)
    expect(result.current.selectedCount).toBe(allIds.length)
  })

  it("marks the current unloaded scope as fully selected immediately after select-all", async () => {
    const all = filters({})
    const loadedIds = allIds.slice(0, 3)
    const { result } = renderHook(() =>
      useInfiniteSelection({
        enabled: true,
        globalFilter: "",
        columnFilters: all,
        sorting: [],
        totalRowCount: allIds.length,
        loadedRowIds: loadedIds,
        loadedRowsById: rows,
      })
    )

    await act(async () => { await result.current.selectAll() })

    expect(result.current.selectedCount).toBe(allIds.length)
    expect(result.current.currentScopeSelectedCount).toBe(allIds.length)
    expect(result.current.displaySelectedCount).toBe(allIds.length)

    await act(async () => { await result.current.selectAll() })

    expect(result.current.selectedCount).toBe(allIds.length)
    expect(result.current.currentScopeSelectedCount).toBe(allIds.length)
  })

  it("recounts a server-side select-all when the remote total changes", async () => {
    let serverTotal = 100
    const countByRemoteTotal = async () => serverTotal
    const { result, rerender } = renderHook((props: { total: number }) =>
      useInfiniteSelection({
        enabled: true,
        globalFilter: "",
        columnFilters: [],
        sorting: [],
        totalRowCount: props.total,
        loadedRowIds: allIds.slice(0, 3),
        loadedRowsById: rows,
        countBySelection: countByRemoteTotal,
      }), {
      initialProps: { total: serverTotal },
    })

    await act(async () => { await result.current.selectAll() })
    await act(async () => { await Promise.resolve() })
    expect(result.current.selectedCount).toBe(100)
    expect(result.current.displaySelectedCount).toBe(100)

    serverTotal = 1197
    rerender({ total: serverTotal })

    await act(async () => { await Promise.resolve() })
    expect(result.current.selectedCount).toBe(1197)
    expect(result.current.displaySelectedCount).toBe(1197)
  })

  it("does not drift while clearing filters and toggling all before remote counts resolve", async () => {
    const pendingCounts: Array<(count: number) => void> = []
    const delayedCount = () => new Promise<number>((resolve) => {
      pendingCounts.push(resolve)
    })
    const all = filters({})
    const processingRetail8 = filters({ status: ["processing"], channel: ["Retail"], time: ["8"] })
    const processingRetail9 = filters({ status: ["processing"], channel: ["Retail"], time: ["9"] })
    const processingRetail10 = filters({ status: ["processing"], channel: ["Retail"], time: ["10"] })
    const { result, rerender } = renderHook((props: { filters: ColumnFiltersState; ids: string[]; total: number }) =>
      useInfiniteSelection({
        enabled: true,
        globalFilter: "",
        columnFilters: props.filters,
        sorting: [],
        totalRowCount: props.total,
        unfilteredTotalRowCount: 100,
        loadedRowIds: props.ids,
        loadedRowsById: rows,
        countBySelection: delayedCount,
      }), {
      initialProps: { filters: all, ids: ["a", "b", "c"], total: 100 },
    })

    await act(async () => { await result.current.selectAll() })
    expect(result.current.selectedCount).toBe(100)

    rerender({ filters: processingRetail8, ids: ["b"], total: 10 })
    await act(async () => { await result.current.deselectAll() })
    expect(result.current.isSelectionCountPending).toBe(false)
    expect(result.current.selectedCount).toBe(90)

    rerender({ filters: processingRetail9, ids: [], total: 12 })
    await act(async () => { await result.current.deselectAll() })
    expect(result.current.isSelectionCountPending).toBe(false)
    expect(result.current.selectedCount).toBe(78)

    rerender({ filters: processingRetail10, ids: [], total: 14 })
    await act(async () => { await result.current.deselectAll() })
    expect(result.current.isSelectionCountPending).toBe(false)
    expect(result.current.selectedCount).toBe(64)

    rerender({ filters: all, ids: ["a", "b", "c"], total: 100 })

    for (let index = 0; index < 3; index += 1) {
      await act(async () => { await result.current.selectAll() })
      expect(result.current.selectedCount).toBe(100)

      await act(async () => { await result.current.deselectAll() })
      expect(result.current.selectedCount).toBe(0)
    }

    await act(async () => {
      pendingCounts.splice(0).forEach((resolve) => resolve(result.current.selectedCount))
      await Promise.resolve()
    })
  })
})
