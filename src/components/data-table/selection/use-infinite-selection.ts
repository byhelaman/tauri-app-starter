import { useCallback, useMemo, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableSelectionScope, DataTableSelectionState } from "../core/data-table-types"
import {
  applyRowSelectionChange,
  createSelectionScope,
  deselectScope,
  exactGlobalSelectionCount,
  exactScopeSelectionCount,
  fallbackSelectedCount,
  idsToRowSelection,
  rowIsSelectedByOperations,
  selectScope,
} from "./selection-engine"
import { useSelectionCounts } from "./use-selection-counts"

type SelectionAction = "selectAll" | "deselectAll"

interface UseInfiniteSelectionOptions {
  enabled: boolean
  globalFilter: string
  columnFilters: ColumnFiltersState
  sorting: SortingState
  totalRowCount: number
  unfilteredTotalRowCount?: number
  date?: string
  loadedRowIds: string[]
  loadedRowsById?: Record<string, Record<string, unknown>>
  countBySelection?: (selection: DataTableSelectionState, scope?: DataTableSelectionScope) => Promise<number>
}

export function useInfiniteSelection({
  enabled,
  globalFilter,
  columnFilters,
  sorting,
  totalRowCount,
  unfilteredTotalRowCount,
  date,
  loadedRowIds,
  loadedRowsById = {},
  countBySelection,
}: UseInfiniteSelectionOptions) {
  const currentScope = useMemo<DataTableSelectionScope>(() => createSelectionScope({
    search: globalFilter || "",
    filters: columnFilters,
    date,
    sorting,
  }), [columnFilters, date, globalFilter, sorting])

  const [selectionState, setSelectionState] = useState<DataTableSelectionState>({ mode: "ids", ids: [] })
  const [isSelectingAll, setIsSelectingAll] = useState<SelectionAction | false>(false)

  const operations = selectionState.mode === "operations" ? selectionState.operations : []

  const visibleSelectedIds = useMemo(() => {
    if (selectionState.mode === "ids") {
      const selected = new Set(selectionState.ids)
      return loadedRowIds.filter((id) => selected.has(id))
    }
    if (selectionState.mode === "operations") {
      return loadedRowIds.filter((id) => rowIsSelectedByOperations(id, loadedRowsById[id], selectionState.operations))
    }
    return []
  }, [loadedRowIds, loadedRowsById, selectionState])

  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!enabled) {
      return idsToRowSelection(selectionState.mode === "ids" ? selectionState.ids : visibleSelectedIds)
    }
    return idsToRowSelection(visibleSelectedIds)
  }, [enabled, selectionState, visibleSelectedIds])

  const localSelectedCount = useMemo(
    () => fallbackSelectedCount(selectionState, loadedRowIds, loadedRowsById),
    [loadedRowIds, loadedRowsById, selectionState]
  )

  const exactGlobalSelectedCount = selectionState.mode === "operations"
    ? exactGlobalSelectionCount(selectionState.operations, totalRowCount, unfilteredTotalRowCount, loadedRowsById)
    : null
  const exactCurrentScopeSelectedCount = selectionState.mode === "operations"
    ? exactScopeSelectionCount(selectionState.operations, currentScope, totalRowCount, loadedRowsById)
    : null

  const {
    selectedCount,
    isSelectionCountPending,
    currentScopeSelectedCount,
    resetSelectionCounts,
  } = useSelectionCounts({
    enabled,
    selectionState,
    currentScope,
    totalRowCount,
    unfilteredTotalRowCount,
    localSelectedCount,
    visibleSelectedCount: visibleSelectedIds.length,
    exactGlobalSelectedCount,
    exactCurrentScopeSelectedCount,
    countBySelection,
  })
  const displaySelectedCount = currentScopeSelectedCount

  const clearSelection = useCallback(() => {
    resetSelectionCounts()
    setSelectionState({ mode: "ids", ids: [] })
  }, [resetSelectionCounts])

  const selectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("selectAll")
    setSelectionState((previous) => selectScope(previous, currentScope, totalRowCount))
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

  const deselectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("deselectAll")
    setSelectionState((previous) => deselectScope(previous, currentScope, totalRowCount))
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setSelectionState((previous) => applyRowSelectionChange(previous, loadedRowIds, loadedRowsById, updater))
  }, [loadedRowIds, loadedRowsById])

  return {
    rowSelection,
    setRowSelection,
    clearSelection,
    currentScope,
    selectionState,
    selectedCount,
    isSelectionCountPending,
    displaySelectedCount,
    currentScopeSelectedCount,
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
    operations,
  }
}
