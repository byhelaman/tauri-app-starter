import { useCallback, useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { type PaginationState, type ColumnFiltersState } from "@tanstack/react-table"
import { toast } from "sonner"
import * as api from "../api"
import type { Order, EditableOrderField, Status } from "../columns"
import type { QueueOrder, QueueStatus } from "../modal-columns"

export function useOrders({ defaultPageSize = 25, statsOnly = false } = {}) {
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  // Reiniciar a la primera página cuando cambian los filtros
  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }))
  }, [columnFilters, globalFilter])

  // Query ligera de estadísticas para el dashboard (obtiene todos los pedidos sin la sobrecarga de paginación)
  const { data: allOrdersData, isLoading: isAllOrdersLoading } = useQuery({
    queryKey: ["orders", "stats"],
    queryFn: () => api.fetchOrders({ limit: 1000, offset: 0 }),
    staleTime: 30_000, // Cache por 30s para evitar refetches excesivos
  })

  const orders = allOrdersData?.data ?? []
  const totalOrders = allOrdersData?.total ?? 0
  const isOrdersLoading = isAllOrdersLoading

  // Query paginada del lado del servidor para la DataTable principal
  const { data: pageResponse, isFetching: isPageFetching } = useQuery({
    queryKey: ["orders", "paginated", pagination, columnFilters, globalFilter],
    queryFn: () => api.fetchOrders({ 
      limit: pagination.pageSize, 
      offset: pagination.pageIndex * pagination.pageSize,
      search: globalFilter,
      filters: columnFilters,
    }),
    placeholderData: keepPreviousData,
    enabled: !statsOnly,
  })

  const rowCountRef = useRef(0)
  if (pageResponse?.total !== undefined) {
    rowCountRef.current = pageResponse.total
  }
  const cachedRowCount = rowCountRef.current

  const { data: queueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["queueOrders"],
    queryFn: api.fetchQueueOrders,
    enabled: !statsOnly,
  })

  const queueOrders = queueData?.data ?? []
  const totalQueueOrders = queueData?.total ?? 0

  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (updatedOrder) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => {
        return old.map(order => order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order)
      })
      return { previousOrders }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _newOrder, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to update order")
    },
  })

  const createOrderMutation = useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
      toast.success("Order created successfully")
    },
    onError: () => {
      toast.error("Failed to create order")
    }
  })

  const deleteOrderMutation = useMutation({
    mutationFn: api.deleteOrder,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => old.filter(order => order.id !== id))
      return { previousOrders }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to delete order")
    },
  })

  const deleteBulkOrdersMutation = useMutation({
    mutationFn: api.bulkDeleteOrders,
    onMutate: async (ids) => {
      const idSet = new Set(ids)
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => old.filter(order => !idSet.has(order.id)))
      return { previousOrders }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "history"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_err, _ids, context) => {
      queryClient.setQueryData(["orders"], context?.previousOrders)
      toast.error("Failed to delete orders")
    },
  })

  const updateQueueOrderMutation = useMutation({
    mutationFn: api.updateQueueOrder,
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) => {
        return old.map(order => order.code === newOrder.code ? { ...order, ...newOrder } : order)
      })
      return { previousOrders }
    },
    onError: (_err, _newOrder, context) => {
      queryClient.setQueryData(["queueOrders"], context?.previousOrders)
    },
  })

  const deleteQueueOrderMutation = useMutation({
    mutationFn: api.deleteQueueOrder,
    onMutate: async (code) => {
      await queryClient.cancelQueries({ queryKey: ["queueOrders"] })
      const previousOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"])
      queryClient.setQueryData<QueueOrder[]>(["queueOrders"], (old = []) => old.filter(order => order.code !== code))
      return { previousOrders }
    },
    onError: (_err, _code, context) => {
      queryClient.setQueryData(["queueOrders"], context?.previousOrders)
    },
  })

  const { mutate: doUpdateOrder } = updateOrderMutation
  const { mutate: doUpdateQueue } = updateQueueOrderMutation
  const { mutate: doDeleteQueue } = deleteQueueOrderMutation
  const { mutate: doDeleteOrder } = deleteOrderMutation
  const { mutate: doBulkDelete } = deleteBulkOrdersMutation

  const updateOrderById = useCallback((orderId: string, updater: (order: Order) => Order) => {
    const currentOrders = queryClient.getQueryData<Order[]>(["orders"]) || []
    const current = currentOrders.find((order) => order.id === orderId)
    if (!current) return

    const updated = updater(current)
    if (updated === current) return

    doUpdateOrder(updated)
  }, [queryClient, doUpdateOrder])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderById(orderId, (order) => ({ ...order, status }))
  }, [updateOrderById])

  const handleCellChange = useCallback((orderId: string, field: EditableOrderField, value: string, isValid: boolean) => {
    updateOrderById(orderId, (order) => {
      switch (field) {
        case "date": return { ...order, date: value }
        case "customer": return { ...order, customer: value }
        case "product": return { ...order, product: value }
        case "category": return { ...order, category: value }
        case "time": return { ...order, time: value }
        case "code": return { ...order, code: value }
        case "channel": return { ...order, channel: value }
        case "priority": return { ...order, priority: value }
        case "quantity": {
          const normalized = value.trim()
          return {
            ...order,
            quantity: isValid ? Number.parseInt(normalized, 10) : value,
          }
        }
        default: return order
      }
    })
  }, [updateOrderById])

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
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
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
