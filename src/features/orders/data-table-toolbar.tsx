import type { Table } from "@tanstack/react-table"
import { SearchIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import type { FacetedFilterConfig } from "./data-table-types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  tableId: string
  filterColumn?: string
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
}

export function DataTableToolbar<TData>({
  table,
  tableId,
  filterColumn = "title",
  filterPlaceholder = "Search...",
  facetedFilters,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0
  const isSorted = table.getState().sorting.length > 0

  return (
    <div className="flex items-center gap-2">
      {table.getColumn(filterColumn) && (
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={filterPlaceholder}
            value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => table.getColumn(filterColumn)?.setFilterValue(e.target.value)}
          />
          {isFiltered && (
            <InputGroupAddon align="inline-end">{table.getFilteredRowModel().rows.length} results</InputGroupAddon>
          )}
        </InputGroup>
      )}

      {facetedFilters?.map((filter) => {
        const column = table.getColumn(filter.columnId)
        if (!column) return null

        return (
          <DataTableFacetedFilter
            key={filter.columnId}
            column={column}
            title={filter.title}
            options={filter.options}
          />
        )
      })}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetColumnFilters()}
        >
          Reset
          <X />
        </Button>
      )}

      {isSorted && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetSorting()}
        >
          Unsort
          <X />
        </Button>
      )}

      <DataTableViewOptions table={table} tableId={tableId} />
    </div>
  )
}
