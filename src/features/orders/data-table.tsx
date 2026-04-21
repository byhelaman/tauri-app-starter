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
  isEdge: boolean,
  isFirst: boolean,
): CSSProperties | undefined {
  const pin = column.getIsPinned()
  if (!pin) return undefined

  const offset = pin === "left" ? column.getStart("left") : column.getAfter("right")
  const size = column.getSize()

  const accentShadow = isFirst && pin === "left" && !isHeader
    ? "inset 2px 0 0 0 var(--highlight-accent, transparent)"
    : undefined

  const edgeShadow = isEdge
    ? pin === "left"
      ? "inset -1px 0 0 var(--border), 6px 0 8px -8px var(--border)"
      : "inset 1px 0 0 var(--border), -6px 0 8px -8px var(--border)"
    : undefined

  const shadows = [accentShadow, edgeShadow].filter(Boolean).join(", ") || undefined

  return {
    position: "sticky",
    width: `${size}px`,
    minWidth: `${size}px`,
    maxWidth: `${size}px`,
    left: pin === "left" ? `${offset}px` : undefined,
    right: pin === "right" ? `${offset}px` : undefined,
    zIndex: isHeader ? 11 : 1,
    boxShadow: shadows,
  }
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: ["select"], right: [] })
  const [rowSelection, setRowSelection] = useState({})

  const clearSelection = () => setRowSelection({})

  const fitHeight = layout?.fitHeight ?? false
  const scrollAreaClassName = layout?.scrollAreaClassName
  const tableHeaderClassName = layout?.tableHeaderClassName
  const tableBgClassName = layout?.tableBgClassName ?? "bg-background"
  const tableBgHoverClassName = layout?.tableBgHoverClassName ?? "group-hover:bg-[var(--highlight-bg-hover,var(--color-muted-hover))]"

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
        filterColumn={toolbar?.filterColumn}
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
          <TableHeader className={cn("sticky top-0 z-10", tableBgClassName, tableHeaderClassName)}>
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
                        cn(tableBgClassName, "transition-colors", tableBgHoverClassName),
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowEl = (
                  <TableRow 
                    key={row.id} 
                    className={cn("group", rowClassName?.(row.original))}
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
                            cn(tableBgClassName, "transition-colors group-data-[state=selected]:bg-muted", tableBgHoverClassName),
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
