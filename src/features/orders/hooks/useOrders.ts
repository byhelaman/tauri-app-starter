import { useCallback, useState } from "react"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { type PaginationState, type ColumnFiltersState, type Updater } from "@tanstack/react-table"
import { toast } from "sonner"
import * as api from "../api"
import type { Order, EditableOrderField, Status } from "../columns"
import type { QueueOrder, QueueStatus } from "../modal-columns"
// TODO: Uncomment when Supabase tables are ready
// import { useOrdersRealtime } from "./useOrdersRealtime"

export function useOrders({ defaultPageSize = 25, statsOnly = false, dateFilter }: { defaultPageSize?: number, statsOnly?: boolean, dateFilter?: string } = {}) {
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  // Reset page index when filters change to avoid showing an empty page.
  // Accepts Updater<T> (value or function) to match TanStack Table's OnChangeFn.
  const handleSetColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      setPagination(p => p.pageIndex === 0 ? p : { ...p, pageIndex: 0 })
      return next
    })
  }, [])

  const handleSetGlobalFilter = useCallback((updater: Updater<string>) => {
    setGlobalFilter(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      setPagination(p => p.pageIndex === 0 ? p : { ...p, pageIndex: 0 })
      return next
    })
  }, [])

  // TODO: Replace with a server-side aggregate query (SELECT COUNT, SUM, etc.)
  // when migrating to Supabase. Fetching all rows just to compute dashboard
  // stats is wasteful and won't scale beyond a few thousand orders.
  const { data: allOrdersData, isLoading: isAllOrdersLoading } = useQuery({
    queryKey: ["orders", "stats"],
    queryFn: () => api.fetchOrders({ limit: 1000, offset: 0 }),
    staleTime: 30_000,
  })

  const orders = allOrdersData?.data ?? []
  const totalOrders = allOrdersData?.total ?? 0
  const isOrdersLoading = isAllOrdersLoading

  // Stable reference for the current paginated query key
  const paginatedQueryKey = ["orders", "paginated", pagination, columnFilters, globalFilter, dateFilter]

  // Server-side paginated query for the main DataTable
  const { data: pageResponse, isFetching: isPageFetching } = useQuery({
    queryKey: paginatedQueryKey,
    queryFn: () => api.fetchOrders({
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      search: globalFilter,
      filters: columnFilters,
      date: dateFilter,
    }),
    placeholderData: keepPreviousData,
    enabled: !statsOnly,
  })

  const cachedRowCount = pageResponse?.total ?? 0

  // TODO: Activate realtime subscription when Supabase tables are ready
  // useOrdersRealtime()

  const { data: queueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["queueOrders"],
    queryFn: api.fetchQueueOrders,
    enabled: !statsOnly,
  })

  const queueOrders = queueData?.data ?? []
  const totalQueueOrders = queueData?.total ?? 0

  // ── Order update mutation with entity-level rollback ──────────────────
  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (delta) => {
      // Cancel only the paginated query — not stats or history
      const queryKey = [...paginatedQueryKey]
      await queryClient.cancelQueries({ queryKey })

      // Save ONLY the affected entity for surgical rollback
      const previousPage = queryClient.getQueryData<{ data: Order[], total: number }>(queryKey)
      const previousOrder = previousPage?.data.find(o => o.id === delta.id)

      // Optimistic patch
      queryClient.setQueryData<{ data: Order[], total: number }>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(o => o.id === delta.id ? { ...o, ...delta } : o)
        }
      })

      return { previousOrder, queryKey }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "stats"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, delta, context) => {
      // Rollback only the single entity that failed — other concurrent
      // changes from realtime or other mutations remain untouched
      if (!context?.previousOrder || !context?.queryKey) return
      queryClient.setQueryData<{ data: Order[], total: number }>(context.queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(o => o.id === delta.id ? context.previousOrder! : o)
        }
      })
      toast.error("Failed to update order")
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

  // ── Order delete mutation with entity-level rollback ──────────────────
  const deleteOrderMutation = useMutation({
    mutationFn: api.deleteOrder,
    onMutate: async (id) => {
      const queryKey = [...paginatedQueryKey]
      await queryClient.cancelQueries({ queryKey })

      const previousPage = queryClient.getQueryData<{ data: Order[], total: number }>(queryKey)
      const deletedOrder = previousPage?.data.find(o => o.id === id)

      queryClient.setQueryData<{ data: Order[], total: number }>(queryKey, (old) => {
        if (!old) return old
        return { ...old, data: old.data.filter(o => o.id !== id) }
      })

      return { deletedOrder, queryKey }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _id, context) => {
      if (!context?.deletedOrder || !context?.queryKey) return
      queryClient.setQueryData<{ data: Order[], total: number }>(context.queryKey, (old) => {
        if (!old) return old
        return { ...old, data: [...old.data, context.deletedOrder!] }
      })
      toast.error("Failed to delete order")
    },
  })

  // ── Bulk delete mutation with entity-level rollback ───────────────────
  const deleteBulkOrdersMutation = useMutation({
    mutationFn: api.bulkDeleteOrders,
    onMutate: async (ids) => {
      const idSet = new Set(ids)
      const queryKey = [...paginatedQueryKey]
      await queryClient.cancelQueries({ queryKey })

      const previousPage = queryClient.getQueryData<{ data: Order[], total: number }>(queryKey)
      const deletedOrders = previousPage?.data.filter(o => idSet.has(o.id)) ?? []

      queryClient.setQueryData<{ data: Order[], total: number }>(queryKey, (old) => {
        if (!old) return old
        return { ...old, data: old.data.filter(o => !idSet.has(o.id)) }
      })

      return { deletedOrders, queryKey }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _ids, context) => {
      if (!context?.deletedOrders?.length || !context?.queryKey) return
      queryClient.setQueryData<{ data: Order[], total: number }>(context.queryKey, (old) => {
        if (!old) return old
        return { ...old, data: [...old.data, ...context.deletedOrders] }
      })
      toast.error("Failed to delete orders")
    },
  })

  // ── Queue order update mutation with entity-level rollback ────────────
  const updateQueueOrderMutation = useMutation({
    mutationFn: api.updateQueueOrder,
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrder = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
        ?.find(o => o.code === delta.code)
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.map(o => o.code === delta.code ? { ...o, ...delta } : o)
      )
      return { previousOrder }
    },
    onError: (_err, delta, context) => {
      if (!context?.previousOrder) return
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.map(o => o.code === delta.code ? context.previousOrder! : o)
      )
    },
  })

  // ── Queue order delete mutation with entity-level rollback ────────────
  const deleteQueueOrderMutation = useMutation({
    mutationFn: api.deleteQueueOrder,
    onMutate: async (code) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrder = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
        ?.find(o => o.code === code)
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        old.filter(order => order.code !== code)
      )
      return { previousOrder }
    },
    onError: (_err, _code, context) => {
      if (!context?.previousOrder) return
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) =>
        [...old, context.previousOrder!]
      )
    },
  })

  const { mutate: doUpdateOrder } = updateOrderMutation
  const { mutate: doUpdateQueue } = updateQueueOrderMutation
  const { mutate: doDeleteQueue } = deleteQueueOrderMutation
  const { mutate: doDeleteOrder } = deleteOrderMutation
  const { mutate: doBulkDelete } = deleteBulkOrdersMutation

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

  const handleQueueStatusChange = useCallback((code: string, status: QueueStatus) => {
    doUpdateQueue({ code, status })
  }, [doUpdateQueue])

  const handleQueuePriorityToggle = useCallback((code: string) => {
    const currentOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"]) || []
    const order = currentOrders.find(o => o.code === code)
    if (order) {
      doUpdateQueue({ code, priority: !order.priority })
    }
  }, [queryClient, doUpdateQueue])

  const handleQueueRemove = useCallback((code: string) => {
    doDeleteQueue(code)
    toast.success("Removed from queue")
  }, [doDeleteQueue])

  const deleteOrder = useCallback((id: string) => {
    doDeleteOrder(id)
  }, [doDeleteOrder])

  const deleteBulkOrders = useCallback((ids: string[]) => {
    doBulkDelete(ids)
  }, [doBulkDelete])

  return {
    orders,
    isOrdersLoading,
    totalOrders,
    pageData: pageResponse?.data ?? [],
    rowCount: cachedRowCount,
    isPageLoading: isPageFetching,
    pagination,
    setPagination,
    columnFilters,
    setColumnFilters: handleSetColumnFilters,
    globalFilter,
    setGlobalFilter: handleSetGlobalFilter,
    queueOrders,
    totalQueueOrders,
    isQueueLoading,
    actions: {
      createOrder: createOrderMutation.mutate,
      deleteOrder,
      deleteBulkOrders,
      handleStatusChange,
      handleCellChange,
      handleQueueStatusChange,
      handleQueuePriorityToggle,
      handleQueueRemove,
    },
    isPending: updateOrderMutation.isPending || createOrderMutation.isPending || deleteOrderMutation.isPending || deleteBulkOrdersMutation.isPending
  }
}
