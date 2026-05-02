import { useCallback, useEffect, useMemo, useState } from "react"
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

function scopeHasConstraints(scope: DataTableSelectionScope): boolean {
  return Boolean(scope.search?.trim() || scope.date || normalizeFilters(scope.filters).length > 0)
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
  const [materializedSelectedIds, setMaterializedSelectedIds] = useState<string[]>([])
  const [isSelectingAll, setIsSelectingAll] = useState<SelectionAction | false>(false)

  const filterScopeIsCurrent = selectionState.mode === "filter" && scopeKey(selectionState.scope) === currentScopeKey
  const filterScopeCoversCurrentRows = selectionState.mode === "filter" && (
    filterScopeIsCurrent || !scopeHasConstraints(selectionState.scope)
  )
  const currentScopeIsConstrained = scopeHasConstraints(currentScope)

  useEffect(() => {
    if (selectionState.mode !== "filter" || !filterScopeIsCurrent) return
    // Materializes newly loaded IDs so a scoped selection remains visible after the user changes filters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterializedSelectedIds((previous) => {
      const next = new Set(previous)
      let changed = false
      for (const id of loadedRowIds) {
        if (!selectionState.excludedIds.includes(id) && !next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      if (!changed) return previous
      return Array.from(next)
    })
  }, [filterScopeIsCurrent, loadedRowIds, selectionState])

  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!enabled || selectionState.mode === "ids") {
      return idsToRowSelection(selectionState.mode === "ids" ? selectionState.ids : [])
    }

    const excluded = new Set(selectionState.excludedIds)
    if (!filterScopeCoversCurrentRows) {
      return Object.fromEntries(
        loadedRowIds
          .filter((id) => materializedSelectedIds.includes(id) && !excluded.has(id))
          .map((id) => [id, true])
      )
    }

    return Object.fromEntries(loadedRowIds.filter((id) => !excluded.has(id)).map((id) => [id, true]))
  }, [enabled, filterScopeCoversCurrentRows, loadedRowIds, materializedSelectedIds, selectionState])

  const clearSelection = useCallback(() => {
    setMaterializedSelectedIds([])
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
    setMaterializedSelectedIds(loadedRowIds)
    setIsSelectingAll(false)
  }, [currentScope, enabled, loadedRowIds, totalRowCount])

  const deselectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("deselectAll")
    setMaterializedSelectedIds([])
    setSelectionState({ mode: "ids", ids: [] })
    setIsSelectingAll(false)
  }, [enabled])

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setSelectionState((previous) => {
      const previousScopeCoversCurrentRows = previous.mode === "filter" && (
        scopeKey(previous.scope) === currentScopeKey || !scopeHasConstraints(previous.scope)
      )
      const previousRows = previous.mode === "filter" && previousScopeCoversCurrentRows
        ? Object.fromEntries(loadedRowIds.filter((id) => !previous.excludedIds.includes(id)).map((id) => [id, true]))
        : previous.mode === "filter"
          ? Object.fromEntries(loadedRowIds.filter((id) => materializedSelectedIds.includes(id) && !previous.excludedIds.includes(id)).map((id) => [id, true]))
        : previous.mode === "ids"
          ? idsToRowSelection(previous.ids)
          : {}
      const nextRows = typeof updater === "function" ? updater(previousRows) : updater

      if (previous.mode === "filter") {
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
  }, [currentScopeKey, loadedRowIds, materializedSelectedIds])

  const visibleSelectedIds = useMemo(() => {
    if (selectionState.mode === "ids") return selectionState.ids
    const excluded = new Set(selectionState.excludedIds)
    if (!filterScopeCoversCurrentRows) {
      return loadedRowIds.filter((id) => materializedSelectedIds.includes(id) && !excluded.has(id))
    }
    return loadedRowIds.filter((id) => !excluded.has(id))
  }, [filterScopeCoversCurrentRows, loadedRowIds, materializedSelectedIds, selectionState])

  const totalSelectedCount = selectedCount(selectionState)
  const displaySelectedCount = selectionState.mode === "filter" && currentScopeIsConstrained
    ? visibleSelectedIds.length
    : totalSelectedCount

  return {
    rowSelection,
    setRowSelection,
    clearSelection,
    currentScope,
    selectionState,
    selectedCount: totalSelectedCount,
    displaySelectedCount,
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
  }
}
