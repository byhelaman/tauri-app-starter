import { useCallback, useMemo, useState } from "react"
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { type ColumnFiltersState, type Updater, type SortingState } from "@tanstack/react-table"
import { toast } from "sonner"
import * as api from "../api"
import type { Order, EditableOrderField, Status } from "../columns"
import { useOrdersRealtime } from "./useOrdersRealtime"
import type { DataTableSelectionOperation, DataTableSelectionScope, DataTableSelectionState } from "@/components/data-table/data-table-types"
import { pickNormalizedFilter, pickNormalizedHourFilter } from "@/lib/table-filter-normalization"

/** Número de filas por chunk en modo infinite scroll */
const ORDER_CHUNK = 1000

function pickFilterValues(filters: ColumnFiltersState, id: string): string[] {
  return pickNormalizedFilter(filters, id) ?? []
}

function orderMatchesActiveQuery(order: Order, {
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
    const startHour = String(order.start_time ?? "").split(":")[0]
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

function orderMatchesScope(order: Order, scope: DataTableSelectionScope) {
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

function orderIsSelectedByOperations(order: Order, operations: DataTableSelectionOperation[]) {
  let selected = false
  for (const operation of operations) {
    if (operationSelectsOrder(order, operation)) {
      selected = operation.type === "select" || operation.type === "selectIds"
    }
  }
  return selected
}

export function useOrders({
  dateFilter,
  sorting = [],
  queryScope = "orders",
  realtime = true,
  enabled = true,
}: {
  dateFilter?: string
  sorting?: SortingState
  queryScope?: string
  realtime?: boolean
  enabled?: boolean
} = {}) {
  const queryClient = useQueryClient()
  useOrdersRealtime(realtime)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  // Resetea los filtros sin necesidad de resetear una página (ya no hay paginación)
  const handleSetColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  const handleSetGlobalFilter = useCallback((updater: Updater<string>) => {
    setGlobalFilter(prev => typeof updater === "function" ? updater(prev) : updater)
  }, [])

  // Clave de query — incluye filtros para que al cambiar se refetche desde chunk 0
  const ordersQueryKey = useMemo(
    () => ["orders", "infinite", queryScope, columnFilters, globalFilter, dateFilter, sorting] as const,
    [columnFilters, dateFilter, globalFilter, queryScope, sorting]
  )

  const {
    data: infiniteData,
    isFetching: isPageFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ordersQueryKey,
    queryFn: ({ pageParam = 0 }) => api.fetchOrders({
      limit:   ORDER_CHUNK,
      offset:  pageParam as number,
      search:  globalFilter,
      filters: columnFilters,
      date:    dateFilter,
      sorting,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Si la última página está llena, puede haber más
      if (lastPage.data.length < ORDER_CHUNK) return undefined
      return allPages.length * ORDER_CHUNK
    },
    enabled,
  })

  const pages = infiniteData?.pages
  // Aplana todas las páginas solo cuando cambia la data del infinite query.
  const pageData = useMemo(() => pages?.flatMap(p => p.data) ?? [], [pages])
  // Usa el total de la última página cargada — es el más reciente del servidor.
  const cachedRowCount = useMemo(() => pages?.[pages.length - 1]?.total ?? 0, [pages])

  const { data: unfilteredCountData } = useQuery({
    queryKey: ["orders", "unfiltered-count"],
    queryFn: () => api.fetchOrders({ limit: 1, offset: 0 }),
    staleTime: 60_000,
    enabled,
  })

  // ── Order update mutation con rollback por entidad ────────────────────
  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      // Parche optimista: actualiza la entidad en todas las páginas
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        let removedFromResult = false
        const pages = old.pages.map(page => {
          const data = page.data.flatMap((order) => {
            if (order.id !== delta.id) return [order]
            const nextOrder = { ...order, ...delta }
            if (orderMatchesActiveQuery(nextOrder, {
              filters: columnFilters,
              search: globalFilter,
              date: dateFilter,
            })) {
              return [nextOrder]
            }
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
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "orders" &&
          query.queryKey[1] === "infinite",
      })
      queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (error, _delta, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      console.error("[Orders] Failed to update order", error)
      toast.error(error instanceof Error ? error.message : "Failed to update order")
    },
  })

  // ── Order create mutation ─────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      toast.success("Order created successfully")
    },
    onError: () => {
      toast.error("Failed to create order")
    }
  })

  // ── Order delete mutation con rollback por entidad ────────────────────
  const deleteOrderMutation = useMutation({
    mutationFn: api.deleteOrder,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => {
            const hadOrder = page.data.some(o => o.id === id)
            return {
              data: page.data.filter(o => o.id !== id),
              total: hadOrder ? page.total - 1 : page.total,
            }
          })
        }
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete order")
    },
  })

  // ── Bulk delete mutation con rollback ─────────────────────────────────
  const deleteBulkOrdersMutation = useMutation({
    mutationFn: api.bulkDeleteOrdersBySelection,
    onMutate: async (selection) => {
      const selectedIds = selection.mode === "ids" ? selection.ids : []
      const idSet = new Set(selectedIds)
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey)
      queryClient.setQueryData<InfiniteData<{ data: Order[]; total: number }>>(ordersQueryKey, (old) => {
        if (!old) return old
        const deletedCount = selection.mode === "ids"
          ? selection.ids.length
          : selection.selectedCount
        return {
          ...old,
          pages: old.pages.map(page => {
            const data = selection.mode === "ids"
              ? page.data.filter(o => !idSet.has(o.id))
              : page.data.filter(o => !orderIsSelectedByOperations(o, selection.operations))
            return {
              data,
              total: Math.max(0, page.total - deletedCount),
            }
          })
        }
      })
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete orders")
    },
  })

  const { mutate: doUpdateOrder } = updateOrderMutation
  const { mutate: doDeleteOrder } = deleteOrderMutation
  const { mutateAsync: doBulkDeleteAsync } = deleteBulkOrdersMutation

  // Delta mutation helper — only sends the changed fields to the server
  const updateOrderField = useCallback((orderId: string, delta: Partial<Order>) => {
    doUpdateOrder({ id: orderId, ...delta })
  }, [doUpdateOrder])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderField(orderId, { status })
  }, [updateOrderField])

  // Handles inline cell edits with an exhaustive switch over EditableOrderField.
  // If a new field is added to the union but not handled here, TypeScript will
  // produce a compile error on the `never` assignment in the default branch.
  const handleCellChange = useCallback((orderId: string, field: EditableOrderField, value: string, isValid: boolean) => {
    let delta: Partial<Order>
    switch (field) {
      case "date": delta = { date: value }; break
      case "customer": delta = { customer: value }; break
      case "product": delta = { product: value }; break
      case "category": delta = { category: value }; break
      case "start_time": delta = { start_time: value }; break
      case "end_time": delta = { end_time: value }; break
      case "code": delta = { code: value }; break
      case "channel": delta = { channel: value }; break
      case "priority": delta = { priority: value }; break
      case "region": delta = { region: value }; break
      case "payment": delta = { payment: value }; break
      case "quantity": {
        const normalized = value.trim()
        delta = { quantity: isValid ? Number.parseInt(normalized, 10) : value }
        break
      }
      default: {
        const _exhaustive: never = field
        console.warn(`Unhandled editable field: ${_exhaustive}`)
        return
      }
    }
    updateOrderField(orderId, delta)
  }, [updateOrderField])

  const deleteOrder = useCallback((id: string) => {
    doDeleteOrder(id)
  }, [doDeleteOrder])

  const deleteBulkOrders = useCallback(async (selection: DataTableSelectionState) => {
    await doBulkDeleteAsync(selection)
  }, [doBulkDeleteAsync])

  const refreshCurrentOrderSort = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ordersQueryKey })
  }, [queryClient, ordersQueryKey])



  return {
    pageData,
    rowCount: cachedRowCount,
    isPageLoading: isPageFetching,
    // Props para infinite scroll en DataTable
    infiniteScroll: {
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      totalRowCount: cachedRowCount,
      unfilteredTotalRowCount: unfilteredCountData?.total ?? cachedRowCount,
      currentScope: {
        search: globalFilter,
        filters: columnFilters,
        date: dateFilter,
        sorting,
      },
      exportByScope: api.exportOrdersByScope,
      countBySelection: api.countOrdersBySelection,
    },

    columnFilters,
    setColumnFilters: handleSetColumnFilters,
    globalFilter,
    setGlobalFilter: handleSetGlobalFilter,
    refreshCurrentOrderSort,
    actions: {
      createOrder: createOrderMutation.mutate,
      deleteOrder,
      deleteBulkOrders,
      handleStatusChange,
      handleCellChange,
    },
    isPending: updateOrderMutation.isPending || createOrderMutation.isPending || deleteOrderMutation.isPending || deleteBulkOrdersMutation.isPending
  }
}
