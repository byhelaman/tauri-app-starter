import type { ColumnFiltersState } from "@tanstack/react-table"

const COMPLETE_FILTER_VALUES: Record<string, string[]> = {
  channel: ["Online", "Retail", "Partner", "Phone"],
  priority: ["High", "Medium", "Low"],
  status: ["cancelled", "delivered", "pending", "processing", "shipped"],
}

export function normalizeHourValue(value: unknown): string | null {
  const hour = Number.parseInt(String(value), 10)
  return Number.isFinite(hour) ? String(hour) : null
}

export function normalizeFilterValues(filterId: string, value: unknown): unknown {
  if (!Array.isArray(value)) return value
  const normalized = filterId === "time"
    ? value.map(normalizeHourValue).filter((hour): hour is string => Boolean(hour))
    : value.map(String)
  return Array.from(new Set(normalized)).sort()
}

function isCompleteFilter(filterId: string, values: string[]): boolean {
  const completeValues = COMPLETE_FILTER_VALUES[filterId]
  if (!completeValues) return false
  if (values.length !== completeValues.length) return false
  const selected = new Set(values)
  return completeValues.every((value) => selected.has(value))
}

export function normalizeFilters(filters: ColumnFiltersState): ColumnFiltersState {
  return filters
    .map((filter) => ({ id: filter.id, value: normalizeFilterValues(filter.id, filter.value) }))
    .filter((filter) => {
      if (!Array.isArray(filter.value)) return true
      const values = filter.value.map(String)
      return values.length > 0 && !isCompleteFilter(filter.id, values)
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function filterValues(filter: ColumnFiltersState[number]): string[] {
  const value = normalizeFilterValues(filter.id, filter.value)
  return Array.isArray(value) ? value.map(String) : []
}

export function pickNormalizedFilter(filters: ColumnFiltersState, id: string): string[] | null {
  const filter = normalizeFilters(filters).find((item) => item.id === id)
  if (!filter) return null
  const values = filterValues(filter)
  return values.length > 0 ? values : null
}

export function pickNormalizedHourFilter(filters: ColumnFiltersState): string[] | null {
  return pickNormalizedFilter(filters, "time")
}
