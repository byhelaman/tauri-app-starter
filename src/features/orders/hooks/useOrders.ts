import { useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import * as api from "../api"
import type { Order, EditableOrderField, Status } from "../columns"
import type { QueueOrder, QueueStatus } from "../modal-columns"

export function useOrders() {
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading: isOrdersLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: api.fetchOrders,
  })

  const { data: queueOrders = [], isLoading: isQueueLoading } = useQuery({
    queryKey: ["queueOrders"],
    queryFn: api.fetchQueueOrders,
  })

  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] })
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"])
      queryClient.setQueryData<Order[]>(["orders"], (old = []) => {
        return old.map(order => order.id === newOrder.id ? { ...order, ...newOrder } : order)
      })
      return { previousOrders }
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

  const updateOrderById = useCallback((orderId: string, updater: (order: Order) => Order) => {
    const currentOrders = queryClient.getQueryData<Order[]>(["orders"]) || []
    const current = currentOrders.find((order) => order.id === orderId)
    if (!current) return

    const updated = updater(current)
    if (updated === current) return

    updateOrderMutation.mutate(updated)
  }, [queryClient, updateOrderMutation])

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
    updateQueueOrderMutation.mutate({ code, status })
  }, [updateQueueOrderMutation])

  const handleQueuePriorityToggle = useCallback((code: string) => {
    const currentOrders = queryClient.getQueryData<QueueOrder[]>(["queueOrders"]) || []
    const order = currentOrders.find(o => o.code === code)
    if (order) {
      updateQueueOrderMutation.mutate({ code, priority: !order.priority })
    }
  }, [queryClient, updateQueueOrderMutation])

  const handleQueueRemove = useCallback((code: string) => {
    deleteQueueOrderMutation.mutate(code)
    toast.success("Removed from queue")
  }, [deleteQueueOrderMutation])

  const deleteOrder = useCallback((id: string) => {
    deleteOrderMutation.mutate(id)
  }, [deleteOrderMutation])

  const deleteBulkOrders = useCallback((ids: string[]) => {
    deleteBulkOrdersMutation.mutate(ids)
  }, [deleteBulkOrdersMutation])

  return {
    orders,
    isOrdersLoading,
    queueOrders,
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
