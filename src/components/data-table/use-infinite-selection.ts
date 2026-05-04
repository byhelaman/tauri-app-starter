import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableExcludedSelectionScope, DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"

type SelectionAction = "selectAll" | "deselectAll"

interface UseInfiniteSelectionOptions {
  enabled: boolean
  globalFilter: string
  columnFilters: ColumnFiltersState
  sorting: SortingState
  totalRowCount: number
  date?: string
  loadedRowIds: string[]
  loadedRowsById?: Record<string, Record<string, unknown>>
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
  const excludedScopeTotal = (selection.excludedScopes ?? []).reduce((sum, excluded) => sum + excluded.total, 0)
  return Math.max(0, selection.total - excludedScopeTotal - selection.excludedIds.length)
}

function uniqueScopes(scopes: DataTableExcludedSelectionScope[]): DataTableExcludedSelectionScope[] {
  const seen = new Set<string>()
  const result: DataTableExcludedSelectionScope[] = []
  for (const excluded of scopes) {
    const key = scopeKey(excluded.scope)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(excluded)
  }
  return result
}

function scopeIsExcluded(scope: DataTableSelectionScope, excludedScopes: DataTableExcludedSelectionScope[] = []): boolean {
  const key = scopeKey(scope)
  return excludedScopes.some((excluded) => scopeKey(excluded.scope) === key)
}

function rowMatchesScope(row: Record<string, unknown> | undefined, scope: DataTableSelectionScope): boolean {
  if (!row) return false

  const search = scope.search?.trim().toLowerCase()
  if (search) {
    const haystack = Object.values(row)
      .filter((value) => value != null && typeof value !== "object")
      .map(String)
      .join(" ")
      .toLowerCase()
    if (!haystack.includes(search)) return false
  }

  if (scope.date && String(row.date ?? "") !== scope.date) return false

  for (const filter of normalizeFilters(scope.filters)) {
    const values = Array.isArray(filter.value) ? filter.value.map(String) : []
    if (values.length === 0) continue

    if (filter.id === "time") {
      const startTime = String(row.start_time ?? "")
      const hour = startTime.split(":")[0]
      if (!values.includes(hour)) return false
      continue
    }

    if (!values.includes(String(row[filter.id] ?? ""))) return false
  }

  return true
}

function rowMatchesExcludedScopes(row: Record<string, unknown> | undefined, excludedScopes: DataTableExcludedSelectionScope[] = []): boolean {
  return excludedScopes.some((excluded) => rowMatchesScope(row, excluded.scope))
}

export function useInfiniteSelection({
  enabled,
  globalFilter,
  columnFilters,
  sorting,
  totalRowCount,
  date,
  loadedRowIds,
  loadedRowsById = {},
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
  const currentScopeIsExcluded = selectionState.mode === "filter" && scopeIsExcluded(currentScope, selectionState.excludedScopes)
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
    if (currentScopeIsExcluded) return {}

    if (!filterScopeCoversCurrentRows) {
      return Object.fromEntries(
        loadedRowIds
          .filter((id) => materializedSelectedIds.includes(id) && !excluded.has(id))
          .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
          .map((id) => [id, true])
      )
    }

    return Object.fromEntries(
      loadedRowIds
        .filter((id) => !excluded.has(id))
        .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
        .map((id) => [id, true])
    )
  }, [currentScopeIsExcluded, enabled, filterScopeCoversCurrentRows, loadedRowIds, loadedRowsById, materializedSelectedIds, selectionState])

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
      excludedScopes: [],
    })
    setMaterializedSelectedIds(loadedRowIds)
    setIsSelectingAll(false)
  }, [currentScope, enabled, loadedRowIds, totalRowCount])

  const deselectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("deselectAll")
    setSelectionState((previous) => {
      if (previous.mode !== "filter" || !scopeHasConstraints(currentScope)) {
        setMaterializedSelectedIds([])
        return { mode: "ids", ids: [] }
      }

      return {
        ...previous,
        excludedScopes: uniqueScopes([
          ...(previous.excludedScopes ?? []),
          { scope: currentScope, total: totalRowCount },
        ]),
      }
    })
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

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
    if (currentScopeIsExcluded) return []
    const excluded = new Set(selectionState.excludedIds)
    if (!filterScopeCoversCurrentRows) {
      return loadedRowIds.filter((id) => materializedSelectedIds.includes(id) && !excluded.has(id))
        .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
    }
    return loadedRowIds
      .filter((id) => !excluded.has(id))
      .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
  }, [currentScopeIsExcluded, filterScopeCoversCurrentRows, loadedRowIds, loadedRowsById, materializedSelectedIds, selectionState])

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
