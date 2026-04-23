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
  searchable?: boolean
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

export interface HistoryDetail {
  field: string
  oldValue?: string | number
  newValue?: string | number
}

export interface HistoryEntry {
  id: string
  action: "create" | "update" | "delete"
  description: string
  actorEmail: string
  createdAt: string
  details?: HistoryDetail[]
}
