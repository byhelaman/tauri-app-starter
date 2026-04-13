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
