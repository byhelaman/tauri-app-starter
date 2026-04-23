import { useMemo, useState, type ReactNode } from "react"
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
} from "@tanstack/react-table"
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
import type {
  DataTableLayoutConfig,
  DataTableToolbarConfig,
} from "./data-table-types"


interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  tableId: string
  toolbar?: DataTableToolbarConfig<TData>
  layout?: DataTableLayoutConfig
  className?: string
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode
  rowContextMenu?: (row: TData) => ReactNode
  defaultPageSize?: number
  pageSizeOptions?: number[]
  rowClassName?: (row: TData) => string | undefined
  isLoading?: boolean
  getRowId?: (row: TData) => string
}

import { getColumnSizeStyle, getPinnedColumnStyle } from "./data-table-utils"

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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: ["select"], right: [] })
  const [rowSelection, setRowSelection] = useState({})

  const clearSelection = () => setRowSelection({})

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
        searchableColumnIds = row
          .getAllCells()
          .filter((cell) => cell.column.getCanGlobalFilter())
          .map((cell) => cell.column.id)
      }

      if (searchableColumnIds.length === 0) return true

      const haystack = joinSearchValues(
        searchableColumnIds.map((columnId) => row.getValue(columnId)),
      )

      return matchesSearchGroups(haystack, lastGroups)
    }
  }, [])

  const table = useReactTable({
    data,
    columns,
    defaultColumn: {
      enableGlobalFilter: false,
    },
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
    initialState: { pagination: { pageSize: defaultPageSize } },
    state: { sorting, columnFilters, globalFilter, columnPinning, columnVisibility, rowSelection },
  })

  const cellPadding = 8 // p-2
  const { left: leftPinned = [], right: rightPinned = [] } = table.getState().columnPinning
  const leftPinnedWidth = leftPinned
    .reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const rightPinnedWidth = rightPinned
    .reduce((sum, id) => sum + (table.getColumn(id)?.getSize() ?? 0), 0) + cellPadding
  const headerHeight = 2.5 * 16 + cellPadding // h-10 (2.5rem) sticky header
  const leftEdgeId = [...leftPinned].reverse().find(id => table.getColumn(id)?.getCanPin())
  const rightEdgeId = [...rightPinned].reverse().find(id => table.getColumn(id)?.getCanPin())

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
      />

      <div
        className={cn("overflow-auto rounded-md border scrollbar", fitHeight ? "min-h-0 flex-1" : "max-h-[calc(100svh-17rem)]", scrollAreaClassName)}
        style={{ scrollPadding: `${headerHeight}px ${rightPinnedWidth}px ${cellPadding}px ${leftPinnedWidth}px` }}
      >
        <Table containerClassName="overflow-visible">
          <TableHeader className={cn("sticky top-0 z-50 bg-(--table-bg,var(--color-background))", tableHeaderClassName)}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="group">
                {headerGroup.headers.map((header) => {
                  const pin = header.column.getIsPinned()
                  const isFirst = pin === "left" && header.column.getStart("left") === 0
                  const isEdge = pin === "left"
                    ? header.column.id === leftEdgeId
                    : pin === "right"
                      ? header.column.id === rightEdgeId
                      : false
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.getIsPinned() &&
                        "z-40 bg-(--table-bg,var(--color-background)) transition-colors group-hover:bg-[color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))]",
                      )}
                      style={{
                        ...(header.column.getIsPinned() ? undefined : getColumnSizeStyle(header.column.columnDef)),
                        ...getPinnedColumnStyle(
                          header.column,
                          true,
                          isEdge,
                          isFirst,
                        ),
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DataTableSkeleton
                table={table}
                rowCount={defaultPageSize}
                leftEdgeId={leftEdgeId}
                rightEdgeId={rightEdgeId}
              />
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowEl = (
                  <TableRow
                    key={row.id}
                    className={cn("group/row group", rowClassName?.(row.original))}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pin = cell.column.getIsPinned()
                      const isFirst = pin === "left" && cell.column.getStart("left") === 0
                      const isEdge = pin === "left"
                        ? cell.column.id === leftEdgeId
                        : pin === "right"
                          ? cell.column.id === rightEdgeId
                          : false
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            cell.column.getIsPinned() &&
                            "relative z-10 group-hover/row:z-30 border-b group-last/row:border-b-0 bg-(--highlight-bg,var(--table-bg,var(--color-background))) transition-colors group-hover:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-data-open:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-has-aria-expanded:bg-(--highlight-bg-hover,color-mix(in_oklch,var(--color-muted)_50%,var(--table-bg,var(--color-background)))) group-data-[state=selected]:bg-muted",
                          )}
                          style={{
                            ...(cell.column.getIsPinned() ? undefined : getColumnSizeStyle(cell.column.columnDef)),
                            ...getPinnedColumnStyle(
                              cell.column,
                              false,
                              isEdge,
                              isFirst,
                            ),
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
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />

      {bulkActions && table.getFilteredSelectedRowModel().rows.length > 0 && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-3 rounded-lg border bg-background p-2 shadow-lg">
            <span className="pl-2 text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} selected
            </span>
            <div className="h-4 w-px bg-border" />
            {bulkActions(
              table.getFilteredSelectedRowModel().rows.map((r) => r.original),
              clearSelection
            )}
            <div className="h-4 w-px bg-border" />
            <Button variant="ghost" size="icon-sm" onClick={clearSelection} className="text-muted-foreground">
              <X />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
