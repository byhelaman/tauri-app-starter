import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  type ColumnDef,
  type ColumnFiltersState,
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
import { DataTableToolbar } from "./data-table-toolbar"
import { DataTablePagination } from "./data-table-pagination"
import type { FacetedFilterConfig } from "./data-table-types"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterColumn?: string
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  className?: string
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn = "title",
  filterPlaceholder = "Filter...",
  facetedFilters,
  className,
  bulkActions,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})

  const clearSelection = () => setRowSelection({})

  const table = useReactTable({
    data,
    columns,
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
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: 10 } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  })

  return (
    <div className={cn("relative flex flex-col gap-4", className)}>
      <DataTableToolbar
        table={table}
        filterColumn={filterColumn}
        filterPlaceholder={filterPlaceholder}
        facetedFilters={facetedFilters}
      />

      <div className="overflow-auto max-h-[calc(100svh-17rem)] rounded-md border scrollbar">
        <Table containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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

      <DataTablePagination table={table} />

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
