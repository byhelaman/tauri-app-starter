import { useState, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
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
import type {
  DataTableLayoutConfig,
  DataTableToolbarConfig,
  FacetedFilterConfig,
  IntervalFilterConfig,
  ToolbarActionsRenderer,
} from "./data-table-types"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  tableId: string
  toolbar?: DataTableToolbarConfig<TData>
  layout?: DataTableLayoutConfig

  // Compatibilidad con API previa
  filterColumn?: string
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: IntervalFilterConfig
  className?: string
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode
  toolbarActions?: ToolbarActionsRenderer<TData>
  rowContextMenu?: (row: TData) => ReactNode
  defaultPageSize?: number
  pageSizeOptions?: number[]
  rowClassName?: (row: TData) => string | undefined
  fitHeight?: boolean
  scrollAreaClassName?: string
}

type SizableColumnDef<TData, TValue> = ColumnDef<TData, TValue> & {
  size?: number
  minSize?: number
  maxSize?: number
}

function getColumnSizeStyle<TData, TValue>(columnDef: ColumnDef<TData, TValue>): CSSProperties | undefined {
  const sizing = columnDef as SizableColumnDef<TData, TValue>

  const hasSizing =
    typeof sizing.size === "number" ||
    typeof sizing.minSize === "number" ||
    typeof sizing.maxSize === "number"

  if (!hasSizing) return undefined

  return {
    width: typeof sizing.size === "number" ? `${sizing.size}px` : undefined,
    minWidth: typeof sizing.minSize === "number" ? `${sizing.minSize}px` : undefined,
    maxWidth: typeof sizing.maxSize === "number" ? `${sizing.maxSize}px` : undefined,
  }
}

function getPinnedColumnStyle<TData, TValue>(
  column: Column<TData, TValue>,
  isHeader: boolean,
): CSSProperties | undefined {
  const pin = column.getIsPinned()
  if (!pin) return undefined

  const offset = pin === "left" ? column.getStart("left") : column.getAfter("right")
  const edgeShadow = pin === "left"
    ? "inset -1px 0 0 var(--border), 6px 0 8px -8px var(--border)"
    : "inset 1px 0 0 var(--border), -6px 0 8px -8px var(--border)"

  const size = column.getSize()

  return {
    position: "sticky",
    width: `${size}px`,
    minWidth: `${size}px`,
    maxWidth: `${size}px`,
    left: pin === "left" ? `${offset}px` : undefined,
    right: pin === "right" ? `${offset}px` : undefined,
    zIndex: isHeader ? 11 : 1,
    boxShadow: edgeShadow,
  }
}

export function DataTable<TData, TValue>({
  columns,
  data,
  tableId,
  toolbar,
  layout,
  filterColumn = "title",
  filterPlaceholder = "Filter...",
  facetedFilters,
  intervalFilter,
  className,
  bulkActions,
  toolbarActions,
  rowContextMenu,
  defaultPageSize = 10,
  pageSizeOptions,
  rowClassName,
  fitHeight = false,
  scrollAreaClassName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: [], right: [] })
  const [rowSelection, setRowSelection] = useState({})

  const clearSelection = () => setRowSelection({})

  const resolvedFilterColumn = toolbar?.filterColumn ?? filterColumn
  const resolvedFilterPlaceholder = toolbar?.filterPlaceholder ?? filterPlaceholder
  const resolvedFacetedFilters = toolbar?.facetedFilters ?? facetedFilters
  const resolvedIntervalFilter = toolbar?.intervalFilter ?? intervalFilter
  const resolvedToolbarActions = toolbar?.actions ?? toolbarActions
  const resolvedSearchDebounceMs = toolbar?.searchDebounceMs
  const resolvedShowViewOptions = toolbar?.showViewOptions

  const resolvedFitHeight = layout?.fitHeight ?? fitHeight
  const resolvedScrollAreaClassName = layout?.scrollAreaClassName ?? scrollAreaClassName
  const resolvedTableHeaderClassName = layout?.tableHeaderClassName

  const table = useReactTable({
    data,
    columns,
    enableColumnPinning: true,
    enableMultiSort: true,
    enableSortingRemoval: false,
    isMultiSortEvent: () => true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: defaultPageSize } },
    state: { sorting, columnFilters, columnPinning, columnVisibility, rowSelection },
  })

  return (
    <div className={cn("relative flex flex-col gap-4", resolvedFitHeight && "h-full min-h-0", className)}>
      <DataTableToolbar
        table={table}
        tableId={tableId}
        filterColumn={resolvedFilterColumn}
        filterPlaceholder={resolvedFilterPlaceholder}
        facetedFilters={resolvedFacetedFilters}
        intervalFilter={resolvedIntervalFilter}
        actions={resolvedToolbarActions}
        searchDebounceMs={resolvedSearchDebounceMs}
        showViewOptions={resolvedShowViewOptions}
      />

      <div className={cn("overflow-auto rounded-md border scrollbar", resolvedFitHeight ? "min-h-0 flex-1" : "max-h-[calc(100svh-17rem)]", resolvedScrollAreaClassName)}>
        <Table containerClassName="overflow-visible">
          <TableHeader className={cn("sticky top-0 z-10 bg-background", resolvedTableHeaderClassName)}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="group">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.getIsPinned() &&
                        "bg-background transition-colors group-hover:bg-muted-hover",
                    )}
                    style={{
                      ...(header.column.getIsPinned() ? undefined : getColumnSizeStyle(header.column.columnDef)),
                      ...getPinnedColumnStyle(
                        header.column,
                        true,
                      ),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowEl = (
                  <TableRow 
                    key={row.id} 
                    className={cn("group", rowClassName?.(row.original))}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.getIsPinned() &&
                            "bg-background transition-colors group-hover:bg-muted-hover group-data-[state=selected]:bg-muted",
                        )}
                        style={{
                          ...(cell.column.getIsPinned() ? undefined : getColumnSizeStyle(cell.column.columnDef)),
                          ...getPinnedColumnStyle(
                            cell.column,
                            false,
                          ),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
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
