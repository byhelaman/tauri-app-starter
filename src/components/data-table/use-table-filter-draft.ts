import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnFiltersState, Table } from "@tanstack/react-table"

export function filtersEqual(a: ColumnFiltersState, b: ColumnFiltersState): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    const va = a[i].value
    const vb = b[i].value
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length || va.some((v, j) => v !== vb[j])) return false
    } else if (va !== vb) {
      return false
    }
  }
  return true
}

export function getDraftFilterValue(draftFilters: ColumnFiltersState, columnId: string): string[] | undefined {
  const entry = draftFilters.find(f => f.id === columnId)
  if (!entry) return undefined
  return Array.isArray(entry.value) ? (entry.value as string[]) : undefined
}

export function setDraftFilterValue(
  prev: ColumnFiltersState,
  columnId: string,
  values: string[] | undefined
): ColumnFiltersState {
  const without = prev.filter(f => f.id !== columnId)
  if (!values || values.length === 0) return without
  return [...without, { id: columnId, value: values }]
}

export function commitFilterDraft<TData>({
  table,
  draftSearch,
  draftFilters,
  committedFilters,
}: {
  table: Table<TData>
  draftSearch: string
  draftFilters: ColumnFiltersState
  committedFilters: ColumnFiltersState
}) {
  table.setGlobalFilter(draftSearch || undefined)

  const currentIds = new Set(committedFilters.map(f => f.id))
  const draftIds = new Set(draftFilters.map(f => f.id))

  for (const id of currentIds) {
    if (!draftIds.has(id)) table.getColumn(id)?.setFilterValue(undefined)
  }

  for (const filter of draftFilters) {
    table.getColumn(filter.id)?.setFilterValue(filter.value)
  }
}

export function resetFilterDraft<TData>(table: Table<TData>) {
  table.resetColumnFilters()
  table.setGlobalFilter(undefined)
}

export function useTableFilterDraft<TData>(table: Table<TData>) {
  const committedSearch = (table.getState().globalFilter as string) ?? ""
  const committedFilters = table.getState().columnFilters
  const [draftSearch, setDraftSearch] = useState(committedSearch)
  const [draftFilters, setDraftFilters] = useState<ColumnFiltersState>(committedFilters)

  useEffect(() => {
    setDraftSearch(committedSearch)
  }, [committedSearch])

  useEffect(() => {
    setDraftFilters(committedFilters)
  }, [committedFilters])

  const setDraftFilter = useCallback((columnId: string, values: string[] | undefined) => {
    setDraftFilters(prev => setDraftFilterValue(prev, columnId, values))
  }, [])

  const commit = useCallback((selectedSearch?: string) => {
    const nextSearch = selectedSearch !== undefined ? selectedSearch : draftSearch
    if (selectedSearch !== undefined) setDraftSearch(selectedSearch)
    commitFilterDraft({
      table,
      draftSearch: nextSearch,
      draftFilters,
      committedFilters,
    })
  }, [committedFilters, draftFilters, draftSearch, table])

  const reset = useCallback(() => {
    setDraftSearch("")
    setDraftFilters([])
    resetFilterDraft(table)
  }, [table])

  const hasPendingChanges = useMemo(() => {
    if (draftSearch !== committedSearch) return true
    return !filtersEqual(draftFilters, committedFilters)
  }, [committedFilters, committedSearch, draftFilters, draftSearch])

  return {
    committedSearch,
    committedFilters,
    draftSearch,
    setDraftSearch,
    draftFilters,
    setDraftFilter,
    commit,
    reset,
    hasPendingChanges,
  }
}
