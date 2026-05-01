import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { cn, joinSearchValues, matchesSearchGroups, normalizeSearchGroups } from "@/lib/utils"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type OnChangeFn,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DataTableToolbar } from "./data-table-toolbar"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableSkeleton } from "./data-table-skeleton"
import {
  DataTableLayoutConfig,
  DataTableToolbarConfig,
  InfiniteScrollConfig,
  DataTableMeta
} from "./data-table-types"
import { getColumnSizeStyle, getPinnedColumnStyle } from "./data-table-utils"
import { useInfiniteSelection } from "./use-infinite-selection"

/**
 * Tamaño de "página" virtual en modo infinite scroll.
 * Sobreescribimos pageSize al máximo posible para que getPaginationRowModel()
 * no filtre las filas cargadas — el virtualizer se encarga de renderizar solo las visibles.
 */
const VIRTUAL_PAGE_SIZE = Number.MAX_SAFE_INTEGER

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]

  tableId: string
  toolbar?: DataTableToolbarConfig<TData>
  layout?: DataTableLayoutConfig
  className?: string
  bulkActions?: (
    selectedLoadedRows: TData[],
    clearSelection: () => void,
    selectedIds: string[]
  ) => ReactNode
  rowContextMenu?: (row: TData) => ReactNode
  defaultPageSize?: number
  pageSizeOptions?: number[]
  rowClassName?: (row: TData) => string | undefined
  isLoading?: boolean
  getRowId?: (row: TData) => string
  sidePanel?: (onClose: () => void) => React.ReactNode
  manualPagination?: boolean
  pageCount?: number
  rowCount?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>
  globalFilter?: string
  onGlobalFilterChange?: OnChangeFn<string>
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  onSortingRefresh?: () => void
  /** Activa modo infinite scroll con virtualización. Oculta el paginador. */
  infiniteScroll?: InfiniteScrollConfig
  /** Alto estimado de cada fila en px para el virtualizer (default 40) */
  estimatedRowHeight?: number
  /** Permite acciones de copia/exportación masiva */
  allowDataExport?: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  tableId,
  toolbar,
  layout,
  className,
  bulkActions,
  rowContextMenu,
  defaultPageSize = 10,
  pageSizeOptions,
  rowClassName,
  isLoading = false,
  getRowId,
  sidePanel,
  manualPagination,
  pageCount,
  rowCount,
  pagination,
  onPaginationChange,
  columnFilters: externalColumnFilters,
  onColumnFiltersChange: setExternalColumnFilters,
  globalFilter: externalGlobalFilter,
  onGlobalFilterChange: setExternalGlobalFilter,
  sorting: externalSorting,
  onSortingChange: setExternalSorting,
  onSortingRefresh,
  infiniteScroll,
  estimatedRowHeight = 48,
  allowDataExport = true,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("")

  const columnFilters = externalColumnFilters ?? internalColumnFilters
  const setColumnFilters = setExternalColumnFilters ?? setInternalColumnFilters
  const globalFilter = externalGlobalFilter ?? internalGlobalFilter
  const setGlobalFilter = setExternalGlobalFilter ?? setInternalGlobalFilter
  const sorting = externalSorting ?? internalSorting
  const setSorting = setExternalSorting ?? setInternalSorting

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: ["select"], right: [] })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(`data-table-panel-${tableId}`)
      return saved === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`data-table-panel-${tableId}`, String(isSidePanelOpen))
    } catch {
      // ignore
    }
  }, [isSidePanelOpen, tableId])

  const loadedRowIds = useMemo(() => data.map((row, index) => getRowId?.(row) ?? String(index)), [data, getRowId])
  const {
    rowSelection,
    setRowSelection,
    clearSelection,
    visibleSelectedIds,
    selectAll,
    deselectAll,
    isSelectingAll,
  } = useInfiniteSelection({
    enabled: !!infiniteScroll,
    fetchIdsByFilter: infiniteScroll?.fetchAllIdsByFilter,
    globalFilter,
    columnFilters,
    loadedRowIds,
  })

  const fitHeight = layout?.fitHeight ?? false
  const scrollAreaClassName = layout?.scrollAreaClassName
  const tableHeaderClassName = layout?.tableHeaderClassName

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
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    autoResetAll: false,
    manualPagination,
    manualFiltering: !!manualPagination,
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
      rowSelection,
      // En modo infinite scroll, el virtualizer maneja qué filas renderizar —
      // por eso sobreescribimos pageSize a MAX para que getPaginationRowModel()
      // no limite los rows y todos los datos cargados queden disponibles.
      ...(infiniteScroll
        ? { pagination: { pageIndex: 0, pageSize: VIRTUAL_PAGE_SIZE } }
        : manualPagination ? { pagination } : {}
      )
    },
    meta: {} satisfies DataTableMeta,
  })

  // Ensure page index doesn't go out of bounds when data shrinks (e.g. bulk deleting items on the last page)
  useEffect(() => {
    const pageCount = table.getPageCount()
    const pageIndex = table.getState().pagination.pageIndex
    if (pageCount > 0 && pageIndex >= pageCount) {
      table.setPageIndex(pageCount - 1)
    }
  }, [table, table.getState().pagination.pageIndex, table.getPageCount()])

  const totalRows = infiniteScroll?.totalRowCount ?? rowCount ?? 0
  const displayedSelectedCount = visibleSelectedIds.length

  // Patch meta values after computation
  if (table.options.meta) {
    const meta = table.options.meta as DataTableMeta
    meta.visibleSelectedCount = visibleSelectedIds.length
    meta.visibleSelectedIds = visibleSelectedIds
    meta.totalRowCount = totalRows
    meta.refreshSorting = onSortingRefresh
    meta.selectAll = selectAll
    meta.deselectAll = deselectAll
    meta.isSelectingAll = isSelectingAll
    meta.isInfiniteScroll = !!infiniteScroll
  }

  const cellPadding = 8
  const { left: leftPinned = [], right: rightPinned = [] } = table.getState().columnPinning
  const leftPinnedWidth = leftPinned.reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const rightPinnedWidth = rightPinned.reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const headerHeight = 2.5 * 16 + cellPadding // h-10 (2.5rem) sticky header
  const leftEdgeId = [...leftPinned].reverse().find(id => table.getColumn(id)?.getCanPin())
  const rightEdgeId = [...rightPinned].reverse().find(id => table.getColumn(id)?.getCanPin())

  // ── Virtualizador de filas (solo en modo infinite scroll) ──────────────────
  const rows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 10,
    // Habilitado siempre pero solo consumido cuando infiniteScroll está activo
  })

  // Calcula los spacers para el enfoque spacer-row (compatible con <table> HTML)
  const virtualRows = infiniteScroll ? rowVirtualizer.getVirtualItems() : null
  const totalSize = rowVirtualizer.getTotalSize()
  const lastVirtual = virtualRows ? virtualRows[virtualRows.length - 1] : undefined
  const paddingTop = virtualRows && virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = lastVirtual ? totalSize - lastVirtual.end : 0

  // Dispara fetchNextPage cuando el usuario se acerca al final del dataset
  useEffect(() => {
    if (!infiniteScroll || !virtualRows) return
    const { fetchNextPage, hasNextPage, isFetchingNextPage, threshold = 100 } = infiniteScroll
    if (!hasNextPage || isFetchingNextPage) return
    const lastVirtualRow = virtualRows[virtualRows.length - 1]
    if (!lastVirtualRow) return
    if (lastVirtualRow.index >= rows.length - threshold) {
      fetchNextPage()
    }
  }, [virtualRows, rows.length, infiniteScroll])


  return (
    <div className={cn("relative flex flex-col gap-4", fitHeight && "h-full min-h-0", className)}>
      <DataTableToolbar
        table={table}
        tableId={tableId}
        searchable={toolbar?.searchable}
        filterPlaceholder={toolbar?.filterPlaceholder}
        facetedFilters={toolbar?.facetedFilters}
        intervalFilter={toolbar?.intervalFilter}
        actions={toolbar?.actions}
        searchDebounceMs={toolbar?.searchDebounceMs}
        showViewOptions={toolbar?.showViewOptions}
        onSidePanelToggle={sidePanel ? () => setIsSidePanelOpen(!isSidePanelOpen) : undefined}
        infiniteScroll={infiniteScroll}
        allowDataExport={allowDataExport}
      />


      <div
        className={cn(
          "flex flex-1 min-h-0 w-full overflow-hidden rounded-md border",
          !fitHeight && "max-h-[calc(100svh-14rem)]"
        )}
      >
        <div
          ref={scrollRef}
          className={cn("overflow-auto flex-1 scrollbar", scrollAreaClassName)}
          style={{ scrollPadding: `${headerHeight}px ${rightPinnedWidth}px ${cellPadding}px ${leftPinnedWidth}px` }}
        >
          <Table containerClassName="overflow-visible">
            <TableHeader className={cn("sticky top-0 z-50 bg-(--table-bg,var(--color-background))", tableHeaderClassName)}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="group">
                  {headerGroup.headers.map((header) => {
                    const pin = header.column.getIsPinned()
                    const isFirst = pin === "left" && header.column.getStart("left") === 0
                    const isEdge = pin === "left" ? header.column.id === leftEdgeId : pin === "right" ? header.column.id === rightEdgeId : false
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          header.column.getIsPinned() &&
                          "z-40 bg-(--table-bg,var(--color-background)) transition-colors group-hover:bg-[color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))]"
                        )}
                        style={{
                          ...(header.column.getIsPinned() ? undefined : getColumnSizeStyle(header.column.columnDef)),
                          ...getPinnedColumnStyle(header.column, true, isEdge, isFirst)
                        }}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {/* Spacer superior — ocupa el espacio de filas no renderizadas (spacer-row approach) */}
              {paddingTop > 0 && (
                <TableRow><TableCell colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: 0 }} /></TableRow>
              )}

              {(virtualRows ?? rows).map((item) => {
                const row = virtualRows ? rows[(item as { index: number }).index] : (item as typeof rows[0])
                if (!row) return null
                const rowEl = (
                  <TableRow key={row.id} className={cn("group/row group", rowClassName?.(row.original))} data-state={row.getIsSelected() ? "selected" : undefined}>
                    {row.getVisibleCells().map((cell) => {
                      const pin = cell.column.getIsPinned()
                      const isFirst = pin === "left" && cell.column.getStart("left") === 0
                      const isEdge = pin === "left" ? cell.column.id === leftEdgeId : pin === "right" ? cell.column.id === rightEdgeId : false
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            cell.column.getIsPinned() &&
                            "relative z-10 group-hover/row:z-30 border-b group-last/row:border-b-0 bg-(--highlight-bg,var(--table-bg,var(--color-background))) transition-colors group-hover:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-data-open:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-aria-expanded:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-data-[state=selected]:bg-muted"
                          )}
                          style={{
                            ...(cell.column.getIsPinned() ? undefined : getColumnSizeStyle(cell.column.columnDef)),
                            ...getPinnedColumnStyle(cell.column, false, isEdge, isFirst)
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
                if (!rowContextMenu) return rowEl
                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>{rowEl}</ContextMenuTrigger>
                    <ContextMenuContent>{rowContextMenu(row.original)}</ContextMenuContent>
                  </ContextMenu>
                )
              })}

              {/* Skeleton de carga inicial (paginación clásica) */}
              {isLoading && !infiniteScroll && rows.length < table.getState().pagination.pageSize && (
                <DataTableSkeleton
                  table={table}
                  rowCount={table.getState().pagination.pageSize - rows.length}
                  leftEdgeId={leftEdgeId}
                  rightEdgeId={rightEdgeId}
                />
              )}

              {/* Skeleton de carga INICIAL en modo infinite scroll
                  (isLoading=true, isFetchingNextPage=false aún) */}
              {isLoading && !!infiniteScroll && (
                <DataTableSkeleton
                  table={table}
                  rowCount={100}
                  leftEdgeId={leftEdgeId}
                  rightEdgeId={rightEdgeId}
                />
              )}

              {/* Skeleton al cargar chunks adicionales — ANTES del spacer inferior
                  para quedar visible en el viewport al llegar al fondo */}
              {!isLoading && infiniteScroll?.isFetchingNextPage && (
                <DataTableSkeleton
                  table={table}
                  rowCount={5}
                  leftEdgeId={leftEdgeId}
                  rightEdgeId={rightEdgeId}
                />
              )}

              {/* Spacer inferior — ocupa el espacio de filas aún no visibles */}
              {paddingBottom > 0 && (
                <TableRow><TableCell colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: 0 }} /></TableRow>
              )}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No results.</TableCell>
                </TableRow>
              )}
            </TableBody>

          </Table>
        </div>

        {sidePanel && isSidePanelOpen && (
          <div className="w-96 shrink-0 border-l bg-muted/10 flex flex-col">
            {sidePanel(() => setIsSidePanelOpen(false))}
          </div>
        )}
      </div>

      {/* Paginador clásico — oculto en modo infinite scroll */}
      {!infiniteScroll && <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />}

      {bulkActions && visibleSelectedIds.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-3 rounded-lg border bg-background p-2 shadow-lg">
            {(() => {
              const selectedLoadedRows = table.getFilteredSelectedRowModel().rows
              const displayCount = displayedSelectedCount.toLocaleString()
              return (
                <>
                  <span className="pl-2 text-sm">{displayCount} selected</span>
                  <div className="h-4 w-px bg-border" />
                  {bulkActions(selectedLoadedRows.map((r) => r.original), clearSelection, visibleSelectedIds)}
                  <div className="h-4 w-px bg-border" />
                  <Button variant="ghost" size="icon-sm" onClick={clearSelection}><X /></Button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
