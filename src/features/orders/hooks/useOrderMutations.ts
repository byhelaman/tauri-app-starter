import { useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EditableOrderField, Order, Status } from "../columns"
import type { DataTableSelectionState } from "@/components/data-table/data-table-types"
import * as api from "../api"
import {
  applyOptimisticBulkDelete,
  applyOptimisticOrderDelete,
  applyOptimisticOrderUpdate,
  type OrdersInfiniteData,
} from "./orders-cache"

interface UseOrderMutationsOptions {
  ordersQueryKey: readonly unknown[]
  activeQuery: {
    filters: import("@tanstack/react-table").ColumnFiltersState
    search?: string
    date?: string
  }
}

export function useOrderMutations({
  ordersQueryKey,
  activeQuery,
}: UseOrderMutationsOptions) {
  const queryClient = useQueryClient()

  const updateOrderMutation = useMutation({
    mutationFn: api.updateOrder,
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<OrdersInfiniteData>(ordersQueryKey)
      queryClient.setQueryData<OrdersInfiniteData>(ordersQueryKey, (old) =>
        applyOptimisticOrderUpdate(old, delta, activeQuery)
      )
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

  const deleteOrderMutation = useMutation({
    mutationFn: api.deleteOrder,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<OrdersInfiniteData>(ordersQueryKey)
      queryClient.setQueryData<OrdersInfiniteData>(ordersQueryKey, (old) =>
        applyOptimisticOrderDelete(old, id)
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete order")
    },
  })

  const deleteBulkOrdersMutation = useMutation({
    mutationFn: ({ selection, expectedCount }: { selection: DataTableSelectionState; expectedCount?: number }) =>
      api.bulkDeleteOrdersBySelection(selection, expectedCount),
    onMutate: async ({ selection }) => {
      await queryClient.cancelQueries({ queryKey: ordersQueryKey })
      const previous = queryClient.getQueryData<OrdersInfiniteData>(ordersQueryKey)
      queryClient.setQueryData<OrdersInfiniteData>(ordersQueryKey, (old) =>
        applyOptimisticBulkDelete(old, selection)
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard", "history"] })
    },
    onError: (_error, _request, context) => {
      if (context?.previous) queryClient.setQueryData(ordersQueryKey, context.previous)
      toast.error("Failed to delete orders")
    },
  })

  const updateOrderField = useCallback((orderId: string, delta: Partial<Order>) => {
    updateOrderMutation.mutate({ id: orderId, ...delta })
  }, [updateOrderMutation])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderField(orderId, { status })
  }, [updateOrderField])

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
    deleteOrderMutation.mutate(id)
  }, [deleteOrderMutation])

  const deleteBulkOrders = useCallback(async (selection: DataTableSelectionState, expectedCount?: number) => {
    await deleteBulkOrdersMutation.mutateAsync({ selection, expectedCount })
  }, [deleteBulkOrdersMutation])

  return {
    createOrder: createOrderMutation.mutate,
    deleteOrder,
    deleteBulkOrders,
    handleStatusChange,
    handleCellChange,
    isPending:
      updateOrderMutation.isPending ||
      createOrderMutation.isPending ||
      deleteOrderMutation.isPending ||
      deleteBulkOrdersMutation.isPending,
  }
}
