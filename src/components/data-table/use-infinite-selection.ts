import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableSelectionOperation, DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"
import { filterValues, normalizeFilters, normalizeHourValue } from "@/lib/table-filter-normalization"

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

function normalizeScope(scope: DataTableSelectionScope): DataTableSelectionScope {
  return {
    search: scope.search || "",
    filters: normalizeFilters(scope.filters),
    date: scope.date,
    sorting: scope.sorting ?? [],
  }
}

function operationKey(operation: DataTableSelectionOperation): string {
  if (operation.type === "selectIds" || operation.type === "deselectIds") {
    return JSON.stringify({ type: operation.type, ids: [...operation.ids].sort() })
  }
  return JSON.stringify({ type: operation.type, scope: normalizeScope(operation.scope) })
}

function scopeKey(scope: DataTableSelectionScope): string {
  return JSON.stringify(normalizeScope(scope))
}

function scopeContains(parent: DataTableSelectionScope, child: DataTableSelectionScope): boolean {
  const normalizedParent = normalizeScope(parent)
  const normalizedChild = normalizeScope(child)

  if (normalizedParent.search && normalizedParent.search !== normalizedChild.search) return false
  if (normalizedParent.date && normalizedParent.date !== normalizedChild.date) return false

  const childFilters = new Map(normalizedChild.filters.map((filter) => [filter.id, filterValues(filter)]))
  for (const parentFilter of normalizedParent.filters) {
    const parentValues = filterValues(parentFilter)
    if (parentValues.length === 0) continue

    const childValues = childFilters.get(parentFilter.id)
    if (!childValues || childValues.length === 0) return false

    const parentSet = new Set(parentValues)
    if (!childValues.every((value) => parentSet.has(value))) return false
  }

  return true
}

function dedupeOperations(operations: DataTableSelectionOperation[]): DataTableSelectionOperation[] {
  const result: DataTableSelectionOperation[] = []
  const latestByKey = new Map<string, number>()
  for (const operation of operations) {
    const key = operationKey(operation)
    const previousIndex = latestByKey.get(key)
    if (previousIndex !== undefined) result.splice(previousIndex, 1)
    latestByKey.clear()
    result.push(operation)
    result.forEach((item, index) => latestByKey.set(operationKey(item), index))
  }
  return result
}

function exactScopeSelectionCount(
  operations: DataTableSelectionOperation[],
  currentScope: DataTableSelectionScope,
  totalRowCount: number,
  loadedRowsById: Record<string, Record<string, unknown>>
): number | null {
  const currentKey = scopeKey(currentScope)
  let count: number | null = null

  for (const operation of operations) {
    if (operation.type === "select" || operation.type === "deselect") {
      if (scopeKey(operation.scope) === currentKey || scopeContains(operation.scope, currentScope)) {
        // Operation scope covers the target entirely
        count = operation.type === "select" ? totalRowCount : 0
      } else if (scopeContains(currentScope, operation.scope)) {
        // Operation scope is a subset of the target — use operation.total
        if (operation.type === "deselect" && count !== null) {
          count = Math.max(0, count - operation.total)
        } else if (operation.type === "select" && count === null) {
          // First select on a subset — exact
          count = operation.total
        } else if (count !== null) {
          // select-subset when prior count exists — can't determine overlap
          return null
        }
      } else if (count !== null) {
        return null
      }
      continue
    }

    const matchingIds = operation.ids.filter((id) => rowMatchesScope(loadedRowsById[id], currentScope))
    if (operation.type === "selectIds") {
      count = Math.min(totalRowCount, (count ?? 0) + matchingIds.length)
    } else if (count !== null) {
      count = Math.max(0, count - matchingIds.length)
    }
  }

  return count
}

function exactGlobalSelectionCount(
  operations: DataTableSelectionOperation[],
  totalRowCount: number,
  unfilteredTotalRowCount: number | undefined,
  loadedRowsById: Record<string, Record<string, unknown>>
): number | null {
  return exactScopeSelectionCount(
    operations,
    { search: "", filters: [], sorting: [] },
    unfilteredTotalRowCount ?? totalRowCount,
    loadedRowsById
  )
}

function idsToRowSelection(ids: string[]): RowSelectionState {
  return Object.fromEntries(ids.map((id) => [id, true]))
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
    const values = filterValues(filter)
    if (values.length === 0) continue

    if (filter.id === "time") {
      const hour = normalizeHourValue(String(row.start_time ?? "").split(":")[0] ?? "")
      if (!hour || !values.includes(hour)) return false
      continue
    }

    if (!values.includes(String(row[filter.id] ?? ""))) return false
  }

  return true
}

function rowIsSelectedByOperations(
  id: string,
  row: Record<string, unknown> | undefined,
  operations: DataTableSelectionOperation[]
): boolean {
  let selected = false
  for (const operation of operations) {
    if (operation.type === "selectIds") {
      if (operation.ids.includes(id)) selected = true
      continue
    }
    if (operation.type === "deselectIds") {
      if (operation.ids.includes(id)) selected = false
      continue
    }
    if (rowMatchesScope(row, operation.scope)) {
      selected = operation.type === "select"
    }
  }
  return selected
}

function fallbackSelectedCount(selection: DataTableSelectionState, loadedRowIds: string[], loadedRowsById: Record<string, Record<string, unknown>>): number {
  if (selection.mode === "ids") return selection.ids.length
  return loadedRowIds.filter((id) => rowIsSelectedByOperations(id, loadedRowsById[id], selection.operations)).length
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
  const currentScope = useMemo<DataTableSelectionScope>(() => normalizeScope({
    search: globalFilter || "",
    filters: columnFilters,
    date,
    sorting,
  }), [columnFilters, date, globalFilter, sorting])

  const [selectionState, setSelectionState] = useState<DataTableSelectionState>({ mode: "ids", ids: [] })
  const [selectedCountOverride, setSelectedCountOverride] = useState<{ key: string; count: number } | null>(null)
  const [scopeSelectedCountOverride, setScopeSelectedCountOverride] = useState<{ key: string; count: number } | null>(null)
  const [isSelectingAll, setIsSelectingAll] = useState<SelectionAction | false>(false)
  const countRequestRef = useRef(0)
  const scopeCountRequestRef = useRef(0)
  const lastCountKeyRef = useRef<string | null>(null)
  const lastScopeCountKeyRef = useRef<string | null>(null)

  const operations = selectionState.mode === "operations" ? selectionState.operations : []
  const maxSelectedCount = unfilteredTotalRowCount ?? Number.MAX_SAFE_INTEGER
  const clampSelectedCount = useCallback((count: number) => Math.min(maxSelectedCount, Math.max(0, count)), [maxSelectedCount])
  const selectionCountKey = useMemo(
    () => JSON.stringify({ selectionState, totalRowCount, unfilteredTotalRowCount }),
    [selectionState, totalRowCount, unfilteredTotalRowCount]
  )

  const scopeCountKey = useMemo(
    () => JSON.stringify({ selectionState, currentScope, totalRowCount }),
    [currentScope, selectionState, totalRowCount]
  )

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

  useEffect(() => {
    if (!enabled || !countBySelection || selectionState.mode !== "operations") return
    if (lastCountKeyRef.current === selectionCountKey) return
    if (exactGlobalSelectedCount !== null) {
      lastCountKeyRef.current = selectionCountKey
      return
    }
    const requestId = ++countRequestRef.current
    const key = selectionCountKey
    const timeout = setTimeout(() => {
      lastCountKeyRef.current = key
      void countBySelection(selectionState).then((count) => {
        if (countRequestRef.current === requestId) setSelectedCountOverride({ key, count })
      }).catch(() => {
        if (countRequestRef.current === requestId) setSelectedCountOverride(null)
      })
    }, 300)
    return () => clearTimeout(timeout)
  }, [countBySelection, enabled, exactGlobalSelectedCount, selectionCountKey, selectionState])

  useEffect(() => {
    if (!enabled || !countBySelection || selectionState.mode !== "operations") return
    if (lastScopeCountKeyRef.current === scopeCountKey) return
    if (exactCurrentScopeSelectedCount !== null) {
      lastScopeCountKeyRef.current = scopeCountKey
      return
    }
    const requestId = ++scopeCountRequestRef.current
    const key = scopeCountKey
    const timeout = setTimeout(() => {
      lastScopeCountKeyRef.current = key
      void countBySelection(selectionState, currentScope).then((count) => {
        if (scopeCountRequestRef.current === requestId) setScopeSelectedCountOverride({ key, count })
      }).catch(() => {
        if (scopeCountRequestRef.current === requestId) setScopeSelectedCountOverride(null)
      })
    }, 300)
    return () => clearTimeout(timeout)
  }, [countBySelection, currentScope, enabled, exactCurrentScopeSelectedCount, scopeCountKey, selectionState])

  const hasRemoteSelectedCount = selectedCountOverride?.key === selectionCountKey
  const isSelectionCountPending = !!enabled
    && !!countBySelection
    && selectionState.mode === "operations"
    && exactGlobalSelectedCount === null
    && !hasRemoteSelectedCount
  const rawSelectedCount = selectionState.mode === "ids"
    ? localSelectedCount
    : exactGlobalSelectedCount ?? (hasRemoteSelectedCount ? selectedCountOverride.count : localSelectedCount)
  const selectedCount = clampSelectedCount(rawSelectedCount)
  const hasRemoteScopeSelectedCount = scopeSelectedCountOverride?.key === scopeCountKey
  const currentScopeSelectedCount = exactCurrentScopeSelectedCount
    ?? (hasRemoteScopeSelectedCount
      ? scopeSelectedCountOverride.count
      : visibleSelectedIds.length)
  const displaySelectedCount = currentScopeSelectedCount

  const clearSelection = useCallback(() => {
    setSelectedCountOverride(null)
    setScopeSelectedCountOverride(null)
    setSelectionState({ mode: "ids", ids: [] })
  }, [])

  const selectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("selectAll")
    setSelectionState((previous) => {
      const nextOperations: DataTableSelectionOperation[] = previous.mode === "operations"
        ? previous.operations
        : previous.mode === "ids" && previous.ids.length > 0
          ? [{ type: "selectIds", ids: previous.ids }]
          : []
      const nextSelection: DataTableSelectionState = {
        mode: "operations",
        operations: dedupeOperations([...nextOperations, { type: "select", scope: currentScope, total: totalRowCount }]),
      }
      return nextSelection
    })
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

  const deselectAll = useCallback(async () => {
    if (!enabled) return
    setIsSelectingAll("deselectAll")
    setSelectionState((previous) => {
      const nextOperations: DataTableSelectionOperation[] = previous.mode === "operations"
        ? previous.operations
        : previous.mode === "ids" && previous.ids.length > 0
          ? [{ type: "selectIds", ids: previous.ids }]
          : []
      return {
        mode: "operations",
        operations: dedupeOperations([...nextOperations, { type: "deselect", scope: currentScope, total: totalRowCount }]),
      }
    })
    setIsSelectingAll(false)
  }, [currentScope, enabled, totalRowCount])

  const setRowSelection = useCallback((updater: Updater<RowSelectionState>) => {
    setSelectionState((previous) => {
      const previousRows = previous.mode === "ids"
        ? idsToRowSelection(previous.ids)
        : idsToRowSelection(loadedRowIds.filter((id) => rowIsSelectedByOperations(id, loadedRowsById[id], previous.mode === "operations" ? previous.operations : [])))
      const nextRows = typeof updater === "function" ? updater(previousRows) : updater
      const selectedIds: string[] = []
      const deselectedIds: string[] = []
      for (const id of loadedRowIds) {
        const wasSelected = !!previousRows[id]
        const isSelected = !!nextRows[id]
        if (!wasSelected && isSelected) selectedIds.push(id)
        if (wasSelected && !isSelected) deselectedIds.push(id)
      }

      if (previous.mode === "ids") {
        return { mode: "ids", ids: Object.keys(nextRows).filter((id) => nextRows[id]) }
      }

      const operations: DataTableSelectionOperation[] = previous.mode === "operations" ? [...previous.operations] : []
      if (selectedIds.length > 0) operations.push({ type: "selectIds", ids: selectedIds })
      if (deselectedIds.length > 0) operations.push({ type: "deselectIds", ids: deselectedIds })
      return {
        mode: "operations",
        operations: dedupeOperations(operations),
      }
    })
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
