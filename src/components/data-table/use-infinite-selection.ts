import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableExcludedSelectionScope, DataTableIncludedSelectionScope, DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"

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

function scopeMembershipKey(scope: DataTableSelectionScope): string {
  return JSON.stringify({
    search: scope.search || "",
    filters: normalizeFilters(scope.filters),
    date: scope.date ?? null,
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
  const includedIdTotal = selection.includedIds?.length ?? 0
  const includedScopeTotal = (selection.includedScopes ?? []).reduce((sum, included) => sum + included.total, 0)
  const excludedScopeTotal = (selection.excludedScopes ?? []).reduce((sum, excluded) => sum + excluded.total, 0)
  return Math.max(0, selection.total + includedIdTotal + includedScopeTotal - excludedScopeTotal - selection.excludedIds.length)
}

function uniqueScopes<TScope extends DataTableExcludedSelectionScope | DataTableIncludedSelectionScope>(scopes: TScope[]): TScope[] {
  const seen = new Set<string>()
  const result: TScope[] = []
  for (const excluded of scopes) {
    const key = scopeMembershipKey(excluded.scope)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(excluded)
  }
  return result
}

function scopeIsExcluded(scope: DataTableSelectionScope, excludedScopes: DataTableExcludedSelectionScope[] = []): boolean {
  return excludedScopes.some((excluded) => scopeCoversScope(excluded.scope, scope))
}

function scopeIsIncluded(scope: DataTableSelectionScope, includedScopes: DataTableIncludedSelectionScope[] = []): boolean {
  return includedScopes.some((included) => scopeCoversScope(included.scope, scope))
}

function scopeCoversScope(baseScope: DataTableSelectionScope, targetScope: DataTableSelectionScope): boolean {
  if (baseScope.search?.trim()) {
    if ((baseScope.search || "").trim() !== (targetScope.search || "").trim()) return false
  }

  if (baseScope.date && baseScope.date !== targetScope.date) return false

  const targetFilters = new Map(
    normalizeFilters(targetScope.filters).map((filter) => [
      filter.id,
      Array.isArray(filter.value) ? filter.value.map(String) : [],
    ])
  )

  for (const filter of normalizeFilters(baseScope.filters)) {
    const baseValues = Array.isArray(filter.value) ? filter.value.map(String) : []
    if (baseValues.length === 0) continue

    const targetValues = targetFilters.get(filter.id)
    if (!targetValues || targetValues.length === 0) return false
    if (targetValues.some((value) => !baseValues.includes(value))) return false
  }

  return true
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

function rowMatchesIncludedScopes(row: Record<string, unknown> | undefined, includedScopes: DataTableIncludedSelectionScope[] = []): boolean {
  return includedScopes.some((included) => rowMatchesScope(row, included.scope))
}

function idsIncludedByExplicitSelection(
  ids: string[],
  included: Set<string>,
  excluded: Set<string>
): RowSelectionState {
  return Object.fromEntries(ids.filter((id) => included.has(id) && !excluded.has(id)).map((id) => [id, true]))
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
    filterScopeIsCurrent || scopeCoversScope(selectionState.scope, currentScope)
  )
  const includedScopeCoversCurrentRows = selectionState.mode === "filter" && scopeIsIncluded(currentScope, selectionState.includedScopes)
  const currentScopeIsExcluded = selectionState.mode === "filter" && scopeIsExcluded(currentScope, selectionState.excludedScopes)
  const currentScopeIsOnlyExcluded = currentScopeIsExcluded && !includedScopeCoversCurrentRows
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
    const included = new Set(selectionState.includedIds ?? [])
    if (currentScopeIsOnlyExcluded) return idsIncludedByExplicitSelection(loadedRowIds, included, excluded)

    if (!filterScopeCoversCurrentRows && !includedScopeCoversCurrentRows) {
      return Object.fromEntries(
        loadedRowIds
          .filter((id) => !excluded.has(id))
          .filter((id) => included.has(id) || materializedSelectedIds.includes(id))
          .filter((id) => included.has(id) || !loadedRowsById[id] || rowMatchesScope(loadedRowsById[id], selectionState.scope) || rowMatchesIncludedScopes(loadedRowsById[id], selectionState.includedScopes))
          .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
          .map((id) => [id, true])
      )
    }

    return Object.fromEntries(
      loadedRowIds
        .filter((id) => !excluded.has(id))
        .filter((id) => included.has(id) || rowMatchesIncludedScopes(loadedRowsById[id], selectionState.includedScopes) || !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
        .map((id) => [id, true])
    )
  }, [currentScopeIsOnlyExcluded, enabled, filterScopeCoversCurrentRows, includedScopeCoversCurrentRows, loadedRowIds, loadedRowsById, materializedSelectedIds, selectionState])

  const clearSelection = useCallback(() => {
    setMaterializedSelectedIds([])
    setSelectionState({ mode: "ids", ids: [] })
  }, [])

  const selectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("selectAll")
    setSelectionState((previous) => {
      if (previous.mode !== "filter") {
        return {
          mode: "filter",
          scope: currentScope,
          total: totalRowCount,
          includedIds: previous.ids.filter((id) => !loadedRowIds.includes(id)),
          excludedIds: [],
          excludedScopes: [],
        }
      }

      if (scopeCoversScope(currentScope, previous.scope)) {
        return {
          mode: "filter",
          scope: currentScope,
          total: totalRowCount,
          includedScopes: (previous.includedScopes ?? []).filter((included) => !scopeCoversScope(currentScope, included.scope)),
          includedIds: scopeHasConstraints(currentScope)
            ? (previous.includedIds ?? []).filter((id) => !loadedRowIds.includes(id))
            : [],
          excludedIds: scopeHasConstraints(currentScope)
            ? previous.excludedIds.filter((id) => !loadedRowIds.includes(id))
            : [],
          excludedScopes: (previous.excludedScopes ?? []).filter((excluded) => !scopeCoversScope(currentScope, excluded.scope)),
        }
      }

      if (scopeCoversScope(previous.scope, currentScope) || scopeIsIncluded(currentScope, previous.includedScopes)) {
        const currentCoversExcludedScope = (previous.excludedScopes ?? []).some((excluded) => scopeCoversScope(currentScope, excluded.scope))
        const shouldIncludeCurrentScope = scopeIsExcluded(currentScope, previous.excludedScopes) && !currentCoversExcludedScope
        return {
          ...previous,
          includedScopes: shouldIncludeCurrentScope
            ? uniqueScopes([
              ...(previous.includedScopes ?? []).filter((included) => !scopeCoversScope(currentScope, included.scope)),
              { scope: currentScope, total: totalRowCount },
            ])
            : previous.includedScopes,
          includedIds: (previous.includedIds ?? []).filter((id) => !loadedRowIds.includes(id)),
          excludedIds: previous.excludedIds.filter((id) => !loadedRowIds.includes(id)),
          excludedScopes: shouldIncludeCurrentScope
            ? previous.excludedScopes
            : (previous.excludedScopes ?? []).filter((excluded) => !scopeCoversScope(currentScope, excluded.scope)),
        }
      }

      return {
        ...previous,
        includedIds: (previous.includedIds ?? []).filter((id) => !loadedRowIds.includes(id)),
        includedScopes: uniqueScopes([
          ...(previous.includedScopes ?? []).filter((included) => !scopeCoversScope(currentScope, included.scope)),
          { scope: currentScope, total: totalRowCount },
        ]),
        excludedScopes: (previous.excludedScopes ?? []).filter((excluded) => !scopeCoversScope(currentScope, excluded.scope)),
      }
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

      const remainingExcludedScopes = (previous.excludedScopes ?? []).filter((excluded) => !scopeCoversScope(currentScope, excluded.scope))
      const shouldAddExcludedScope = !scopeIsExcluded(currentScope, remainingExcludedScopes)

      return {
        ...previous,
        includedIds: (previous.includedIds ?? []).filter((id) => !loadedRowIds.includes(id)),
        includedScopes: (previous.includedScopes ?? []).filter((included) => !scopeCoversScope(currentScope, included.scope)),
        excludedScopes: shouldAddExcludedScope
          ? uniqueScopes([...remainingExcludedScopes, { scope: currentScope, total: totalRowCount }])
          : remainingExcludedScopes,
      }
    })
    setIsSelectingAll(false)
  }, [currentScope, enabled, loadedRowIds, totalRowCount])

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setSelectionState((previous) => {
      const previousScopeCoversCurrentRows = previous.mode === "filter" && (
        scopeKey(previous.scope) === currentScopeKey || !scopeHasConstraints(previous.scope)
      )
      const previousIncludedScopeCoversCurrentRows = previous.mode === "filter" && scopeIsIncluded(currentScope, previous.includedScopes)
      const previousIncludedIds = previous.mode === "filter" ? new Set(previous.includedIds ?? []) : new Set<string>()
      const previousExcludedIds = previous.mode === "filter" ? new Set(previous.excludedIds) : new Set<string>()
      const previousRows = previous.mode === "filter" && (previousScopeCoversCurrentRows || previousIncludedScopeCoversCurrentRows)
        ? Object.fromEntries(loadedRowIds
          .filter((id) => !previousExcludedIds.has(id))
          .filter((id) => previousIncludedIds.has(id) || rowMatchesIncludedScopes(loadedRowsById[id], previous.includedScopes) || !rowMatchesExcludedScopes(loadedRowsById[id], previous.excludedScopes))
          .map((id) => [id, true]))
        : previous.mode === "filter"
          ? Object.fromEntries(loadedRowIds
            .filter((id) => !previousExcludedIds.has(id))
            .filter((id) => previousIncludedIds.has(id) || (materializedSelectedIds.includes(id)))
            .filter((id) => previousIncludedIds.has(id) || !loadedRowsById[id] || rowMatchesScope(loadedRowsById[id], previous.scope) || rowMatchesIncludedScopes(loadedRowsById[id], previous.includedScopes))
            .filter((id) => previousIncludedIds.has(id) || !rowMatchesExcludedScopes(loadedRowsById[id], previous.excludedScopes))
            .map((id) => [id, true]))
        : previous.mode === "ids"
          ? idsToRowSelection(previous.ids)
          : {}
      const nextRows = typeof updater === "function" ? updater(previousRows) : updater

      if (previous.mode === "filter") {
        const excluded = new Set(previous.excludedIds)
        const included = new Set(previous.includedIds ?? [])
        for (const id of loadedRowIds) {
          const wasSelected = !!previousRows[id]
          const isSelected = !!nextRows[id]
          const row = loadedRowsById[id]
          const isCoveredBySelectedScope = !row || rowMatchesScope(row, previous.scope) || rowMatchesIncludedScopes(row, previous.includedScopes)
          const isBlockedByExcludedScope = rowMatchesExcludedScopes(row, previous.excludedScopes)
          if (wasSelected && !isSelected) {
            const wasExplicitlyIncluded = included.has(id)
            if (wasExplicitlyIncluded) included.delete(id)
            if (isCoveredBySelectedScope && !(wasExplicitlyIncluded && isBlockedByExcludedScope)) excluded.add(id)
          }
          if (!wasSelected && isSelected) {
            if (!isCoveredBySelectedScope || isBlockedByExcludedScope) included.add(id)
          }
          if (isSelected) excluded.delete(id)
        }
        return { ...previous, includedIds: Array.from(included), excludedIds: Array.from(excluded) }
      }

      return {
        mode: "ids",
        ids: Object.keys(nextRows).filter((id) => nextRows[id]),
      }
    })
  }, [currentScope, currentScopeKey, loadedRowIds, loadedRowsById, materializedSelectedIds])

  const visibleSelectedIds = useMemo(() => {
    if (selectionState.mode === "ids") return selectionState.ids
    const excluded = new Set(selectionState.excludedIds)
    const included = new Set(selectionState.includedIds ?? [])
    if (currentScopeIsOnlyExcluded) return loadedRowIds.filter((id) => included.has(id) && !excluded.has(id))
    if (!filterScopeCoversCurrentRows && !includedScopeCoversCurrentRows) {
      return loadedRowIds.filter((id) => !excluded.has(id))
        .filter((id) => included.has(id) || materializedSelectedIds.includes(id))
        .filter((id) => included.has(id) || !loadedRowsById[id] || rowMatchesScope(loadedRowsById[id], selectionState.scope) || rowMatchesIncludedScopes(loadedRowsById[id], selectionState.includedScopes))
        .filter((id) => !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
    }
    return loadedRowIds
      .filter((id) => included.has(id) || !excluded.has(id))
      .filter((id) => included.has(id) || rowMatchesIncludedScopes(loadedRowsById[id], selectionState.includedScopes) || !rowMatchesExcludedScopes(loadedRowsById[id], selectionState.excludedScopes))
  }, [currentScopeIsOnlyExcluded, filterScopeCoversCurrentRows, includedScopeCoversCurrentRows, loadedRowIds, loadedRowsById, materializedSelectedIds, selectionState])

  const totalSelectedCount = selectedCount(selectionState)
  const currentScopeSelectedCount = useMemo(() => {
    if (selectionState.mode === "ids") {
      const selected = new Set(selectionState.ids)
      return loadedRowIds.filter((id) => selected.has(id)).length
    }
    if (currentScopeIsOnlyExcluded) {
      const included = new Set(selectionState.includedIds ?? [])
      const excluded = new Set(selectionState.excludedIds)
      return loadedRowIds.filter((id) => included.has(id) && !excluded.has(id)).length
    }

    const selectedScopeCoversCurrent = scopeCoversScope(selectionState.scope, currentScope)
    const includedScopeCoversCurrent = scopeIsIncluded(currentScope, selectionState.includedScopes)
    const currentScopeCoversSelected = scopeCoversScope(currentScope, selectionState.scope)

    if (selectedScopeCoversCurrent || includedScopeCoversCurrent) {
      const excludedIdsInCurrentScope = selectionState.excludedIds.filter((id) => rowMatchesScope(loadedRowsById[id], currentScope)).length
      const excludedScopesInCurrentScope = (selectionState.excludedScopes ?? [])
        .filter((excluded) => scopeCoversScope(currentScope, excluded.scope))
        .reduce((sum, excluded) => sum + excluded.total, 0)
      return Math.max(0, totalRowCount - excludedIdsInCurrentScope - excludedScopesInCurrentScope)
    }

    if (currentScopeCoversSelected) return totalSelectedCount

    return visibleSelectedIds.length
  }, [currentScope, currentScopeIsOnlyExcluded, loadedRowIds, loadedRowsById, selectionState, totalRowCount, totalSelectedCount, visibleSelectedIds.length])

  const displaySelectedCount = currentScopeIsConstrained ? currentScopeSelectedCount : totalSelectedCount

  return {
    rowSelection,
    setRowSelection,
    clearSelection,
    currentScope,
    selectionState,
    selectedCount: totalSelectedCount,
    displaySelectedCount,
    currentScopeSelectedCount,
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
  }
}
