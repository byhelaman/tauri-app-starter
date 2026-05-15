import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DataTableSelectionScope, DataTableSelectionState } from "../core/data-table-types"

interface UseSelectionCountsOptions {
  enabled: boolean
  selectionState: DataTableSelectionState
  currentScope: DataTableSelectionScope
  totalRowCount: number
  unfilteredTotalRowCount?: number
  localSelectedCount: number
  visibleSelectedCount: number
  exactGlobalSelectedCount: number | null
  exactCurrentScopeSelectedCount: number | null
  countBySelection?: (selection: DataTableSelectionState, scope?: DataTableSelectionScope) => Promise<number>
}

export function useSelectionCounts({
  enabled,
  selectionState,
  currentScope,
  totalRowCount,
  unfilteredTotalRowCount,
  localSelectedCount,
  visibleSelectedCount,
  exactGlobalSelectedCount,
  exactCurrentScopeSelectedCount,
  countBySelection,
}: UseSelectionCountsOptions) {
  const [selectedCountOverride, setSelectedCountOverride] = useState<{ key: string; count: number } | null>(null)
  const [scopeSelectedCountOverride, setScopeSelectedCountOverride] = useState<{ key: string; count: number } | null>(null)
  const countRequestRef = useRef(0)
  const scopeCountRequestRef = useRef(0)
  const lastCountKeyRef = useRef<string | null>(null)
  const lastScopeCountKeyRef = useRef<string | null>(null)

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
      : visibleSelectedCount)

  const resetSelectionCounts = useCallback(() => {
    setSelectedCountOverride(null)
    setScopeSelectedCountOverride(null)
  }, [])

  return {
    selectedCount,
    isSelectionCountPending,
    currentScopeSelectedCount,
    resetSelectionCounts,
  }
}
