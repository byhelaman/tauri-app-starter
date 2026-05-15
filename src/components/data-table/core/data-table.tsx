import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type PaginationState,
  type OnChangeFn,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { DataTableToolbar } from "../view/data-table-toolbar"
import { DataTablePagination } from "../view/data-table-pagination"
import { DataTableSelectionBar } from "../selection/data-table-selection-bar"
import { DataTableViewport } from "../view/data-table-viewport"
import {
  DataTableLayoutConfig,
  DataTableToolbarConfig,
  InfiniteScrollConfig,
  type DataTableResetContext,
  type DataTableSelectionState,
} from "./data-table-types"
import { useDataTableInstance } from "./use-data-table-instance"

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
    selectedIds: string[],
    selection: DataTableSelectionState,
    meta: { selectedCount: number; isSelectionCountPending: boolean }
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
  /** Permite acciones de copia masiva */
  allowDataCopy?: boolean
  /** Desactiva la paginación clásica y muestra todas las filas recibidas. */
  enablePagination?: boolean
  /** Resetea estado externo que vive fuera de la tabla, como filtros de página. */
  onResetView?: (context: DataTableResetContext) => void
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
  allowDataCopy = allowDataExport,
  enablePagination = true,
  onResetView,
}: DataTableProps<TData, TValue>) {
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

  const {
    table,
    selection,
    setColumnPinning,
  } = useDataTableInstance({
    tableId,
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
    isLoading,
  })

  const fitHeight = layout?.fitHeight ?? false
  const scrollAreaClassName = layout?.scrollAreaClassName
  const tableHeaderClassName = layout?.tableHeaderClassName

  const cellPadding = 8
  const { left: leftPinned = [], right: rightPinned = [] } = table.getState().columnPinning
  const leftPinnedWidth = leftPinned.reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const rightPinnedWidth = rightPinned.reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const headerHeight = 2.5 * 16 + cellPadding // h-10 (2.5rem) sticky header
  const leftEdgeId = leftPinned
    .map(id => table.getColumn(id))
    .filter(column => column?.getCanPin())
    .sort((a, b) => (b?.getStart("left") ?? 0) - (a?.getStart("left") ?? 0))[0]?.id
  const rightEdgeId = rightPinned
    .map(id => table.getColumn(id))
    .filter(column => column?.getCanPin())
    .sort((a, b) => (b?.getAfter("right") ?? 0) - (a?.getAfter("right") ?? 0))[0]?.id

  // ── Virtualizador de filas (solo en modo infinite scroll) ──────────────────
  const rows = table.getRowModel().rows
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns imperative helpers by design.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 10,
    // Habilitado siempre pero solo consumido cuando infiniteScroll está activo
  })

  const resetTableView = () => {
    table.resetColumnFilters()
    table.resetGlobalFilter()
    table.resetSorting()
    table.resetColumnVisibility()
    table.resetColumnPinning()
    table.resetRowSelection()
    table.setPageIndex(0)
    setColumnPinning({ left: ["select"], right: [] })
    setIsSidePanelOpen(false)

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, left: 0 })
      rowVirtualizer.scrollToIndex(0)
    })

    onResetView?.({
      closeSidePanel: () => setIsSidePanelOpen(false),
      resetScroll: () => {
        scrollRef.current?.scrollTo({ top: 0, left: 0 })
        rowVirtualizer.scrollToIndex(0)
      },
    })
  }

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
        viewMenuItems={toolbar?.viewMenuItems}
        showViewOptions={toolbar?.showViewOptions}
        viewActionsMode={toolbar?.viewActionsMode}
        resultCountMode={toolbar?.resultCountMode}
        onSidePanelToggle={sidePanel ? () => setIsSidePanelOpen(!isSidePanelOpen) : undefined}
        infiniteScroll={infiniteScroll}
        allowDataExport={allowDataExport}
        allowDataCopy={allowDataCopy}
        onResetTable={resetTableView}
        renderSearchInput={toolbar?.renderSearchInput}
      />


      <div className={cn(!fitHeight && "max-h-[calc(100svh-14rem)]", "flex flex-1 min-h-0 w-full")}>
        <DataTableViewport
          table={table}
          columns={columns}
          rows={rows}
          virtualRows={virtualRows}
          paddingTop={paddingTop}
          paddingBottom={paddingBottom}
          scrollRef={scrollRef}
          scrollAreaClassName={scrollAreaClassName}
          tableHeaderClassName={tableHeaderClassName}
          headerHeight={headerHeight}
          rightPinnedWidth={rightPinnedWidth}
          leftPinnedWidth={leftPinnedWidth}
          cellPadding={cellPadding}
          leftEdgeId={leftEdgeId}
          rightEdgeId={rightEdgeId}
          isLoading={isLoading}
          isInfiniteScroll={!!infiniteScroll}
          isFetchingNextPage={infiniteScroll?.isFetchingNextPage}
          rowClassName={rowClassName}
          rowContextMenu={rowContextMenu}
          sidePanel={sidePanel}
          isSidePanelOpen={isSidePanelOpen}
          onCloseSidePanel={() => setIsSidePanelOpen(false)}
        />
      </div>

      {/* Paginador clásico — oculto en modo infinite scroll */}
      {!infiniteScroll && enablePagination && <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />}

      <DataTableSelectionBar
        table={table}
        selectedCount={selection.selectedCount}
        isSelectionCountPending={selection.isSelectionCountPending}
        displaySelectedCount={selection.displaySelectedCount}
        currentScopeTotal={infiniteScroll?.totalRowCount ?? table.getFilteredRowModel().rows.length}
        visibleSelectedIds={selection.visibleSelectedIds}
        selectionState={selection.selectionState}
        clearSelection={selection.clearSelection}
        bulkActions={bulkActions}
      />
    </div>
  )
}
