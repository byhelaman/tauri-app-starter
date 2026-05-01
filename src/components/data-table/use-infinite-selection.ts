import { useCallback, useMemo, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"

type SelectionAction = "selectAll" | "deselectAll"

interface UseInfiniteSelectionOptions {
  enabled: boolean
  globalFilter: string
  columnFilters: ColumnFiltersState
  sorting: SortingState
  totalRowCount: number
  date?: string
  loadedRowIds: string[]
}

function normalizeFilters(filters: ColumnFiltersState): ColumnFiltersState {
  return filters
    .map((filter) => ({ id: filter.id, value: filter.value }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function scopeKey(scope: DataTableSelectionScope): string {
  return JSON.stringify({
    search: scope.search || "",
    filters: normalizeFilters(scope.filters),
    date: scope.date ?? null,
    sorting: scope.sorting ?? [],
  })
}

function idsToRowSelection(ids: string[]): RowSelectionState {
  return Object.fromEntries(ids.map((id) => [id, true]))
}

function selectedCount(selection: DataTableSelectionState): number {
  if (selection.mode === "ids") return selection.ids.length
  return Math.max(0, selection.total - selection.excludedIds.length)
}

export function useInfiniteSelection({
  enabled,
  globalFilter,
  columnFilters,
  sorting,
  totalRowCount,
  date,
  loadedRowIds,
}: UseInfiniteSelectionOptions) {
  const currentScope = useMemo<DataTableSelectionScope>(() => ({
    search: globalFilter || "",
    filters: columnFilters,
    date,
    sorting,
  }), [columnFilters, date, globalFilter, sorting])

  const currentScopeKey = useMemo(() => scopeKey(currentScope), [currentScope])
  const [selectionState, setSelectionState] = useState<DataTableSelectionState>({ mode: "ids", ids: [] })
  const [isSelectingAll, setIsSelectingAll] = useState<SelectionAction | false>(false)

  const filterScopeIsCurrent = selectionState.mode === "filter" && scopeKey(selectionState.scope) === currentScopeKey

  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!enabled || selectionState.mode === "ids") {
      return idsToRowSelection(selectionState.mode === "ids" ? selectionState.ids : [])
    }

    if (!filterScopeIsCurrent) return {}

    const excluded = new Set(selectionState.excludedIds)
    return Object.fromEntries(loadedRowIds.filter((id) => !excluded.has(id)).map((id) => [id, true]))
  }, [enabled, filterScopeIsCurrent, loadedRowIds, selectionState])

  const clearSelection = useCallback(() => {
    setSelectionState({ mode: "ids", ids: [] })
  }, [])

  const selectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("selectAll")
    setSelectionState({
      mode: "filter",
      scope: currentScope,
      total: totalRowCount,
      excludedIds: [],
    })
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

  const deselectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("deselectAll")
    setSelectionState({ mode: "ids", ids: [] })
    setIsSelectingAll(false)
  }, [enabled])

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setSelectionState((previous) => {
      const previousRows = previous.mode === "filter" && scopeKey(previous.scope) === currentScopeKey
        ? Object.fromEntries(loadedRowIds.filter((id) => !previous.excludedIds.includes(id)).map((id) => [id, true]))
        : previous.mode === "ids"
          ? idsToRowSelection(previous.ids)
          : {}
      const nextRows = typeof updater === "function" ? updater(previousRows) : updater

      if (previous.mode === "filter" && scopeKey(previous.scope) === currentScopeKey) {
        const excluded = new Set(previous.excludedIds)
        for (const id of loadedRowIds) {
          const wasSelected = !!previousRows[id]
          const isSelected = !!nextRows[id]
          if (wasSelected && !isSelected) excluded.add(id)
          if (!wasSelected && isSelected) excluded.delete(id)
        }
        return { ...previous, excludedIds: Array.from(excluded) }
      }

      return {
        mode: "ids",
        ids: Object.keys(nextRows).filter((id) => nextRows[id]),
      }
    })
  }, [currentScopeKey, loadedRowIds])

  const visibleSelectedIds = useMemo(() => {
    if (selectionState.mode === "ids") return selectionState.ids
    if (!filterScopeIsCurrent) return []
    const excluded = new Set(selectionState.excludedIds)
    return loadedRowIds.filter((id) => !excluded.has(id))
  }, [filterScopeIsCurrent, loadedRowIds, selectionState])

  return {
    rowSelection,
    setRowSelection,
    clearSelection,
    currentScope,
    selectionState,
    selectedCount: selectedCount(selectionState),
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
  }
}
