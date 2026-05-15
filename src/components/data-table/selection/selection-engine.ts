import type { ColumnFiltersState, RowSelectionState, SortingState, Updater } from "@tanstack/react-table"
import type { DataTableSelectionOperation, DataTableSelectionScope, DataTableSelectionState } from "../core/data-table-types"
import { filterValues, normalizeFilters, normalizeHourValue } from "@/lib/table-filter-normalization"

export function normalizeScope(scope: DataTableSelectionScope): DataTableSelectionScope {
  return {
    search: scope.search || "",
    filters: normalizeFilters(scope.filters),
    date: scope.date,
    sorting: scope.sorting ?? [],
  }
}

export function createSelectionScope({
  search,
  filters,
  date,
  sorting,
}: {
  search: string
  filters: ColumnFiltersState
  date?: string
  sorting: SortingState
}): DataTableSelectionScope {
  return normalizeScope({
    search: search || "",
    filters,
    date,
    sorting,
  })
}

export function operationKey(operation: DataTableSelectionOperation): string {
  if (operation.type === "selectIds" || operation.type === "deselectIds") {
    return JSON.stringify({ type: operation.type, ids: [...operation.ids].sort() })
  }
  return JSON.stringify({ type: operation.type, scope: normalizeScope(operation.scope) })
}

export function scopeKey(scope: DataTableSelectionScope): string {
  return JSON.stringify(normalizeScope(scope))
}

export function scopeContains(parent: DataTableSelectionScope, child: DataTableSelectionScope): boolean {
  const normalizedParent = normalizeScope(parent)
  const normalizedChild = normalizeScope(child)

  if (normalizedParent.search && normalizedParent.search !== normalizedChild.search) return false
  if (normalizedParent.date && normalizedParent.date !== normalizedChild.date) return false

  const childFilters = new Map(normalizedChild.filters.map((filter) => [filter.id, filterValues(filter)]))
  for (const parentFilter of normalizedParent.filters) {
    const parentValues = filterValues(parentFilter)
    if (parentValues.length === 0) continue

    const childValues = childFilters.get(parentFilter.id)
    if (!childValues || childValues.length === 0) return false

    const parentSet = new Set(parentValues)
    if (!childValues.every((value) => parentSet.has(value))) return false
  }

  return true
}

export function dedupeOperations(operations: DataTableSelectionOperation[]): DataTableSelectionOperation[] {
  const result: DataTableSelectionOperation[] = []
  const latestByKey = new Map<string, number>()
  for (const operation of operations) {
    const key = operationKey(operation)
    const previousIndex = latestByKey.get(key)
    if (previousIndex !== undefined) result.splice(previousIndex, 1)
    latestByKey.clear()
    result.push(operation)
    result.forEach((item, index) => latestByKey.set(operationKey(item), index))
  }
  return result
}

export function idsToRowSelection(ids: string[]): RowSelectionState {
  return Object.fromEntries(ids.map((id) => [id, true]))
}

export function rowMatchesScope(row: Record<string, unknown> | undefined, scope: DataTableSelectionScope): boolean {
  if (!row) return false

  const search = scope.search?.trim().toLowerCase()
  if (search) {
    const haystack = Object.values(row)
      .filter((value) => value != null && typeof value !== "object")
      .map(String)
      .join(" ")
      .toLowerCase()
    if (!haystack.includes(search)) return false
  }

  if (scope.date && String(row.date ?? "") !== scope.date) return false

  for (const filter of normalizeFilters(scope.filters)) {
    const values = filterValues(filter)
    if (values.length === 0) continue

    if (filter.id === "time") {
      const hour = normalizeHourValue(String(row.start_time ?? "").split(":")[0] ?? "")
      if (!hour || !values.includes(hour)) return false
      continue
    }

    if (!values.includes(String(row[filter.id] ?? ""))) return false
  }

  return true
}

export function rowIsSelectedByOperations(
  id: string,
  row: Record<string, unknown> | undefined,
  operations: DataTableSelectionOperation[]
): boolean {
  let selected = false
  for (const operation of operations) {
    if (operation.type === "selectIds") {
      if (operation.ids.includes(id)) selected = true
      continue
    }
    if (operation.type === "deselectIds") {
      if (operation.ids.includes(id)) selected = false
      continue
    }
    if (rowMatchesScope(row, operation.scope)) {
      selected = operation.type === "select"
    }
  }
  return selected
}

export function fallbackSelectedCount(
  selection: DataTableSelectionState,
  loadedRowIds: string[],
  loadedRowsById: Record<string, Record<string, unknown>>
): number {
  if (selection.mode === "ids") return selection.ids.length
  return loadedRowIds.filter((id) => rowIsSelectedByOperations(id, loadedRowsById[id], selection.operations)).length
}

export function exactScopeSelectionCount(
  operations: DataTableSelectionOperation[],
  currentScope: DataTableSelectionScope,
  totalRowCount: number,
  loadedRowsById: Record<string, Record<string, unknown>>
): number | null {
  const currentKey = scopeKey(currentScope)
  let count: number | null = null

  for (const operation of operations) {
    if (operation.type === "select" || operation.type === "deselect") {
      if (scopeKey(operation.scope) === currentKey || scopeContains(operation.scope, currentScope)) {
        count = operation.type === "select" ? totalRowCount : 0
      } else if (scopeContains(currentScope, operation.scope)) {
        if (operation.type === "deselect" && count !== null) {
          count = Math.max(0, count - operation.total)
        } else if (operation.type === "select" && count === null) {
          count = operation.total
        } else if (count !== null) {
          return null
        }
      } else if (count !== null) {
        return null
      }
      continue
    }

    const matchingIds = operation.ids.filter((id) => rowMatchesScope(loadedRowsById[id], currentScope))
    if (operation.type === "selectIds") {
      count = Math.min(totalRowCount, (count ?? 0) + matchingIds.length)
    } else if (count !== null) {
      count = Math.max(0, count - matchingIds.length)
    }
  }

  return count
}

export function exactGlobalSelectionCount(
  operations: DataTableSelectionOperation[],
  totalRowCount: number,
  unfilteredTotalRowCount: number | undefined,
  loadedRowsById: Record<string, Record<string, unknown>>
): number | null {
  return exactScopeSelectionCount(
    operations,
    { search: "", filters: [], sorting: [] },
    unfilteredTotalRowCount ?? totalRowCount,
    loadedRowsById
  )
}

function operationsFromPrevious(previous: DataTableSelectionState): DataTableSelectionOperation[] {
  return previous.mode === "operations"
    ? previous.operations
    : previous.ids.length > 0
      ? [{ type: "selectIds", ids: previous.ids }]
      : []
}

export function selectScope(
  previous: DataTableSelectionState,
  scope: DataTableSelectionScope,
  total: number
): DataTableSelectionState {
  return {
    mode: "operations",
    operations: dedupeOperations([
      ...operationsFromPrevious(previous),
      { type: "select", scope, total },
    ]),
  }
}

export function deselectScope(
  previous: DataTableSelectionState,
  scope: DataTableSelectionScope,
  total: number
): DataTableSelectionState {
  return {
    mode: "operations",
    operations: dedupeOperations([
      ...operationsFromPrevious(previous),
      { type: "deselect", scope, total },
    ]),
  }
}

export function applyRowSelectionChange(
  previous: DataTableSelectionState,
  loadedRowIds: string[],
  loadedRowsById: Record<string, Record<string, unknown>>,
  updater: Updater<RowSelectionState>
): DataTableSelectionState {
  const previousRows = previous.mode === "ids"
    ? idsToRowSelection(previous.ids)
    : idsToRowSelection(loadedRowIds.filter((id) => rowIsSelectedByOperations(id, loadedRowsById[id], previous.operations)))
  const nextRows = typeof updater === "function" ? updater(previousRows) : updater
  const selectedIds: string[] = []
  const deselectedIds: string[] = []

  for (const id of loadedRowIds) {
    const wasSelected = !!previousRows[id]
    const isSelected = !!nextRows[id]
    if (!wasSelected && isSelected) selectedIds.push(id)
    if (wasSelected && !isSelected) deselectedIds.push(id)
  }

  if (previous.mode === "ids") {
    return { mode: "ids", ids: Object.keys(nextRows).filter((id) => nextRows[id]) }
  }

  const operations = [...previous.operations]
  if (selectedIds.length > 0) operations.push({ type: "selectIds", ids: selectedIds })
  if (deselectedIds.length > 0) operations.push({ type: "deselectIds", ids: deselectedIds })
  return {
    mode: "operations",
    operations: dedupeOperations(operations),
  }
}
