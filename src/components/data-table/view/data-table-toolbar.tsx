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
import { DataTableFacetedFilter } from "../filters/data-table-faceted-filter"
import { DataTableIntervalFilter } from "../filters/data-table-interval-filter"
import { getAvailableHours } from "../filters/data-table-interval-filter-utils"
import { DataTableViewOptions } from "./data-table-view-options"
import { Autocomplete } from "@/components/ui/autocomplete"
import type { FacetedFilterConfig, IntervalFilterConfig, InfiniteScrollConfig } from "../core/data-table-types"
import { getDraftFilterValue, useTableFilterDraft } from "../filters/use-table-filter-draft"

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
  const {
    committedSearch,
    committedFilters,
    draftSearch,
    setDraftSearch,
    draftFilters,
    setDraftFilter,
    commit,
    reset,
    hasPendingChanges,
  } = useTableFilterDraft(table)

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
              commit(selectedValue)
            },
            placeholder: filterPlaceholder,
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
                commit(val)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commit()
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
                  commit()
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
                              setDraftFilter(
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
                              setDraftFilter(
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
              onDraftChange={(values) => setDraftFilter(filter.columnId, values)}
            />
          )
        })}

        {intervalFilter && (
          <DataTableIntervalFilter
            column={table.getColumn(intervalFilter.columnId)}
            title={intervalFilter.title}
            hours={intervalFilter.hours}
            draftValue={getDraftFilterValue(draftFilters, intervalFilter.columnId)}
            onDraftChange={(values) => setDraftFilter(intervalFilter.columnId, values)}
          />
        )}
      </div>

      {hasPendingChanges && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => commit()}
        >
          Search <SearchIcon data-icon="inline-end" />
        </Button>
      )}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
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
