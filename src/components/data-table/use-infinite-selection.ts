import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnFiltersState, RowSelectionState } from "@tanstack/react-table"
import { deselectIds, selectIds, selectedIdsInScope } from "./data-table-selection"

type SelectionAction = "selectAll" | "deselectAll"

interface UseInfiniteSelectionOptions {
  enabled: boolean
  fetchIdsByFilter?: (globalFilter?: string, columnFilters?: ColumnFiltersState) => Promise<string[]>
  globalFilter: string
  columnFilters: ColumnFiltersState
  loadedRowIds: string[]
}

export function useInfiniteSelection({
  enabled,
  fetchIdsByFilter,
  globalFilter,
  columnFilters,
  loadedRowIds,
}: UseInfiniteSelectionOptions) {
  const requestRef = useRef(0)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [currentFilterIds, setCurrentFilterIds] = useState<string[]>([])
  const [isSelectingAll, setIsSelectingAll] = useState<SelectionAction | false>(false)

  const clearSelection = useCallback(() => {
    setRowSelection({})
  }, [])

  const fetchCurrentScopeIds = useCallback(async () => {
    if (!enabled || !fetchIdsByFilter) return []
    const requestId = ++requestRef.current
    const ids = await fetchIdsByFilter(globalFilter, columnFilters)
    if (requestId === requestRef.current) {
      setCurrentFilterIds(ids)
    }
    return ids
  }, [columnFilters, enabled, fetchIdsByFilter, globalFilter])

  useEffect(() => {
    if (!enabled || !fetchIdsByFilter) {
      setCurrentFilterIds([])
      return
    }

    let isMounted = true
    const requestId = ++requestRef.current
    fetchIdsByFilter(globalFilter, columnFilters)
      .then((ids) => {
        if (isMounted && requestId === requestRef.current) setCurrentFilterIds(ids)
      })
      .catch(console.error)

    return () => {
      isMounted = false
    }
  }, [columnFilters, enabled, fetchIdsByFilter, globalFilter])

  const selectAll = useCallback(async () => {
    if (!enabled || !fetchIdsByFilter) return
    setIsSelectingAll("selectAll")
    setRowSelection((previous) => selectIds(previous, loadedRowIds))

    try {
      const ids = await fetchCurrentScopeIds()
      setRowSelection((previous) => selectIds(previous, ids))
    } finally {
      setIsSelectingAll(false)
    }
  }, [enabled, fetchCurrentScopeIds, fetchIdsByFilter, loadedRowIds])

  const deselectAll = useCallback(async () => {
    if (!enabled || !fetchIdsByFilter) return
    setIsSelectingAll("deselectAll")
    setRowSelection((previous) => deselectIds(previous, loadedRowIds))

    try {
      const ids = await fetchCurrentScopeIds()
      setRowSelection((previous) => deselectIds(previous, ids))
    } finally {
      setIsSelectingAll(false)
    }
  }, [enabled, fetchCurrentScopeIds, fetchIdsByFilter, loadedRowIds])

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection])
  const visibleSelectedIds = useMemo(() => {
    if (!enabled) return selectedIds
    return selectedIdsInScope(rowSelection, currentFilterIds)
  }, [currentFilterIds, enabled, rowSelection, selectedIds])

  return {
    rowSelection,
    setRowSelection,
    clearSelection,
    currentFilterIds,
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
  }
}
