import { useEffect, useState } from "react"
import type { Table } from "@tanstack/react-table"
import { SearchIcon, X, FilterIcon, Clock, PlusCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableIntervalFilter, getAvailableHours } from "./data-table-interval-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import type { FacetedFilterConfig } from "./data-table-types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  tableId: string
  filterColumn?: string
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: { columnId: string; title?: string }
  actions?: React.ReactNode
}

export function DataTableToolbar<TData>({
  table,
  tableId,
  filterColumn = "title",
  filterPlaceholder = "Search...",
  facetedFilters,
  intervalFilter,
  actions,
}: DataTableToolbarProps<TData>) {
  const currentFilterValue = (table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""
  const [searchInput, setSearchInput] = useState(currentFilterValue)

  // Debounce en la búsqueda — evita ejecutar el filtro en cada pulsación de tecla
  useEffect(() => {
    const timer = setTimeout(() => {
      table.getColumn(filterColumn)?.setFilterValue(searchInput || undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, filterColumn, table])

  const isFiltered = table.getState().columnFilters.length > 0
  const isSorted = table.getState().sorting.length > 0
  const activeFiltersCount = table.getState().columnFilters.length
  const hasFiltersList = (facetedFilters && facetedFilters.length > 0) || intervalFilter

  return (
    <div className="flex items-center gap-2">
      {table.getColumn(filterColumn) && (
        <InputGroup className="max-w-xs shrink-0">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={filterPlaceholder}
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
          />
          {isFiltered && (
            <InputGroupAddon align="inline-end">{table.getFilteredRowModel().rows.length} results</InputGroupAddon>
          )}
        </InputGroup>
      )}

      {/* Mobile Dropdown Filters */}
      {hasFiltersList && (
        <div className="flex lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-dashed">
                <FilterIcon data-icon="inline-start" />
                Filters
                {activeFiltersCount > 0 && (
                  <>
                    <Separator orientation="vertical" className="mx-1 h-8" />
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                      {activeFiltersCount}
                    </Badge>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-30">
              {facetedFilters?.map((filter) => {
                const column = table.getColumn(filter.columnId)
                if (!column) return null
                const filterValue = column.getFilterValue()
                const selectedValues = new Set(Array.isArray(filterValue) ? (filterValue as string[]) : [])
                
                return (
                  <DropdownMenuSub key={filter.columnId}>
                    <DropdownMenuSubTrigger>
                      <PlusCircle />
                      {filter.title}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-60 overflow-auto scrollbar">
                      {filter.options.map((opt) => {
                        const checked = selectedValues.has(opt.value)
                        return (
                          <DropdownMenuCheckboxItem
                            key={opt.value}
                            checked={checked}
                            onCheckedChange={(c) => {
                              const next = new Set(selectedValues)
                              if (c) next.add(opt.value)
                              else next.delete(opt.value)
                              column.setFilterValue(next.size ? Array.from(next) : undefined)
                            }}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {opt.icon && <opt.icon />}
                            {opt.label}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })}

              {intervalFilter && (() => {
                const column = table.getColumn(intervalFilter.columnId)
                if (!column) return null
                const filterValue = column.getFilterValue()
                const selectedValues = new Set(Array.isArray(filterValue) ? (filterValue as string[]) : [])
                const availableHours = getAvailableHours(column)

                return (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Clock />
                      {intervalFilter.title}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-60 overflow-auto scrollbar">
                      {availableHours.map((hour) => {
                        const checked = selectedValues.has(hour)
                        return (
                          <DropdownMenuCheckboxItem
                            key={hour}
                            checked={checked}
                            onCheckedChange={(c) => {
                              const next = new Set(selectedValues)
                              if (c) next.add(hour)
                              else next.delete(hour)
                              column.setFilterValue(next.size ? Array.from(next) : undefined)
                            }}
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Clock />
                            {hour}:00
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })()}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Desktop Inline Filters */}
      <div className="hidden lg:flex items-center gap-2">
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

        {intervalFilter && (
          <DataTableIntervalFilter
            column={table.getColumn(intervalFilter.columnId)}
            title={intervalFilter.title}
          />
        )}
      </div>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => { table.resetColumnFilters(); setSearchInput("") }}>
          Reset <X data-icon="inline-end" />
        </Button>
      )}

      {isSorted && (
        <Button variant="ghost" size="sm" onClick={() => table.resetSorting()}>
          Unsort <X data-icon="inline-end" />
        </Button>
      )}

      {actions}

      <DataTableViewOptions table={table} tableId={tableId} />
    </div>
  )
}
