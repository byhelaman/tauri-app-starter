import type { ReactNode } from "react"
import type { Table } from "@tanstack/react-table"

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

export interface FacetedFilterConfig {
  columnId: string
  title: string
  options: FacetedFilterOption[]
}

export interface IntervalFilterConfig {
  columnId: string
  title?: string
}

export type ToolbarActionsRenderer<TData> = ReactNode | ((table: Table<TData>) => ReactNode)

export interface DataTableToolbarConfig<TData> {
  filterPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  intervalFilter?: IntervalFilterConfig
  actions?: ToolbarActionsRenderer<TData>
  searchDebounceMs?: number
  showViewOptions?: boolean
}

export interface DataTableLayoutConfig {
  fitHeight?: boolean
  scrollAreaClassName?: string
  tableHeaderClassName?: string
}
