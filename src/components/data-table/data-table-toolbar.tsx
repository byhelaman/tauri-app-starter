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
import type { FacetedFilterConfig, IntervalFilterConfig, InfiniteScrollConfig } from "./data-table-types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  tableId: string
  searchable?: boolean
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: IntervalFilterConfig
  actions?: React.ReactNode | ((table: Table<TData>) => React.ReactNode)
  searchDebounceMs?: number
  showViewOptions?: boolean
  onSidePanelToggle?: () => void
  infiniteScroll?: InfiniteScrollConfig
  isSelectAllByFilter?: boolean
  excludedIds?: Set<string>
}

export function DataTableToolbar<TData>({
  table,
  tableId,
  searchable = false,
  filterPlaceholder = "Search...",
  facetedFilters,
  intervalFilter,
  actions,
  searchDebounceMs = 300,
  showViewOptions = true,
  onSidePanelToggle,
  infiniteScroll,
  isSelectAllByFilter,
  excludedIds,
}: DataTableToolbarProps<TData>) {
  const currentFilterValue = (table.getState().globalFilter as string) ?? ""

  const [searchInput, setSearchInput] = useState(currentFilterValue)

  // Mantiene el input sincronizado cuando el filtro cambia externamente (reset table, presets, etc.)
  useEffect(() => {
    setSearchInput(currentFilterValue)
  }, [currentFilterValue])

  // Debounce en la búsqueda — evita ejecutar el filtro en cada pulsación de tecla
  useEffect(() => {
    const timer = setTimeout(() => {
      table.setGlobalFilter(searchInput || undefined)
    }, searchDebounceMs)
    return () => clearTimeout(timer)
  }, [searchInput, table, searchDebounceMs])

  const hasSearchFilter = Boolean((table.getState().globalFilter as string)?.trim())

  const isFiltered = table.getState().columnFilters.length > 0 || hasSearchFilter
  const isSorted = table.getState().sorting.length > 0
  const activeFiltersCount = table.getState().columnFilters.length
  const hasFiltersList = (facetedFilters && facetedFilters.length > 0) || intervalFilter
  const renderedActions = typeof actions === "function" ? actions(table) : actions

  return (
    <div className="flex items-center gap-2">
      {searchable && (
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
            <InputGroupAddon align="inline-end">{table.getRowCount()} results</InputGroupAddon>
          )}
        </InputGroup>
      )}

      {/* Mobile Dropdown Filters — lg:hidden en el trigger Y en el content para que el portal también desaparezca al superar el breakpoint */}
      {hasFiltersList && (
        <div className="flex lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-dashed">
                <FilterIcon />
                Filters
                {activeFiltersCount > 0 && (
                  <>
                    <Separator orientation="vertical" className="mx-1 h-8" />
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                      {activeFiltersCount} active
                    </Badge>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-30 lg:hidden">
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
                    <DropdownMenuSubContent className="max-h-60 overflow-auto scrollbar lg:hidden">
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
                const availableHours = getAvailableHours(column, intervalFilter.hours)

                return (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Clock />
                      {intervalFilter.title}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-60 overflow-auto scrollbar lg:hidden">
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
            hours={intervalFilter.hours}
          />
        )}
      </div>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter(undefined)
            setSearchInput("")
          }}
        >
          Reset <X data-icon="inline-end" />
        </Button>
      )}

      {isSorted && (
        <Button variant="ghost" size="sm" onClick={() => table.resetSorting()}>
          Unsort <X data-icon="inline-end" />
        </Button>
      )}

      {renderedActions}

      {showViewOptions && <DataTableViewOptions table={table} tableId={tableId} onSidePanelToggle={onSidePanelToggle} infiniteScroll={infiniteScroll} isSelectAllByFilter={isSelectAllByFilter} excludedIds={excludedIds} />}
    </div>
  )
}
