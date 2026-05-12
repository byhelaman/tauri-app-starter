import { useEffect, useMemo, useState } from "react"
import { joinSearchValues, matchesSearchGroups, normalizeSearchGroups } from "@/lib/utils"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type FilterFn,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  type DataTableMeta,
  type DataTableToolbarConfig,
  type InfiniteScrollConfig,
} from "./data-table-types"
import { useInfiniteSelection } from "./use-infinite-selection"

const VIRTUAL_PAGE_SIZE = Number.MAX_SAFE_INTEGER

interface UseDataTableInstanceOptions<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  toolbar?: DataTableToolbarConfig<TData>
  defaultPageSize: number
  getRowId?: (row: TData) => string
  manualPagination?: boolean
  pageCount?: number
  rowCount?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  externalColumnFilters?: ColumnFiltersState
  setExternalColumnFilters?: OnChangeFn<ColumnFiltersState>
  externalGlobalFilter?: string
  setExternalGlobalFilter?: OnChangeFn<string>
  externalSorting?: SortingState
  setExternalSorting?: OnChangeFn<SortingState>
  onSortingRefresh?: () => void
  infiniteScroll?: InfiniteScrollConfig
  enablePagination: boolean
}

export function useDataTableInstance<TData, TValue>({
  columns,
  data,
  toolbar,
  defaultPageSize,
  getRowId,
  manualPagination,
  pageCount,
  rowCount,
  pagination,
  onPaginationChange,
  externalColumnFilters,
  setExternalColumnFilters,
  externalGlobalFilter,
  setExternalGlobalFilter,
  externalSorting,
  setExternalSorting,
  onSortingRefresh,
  infiniteScroll,
  enablePagination,
}: UseDataTableInstanceOptions<TData, TValue>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("")
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: ["select"], right: [] })

  const columnFilters = externalColumnFilters ?? internalColumnFilters
  const setColumnFilters = setExternalColumnFilters ?? setInternalColumnFilters
  const globalFilter = externalGlobalFilter ?? internalGlobalFilter
  const setGlobalFilter = setExternalGlobalFilter ?? setInternalGlobalFilter
  const sorting = externalSorting ?? internalSorting
  const setSorting = setExternalSorting ?? setInternalSorting

  const loadedRowIds = useMemo(() => data.map((row, index) => getRowId?.(row) ?? String(index)), [data, getRowId])
  const loadedRowsById = useMemo(
    () => Object.fromEntries(data.map((row, index) => [getRowId?.(row) ?? String(index), row as Record<string, unknown>])),
    [data, getRowId]
  )
  const usesServerSelection = !!infiniteScroll && toolbar?.selectionMode !== "client"
  const selection = useInfiniteSelection({
    enabled: usesServerSelection,
    globalFilter,
    columnFilters,
    sorting,
    totalRowCount: infiniteScroll?.totalRowCount ?? rowCount ?? data.length,
    date: infiniteScroll?.currentScope?.date,
    loadedRowIds,
    loadedRowsById,
    countBySelection: infiniteScroll?.countBySelection,
  })

  const multiColumnGlobalFilter = useMemo<FilterFn<TData>>(() => {
    let lastQuery = ""
    let lastGroups: string[][] = []
    let searchableColumnIds: string[] | null = null

    return (row, _columnId, filterValue) => {
      const query = typeof filterValue === "string" ? filterValue : ""
      if (!query.trim()) return true
      if (query !== lastQuery) {
        lastQuery = query
        lastGroups = normalizeSearchGroups(query)
      }
      if (lastGroups.length === 0) return true
      if (!searchableColumnIds) {
        searchableColumnIds = row.getAllCells().filter((cell) => cell.column.getCanGlobalFilter()).map((cell) => cell.column.id)
      }
      if (searchableColumnIds.length === 0) return true
      const haystack = joinSearchValues(searchableColumnIds.map((columnId) => row.getValue(columnId)))
      return matchesSearchGroups(haystack, lastGroups)
    }
  }, [])

  const table = useReactTable({
    data,
    columns,
    defaultColumn: { enableGlobalFilter: false },
    enableColumnPinning: true,
    enableMultiSort: true,
    enableSortingRemoval: false,
    isMultiSortEvent: () => true,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: multiColumnGlobalFilter,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: selection.setRowSelection as OnChangeFn<RowSelectionState>,
    autoResetPageIndex: false,
    autoResetAll: false,
    manualPagination,
    manualFiltering: !!infiniteScroll || !!manualPagination,
    manualSorting: !!infiniteScroll,
    pageCount,
    rowCount,
    onPaginationChange,
    initialState: { pagination: { pageSize: defaultPageSize, pageIndex: 0 } },
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnPinning,
      columnVisibility,
      rowSelection: selection.rowSelection,
      ...(infiniteScroll || !enablePagination
        ? { pagination: { pageIndex: 0, pageSize: VIRTUAL_PAGE_SIZE } }
        : manualPagination ? { pagination } : {}
      ),
    },
    meta: {} satisfies DataTableMeta,
  })

  const tablePageCount = table.getPageCount()
  const tablePageIndex = table.getState().pagination.pageIndex

  useEffect(() => {
    if (tablePageCount > 0 && tablePageIndex >= tablePageCount) {
      table.setPageIndex(tablePageCount - 1)
    }
  }, [table, tablePageCount, tablePageIndex])

  const totalRows = infiniteScroll?.totalRowCount ?? rowCount ?? 0
  if (table.options.meta) {
    const meta = table.options.meta as DataTableMeta
    meta.visibleSelectedCount = selection.visibleSelectedIds.length
    meta.visibleSelectedIds = selection.visibleSelectedIds
    meta.selectionState = selection.selectionState
    meta.selectedCount = selection.selectedCount
    meta.displaySelectedCount = selection.displaySelectedCount
    meta.currentScopeSelectedCount = selection.currentScopeSelectedCount
    meta.totalRowCount = totalRows
    meta.refreshSorting = onSortingRefresh
    meta.selectAll = selection.selectAll
    meta.deselectAll = selection.deselectAll
    meta.isSelectingAll = selection.isSelectingAll
    meta.isInfiniteScroll = usesServerSelection
  }

  return {
    table,
    selection,
    usesServerSelection,
    setColumnPinning,
  }
}
