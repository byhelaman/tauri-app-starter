import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableSelectionScope, DataTableSelectionState } from "./data-table-types"
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
