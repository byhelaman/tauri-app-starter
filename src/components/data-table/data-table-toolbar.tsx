import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnFiltersState, Table } from "@tanstack/react-table"
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
import { DataTableIntervalFilter } from "./data-table-interval-filter"
import { getAvailableHours } from "./data-table-interval-filter-utils"
import { DataTableViewOptions } from "./data-table-view-options"
import { Autocomplete } from "@/components/ui/autocomplete"
import type { FacetedFilterConfig, IntervalFilterConfig, InfiniteScrollConfig } from "./data-table-types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  tableId: string
  searchable?: boolean
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: IntervalFilterConfig
  actions?: React.ReactNode | ((table: Table<TData>) => React.ReactNode)
  showViewOptions?: boolean
  onSidePanelToggle?: () => void
  infiniteScroll?: InfiniteScrollConfig
  allowDataExport?: boolean
  allowDataCopy?: boolean
  viewActionsMode?: "full" | "bulk-copy" | "view" | "none"
  viewMenuItems?: React.ReactNode | ((table: Table<TData>) => React.ReactNode)
  resultCountMode?: "server" | "client"
  onResetTable?: () => void
  searchAutocomplete?: { label: string; value: string }[]
  renderSearchInput?: (props: {
    value: string
    onChange: (value: string) => void
    onCommit: (selectedValue?: string) => void
    placeholder?: string
  }) => React.ReactNode
}

// ── Helpers para comparar drafts con el estado actual ──────────────────────

function filtersEqual(a: ColumnFiltersState, b: ColumnFiltersState): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    const va = a[i].value
    const vb = b[i].value
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length || va.some((v, j) => v !== vb[j])) return false
    } else if (va !== vb) {
      return false
    }
  }
  return true
}

function getDraftFilterValue(draftFilters: ColumnFiltersState, columnId: string): string[] | undefined {
  const entry = draftFilters.find(f => f.id === columnId)
  if (!entry) return undefined
  return Array.isArray(entry.value) ? (entry.value as string[]) : undefined
}

function setDraftFilterValue(
  prev: ColumnFiltersState,
  columnId: string,
  values: string[] | undefined
): ColumnFiltersState {
  const without = prev.filter(f => f.id !== columnId)
  if (!values || values.length === 0) return without
  return [...without, { id: columnId, value: values }]
}

export function DataTableToolbar<TData>({
  table,
  tableId,
  searchable = false,
  filterPlaceholder = "Search...",
  facetedFilters,
  intervalFilter,
  actions,
  showViewOptions = true,
  onSidePanelToggle,
  infiniteScroll,
  allowDataExport,
  allowDataCopy,
  viewActionsMode = "full",
  viewMenuItems,
  resultCountMode = "server",
  onResetTable,
  searchAutocomplete,
  renderSearchInput,
}: DataTableToolbarProps<TData>) {
  // ── Estado real (commitido) ────────────────────────────────────────────
  const committedSearch = (table.getState().globalFilter as string) ?? ""
  const committedFilters = table.getState().columnFilters

  // ── Estado draft (pendiente de commit) ─────────────────────────────────
  const [draftSearch, setDraftSearch] = useState(committedSearch)
  const [draftFilters, setDraftFilters] = useState<ColumnFiltersState>(committedFilters)

  // Sincroniza drafts cuando el estado real cambia externamente (reset, presets, etc.)
  useEffect(() => {
    setDraftSearch(committedSearch)
  }, [committedSearch])

  useEffect(() => {
    setDraftFilters(committedFilters)
  }, [committedFilters])

  // ── Commit: empuja drafts al estado real ───────────────────────────────
  const commitFilters = useCallback(() => {
    table.setGlobalFilter(draftSearch || undefined)
    // Aplica cada filtro draft al table
    const currentIds = new Set(committedFilters.map(f => f.id))
    const draftIds = new Set(draftFilters.map(f => f.id))
    // Limpia filtros que se quitaron del draft
    for (const id of currentIds) {
      if (!draftIds.has(id)) {
        table.getColumn(id)?.setFilterValue(undefined)
      }
    }
    // Aplica filtros del draft
    for (const filter of draftFilters) {
      table.getColumn(filter.id)?.setFilterValue(filter.value)
    }
  }, [table, draftSearch, draftFilters, committedFilters])

  // ── Detección de cambios pendientes ────────────────────────────────────
  const hasPendingChanges = useMemo(() => {
    if (draftSearch !== committedSearch) return true
    return !filtersEqual(draftFilters, committedFilters)
  }, [draftSearch, committedSearch, draftFilters, committedFilters])

  // ── Draft filter change handler para faceted/interval filters ──────────
  const handleDraftFilterChange = useCallback((columnId: string, values: string[] | undefined) => {
    setDraftFilters(prev => setDraftFilterValue(prev, columnId, values))
  }, [])

  // ── UI state ───────────────────────────────────────────────────────────
  const hasSearchFilter = Boolean(committedSearch.trim())
  const isFiltered = committedFilters.length > 0 || hasSearchFilter
  const isSorted = table.getState().sorting.length > 0
  const activeFiltersCount = committedFilters.length
  const hasFiltersList = (facetedFilters && facetedFilters.length > 0) || intervalFilter
  const renderedActions = typeof actions === "function" ? actions(table) : actions
  const renderedViewMenuItems = typeof viewMenuItems === "function" ? viewMenuItems(table) : viewMenuItems
  const resultCount = resultCountMode === "server"
    ? infiniteScroll?.totalRowCount ?? table.getFilteredRowModel().rows.length
    : table.getFilteredRowModel().rows.length

  return (
    <div className="flex items-center gap-2">
      {searchable && (
        renderSearchInput ? (
          renderSearchInput({
            value: draftSearch,
            onChange: setDraftSearch,
            onCommit: (selectedValue) => {
              if (selectedValue !== undefined) setDraftSearch(selectedValue)
              table.setGlobalFilter(selectedValue !== undefined ? (selectedValue || undefined) : (draftSearch || undefined))
              // Sync draft filters too
              for (const filter of draftFilters) {
                table.getColumn(filter.id)?.setFilterValue(filter.value)
              }
            },
            placeholder: filterPlaceholder
          })
        ) : searchAutocomplete ? (
          <div
            className="group/input-group cursor-text relative flex h-8 w-full max-w-xs shrink-0 items-center rounded-lg border border-input transition-colors outline-none has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 dark:bg-input/30"
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName !== "INPUT") {
                e.currentTarget.querySelector("input")?.focus()
              }
            }}
          >
            <div className="flex items-center justify-center py-1.5 pl-2 text-muted-foreground [&>svg:not([class*='size-'])]:size-4">
              <SearchIcon />
            </div>
            <Autocomplete
              value={draftSearch}
              options={searchAutocomplete}
              placeholder={filterPlaceholder}
              filterClientSide={false}
              onInputValueChange={(val) => {
                setDraftSearch(val)
              }}
              onChange={(val) => {
                setDraftSearch(val)
                // Auto-commit cuando el usuario elige una sugerencia
                table.setGlobalFilter(val || undefined)
                // Sync draft filters too
                for (const filter of draftFilters) {
                  table.getColumn(filter.id)?.setFilterValue(filter.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitFilters()
                }
              }}
              wrapperClassName="flex-1 min-w-0"
              className="flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent h-8"
            />
            {isFiltered && (
              <div className="ml-auto flex items-center pr-2 text-sm text-muted-foreground select-none">
                {resultCount.toLocaleString()} results
              </div>
            )}
          </div>
        ) : (
          <InputGroup className="max-w-xs shrink-0">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={filterPlaceholder}
              value={draftSearch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraftSearch(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitFilters()
                }
              }}
            />
            {isFiltered && (
              <InputGroupAddon align="inline-end">
                {resultCount.toLocaleString()} results
              </InputGroupAddon>
            )}
          </InputGroup>
        )
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
                const draftValue = getDraftFilterValue(draftFilters, filter.columnId)
                const selectedValues = new Set(draftValue ?? [])

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
                              handleDraftFilterChange(
                                filter.columnId,
                                next.size ? Array.from(next) : undefined
                              )
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
                const draftValue = getDraftFilterValue(draftFilters, intervalFilter.columnId)
                const selectedValues = new Set(draftValue ?? [])
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
                              handleDraftFilterChange(
                                intervalFilter.columnId,
                                next.size ? Array.from(next) : undefined
                              )
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
              draftValue={getDraftFilterValue(draftFilters, filter.columnId)}
              onDraftChange={(values) => handleDraftFilterChange(filter.columnId, values)}
            />
          )
        })}

        {intervalFilter && (
          <DataTableIntervalFilter
            column={table.getColumn(intervalFilter.columnId)}
            title={intervalFilter.title}
            hours={intervalFilter.hours}
            draftValue={getDraftFilterValue(draftFilters, intervalFilter.columnId)}
            onDraftChange={(values) => handleDraftFilterChange(intervalFilter.columnId, values)}
          />
        )}
      </div>

      {hasPendingChanges && (
        <Button
          variant="secondary"
          size="sm"
          onClick={commitFilters}
        >
          Search <SearchIcon data-icon="inline-end" />
        </Button>
      )}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter(undefined)
            setDraftSearch("")
            setDraftFilters([])
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

      {showViewOptions && (
        <DataTableViewOptions
          table={table}
          tableId={tableId}
          onSidePanelToggle={onSidePanelToggle}
          infiniteScroll={infiniteScroll}
          allowDataExport={allowDataExport}
          allowDataCopy={allowDataCopy}
          mode={viewActionsMode}
          onResetTable={onResetTable}
          menuItems={renderedViewMenuItems}
        />
      )}
    </div>
  )
}
