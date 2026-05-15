import type { InfiniteData } from "@tanstack/react-query"
import type { ColumnFiltersState } from "@tanstack/react-table"
import type {
  DataTableSelectionOperation,
  DataTableSelectionScope,
  DataTableSelectionState,
} from "@/components/data-table/core/data-table-types"
import { pickNormalizedFilter, pickNormalizedHourFilter } from "@/lib/table-filter-normalization"
import type { Order } from "../tables/columns"

export type OrdersPage = { data: Order[]; total: number }
export type OrdersInfiniteData = InfiniteData<OrdersPage>

function pickFilterValues(filters: ColumnFiltersState, id: string): string[] {
  return pickNormalizedFilter(filters, id) ?? []
}

export function orderMatchesActiveQuery(order: Order, {
  filters,
  search,
  date,
}: {
  filters: ColumnFiltersState
  search?: string
  date?: string
}) {
  if (date && order.date !== date) return false

  const status = pickFilterValues(filters, "status")
  if (status.length > 0 && !status.includes(order.status)) return false

  const channel = pickFilterValues(filters, "channel")
  if (channel.length > 0 && !channel.includes(order.channel)) return false

  const priority = pickFilterValues(filters, "priority")
  if (priority.length > 0 && !priority.includes(order.priority)) return false

  const hours = pickNormalizedHourFilter(filters) ?? []
  if (hours.length > 0) {
    const startHour = String(Number.parseInt(String(order.start_time ?? "").split(":")[0] ?? "", 10))
    if (!hours.includes(startHour)) return false
  }

  const query = (search ?? "").trim().toLowerCase()
  if (query) {
    const haystack = [order.customer, order.code, order.product]
      .filter(Boolean)
      .map(String)
      .join(" ")
      .toLowerCase()
    if (!haystack.includes(query)) return false
  }

  return true
}

export function orderMatchesScope(order: Order, scope: DataTableSelectionScope) {
  return orderMatchesActiveQuery(order, {
    filters: scope.filters,
    search: scope.search,
    date: scope.date,
  })
}

function operationSelectsOrder(order: Order, operation: DataTableSelectionOperation) {
  if (operation.type === "selectIds" || operation.type === "deselectIds") {
    return operation.ids.includes(order.id)
  }
  return orderMatchesScope(order, operation.scope)
}

export function orderIsSelectedByOperations(order: Order, operations: DataTableSelectionOperation[]) {
  let selected = false
  for (const operation of operations) {
    if (operationSelectsOrder(order, operation)) {
      selected = operation.type === "select" || operation.type === "selectIds"
    }
  }
  return selected
}

export function applyOptimisticOrderUpdate(
  old: OrdersInfiniteData | undefined,
  delta: Partial<Order> & { id: string },
  activeQuery: { filters: ColumnFiltersState; search?: string; date?: string }
) {
  if (!old) return old
  let removedFromResult = false
  const pages = old.pages.map(page => {
    const data = page.data.flatMap((order) => {
      if (order.id !== delta.id) return [order]
      const nextOrder = { ...order, ...delta }
      if (orderMatchesActiveQuery(nextOrder, activeQuery)) return [nextOrder]
      removedFromResult = true
      return []
    })
    return { ...page, data }
  })

  return {
    ...old,
    pages: removedFromResult
      ? pages.map(page => ({ ...page, total: Math.max(0, page.total - 1) }))
      : pages,
  }
}

export function applyOptimisticOrderDelete(old: OrdersInfiniteData | undefined, id: string) {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map(page => {
      const hadOrder = page.data.some(order => order.id === id)
      return {
        data: page.data.filter(order => order.id !== id),
        total: hadOrder ? page.total - 1 : page.total,
      }
    }),
  }
}

export function applyOptimisticBulkDelete(
  old: OrdersInfiniteData | undefined,
  selection: DataTableSelectionState
) {
  if (!old) return old
  const selectedIds = selection.mode === "ids" ? selection.ids : []
  const idSet = new Set(selectedIds)

  return {
    ...old,
    pages: old.pages.map(page => ({
      data: selection.mode === "ids"
        ? page.data.filter(order => !idSet.has(order.id))
        : page.data.filter(order => !orderIsSelectedByOperations(order, selection.operations)),
      // A bulk selection can span filters, so the exact effect on the current
      // query total is only known after the server confirms and refetches.
      total: page.total,
    })),
  }
}
