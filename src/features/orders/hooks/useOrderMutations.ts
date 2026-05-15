import { useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EditableOrderField, Order, Status } from "../tables/columns"
import type { DataTableSelectionState } from "@/components/data-table/core/data-table-types"
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

export function buildOrderFieldDelta(
  field: EditableOrderField,
  value: string,
  isValid: boolean
): Partial<Order> {
  const trimmedValue = value.trim()

  switch (field) {
    case "date": return { date: trimmedValue }
    case "customer": return { customer: trimmedValue }
    case "product": return { product: trimmedValue }
    case "category": return { category: trimmedValue }
    case "start_time": return { start_time: trimmedValue }
    case "end_time": return { end_time: trimmedValue }
    case "code": return { code: trimmedValue }
    case "channel": return { channel: trimmedValue }
    case "priority": return { priority: trimmedValue }
    case "region": return { region: trimmedValue }
    case "payment": return { payment: trimmedValue }
    case "quantity":
      return { quantity: isValid ? Number.parseInt(trimmedValue, 10) : value }
    default: {
      const _exhaustive: never = field
      console.warn(`Unhandled editable field: ${_exhaustive}`)
      return {}
    }
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

  const { mutate: mutateOrderUpdate } = updateOrderMutation
  const { mutate: mutateOrderCreate } = createOrderMutation
  const { mutate: mutateOrderDelete } = deleteOrderMutation
  const { mutateAsync: mutateBulkOrderDelete } = deleteBulkOrdersMutation

  const updateOrderField = useCallback((orderId: string, delta: Partial<Order>) => {
    mutateOrderUpdate({ id: orderId, ...delta })
  }, [mutateOrderUpdate])

  const handleStatusChange = useCallback((orderId: string, status: Status) => {
    updateOrderField(orderId, { status })
  }, [updateOrderField])

  const handleCellChange = useCallback((orderId: string, field: EditableOrderField, value: string, isValid: boolean) => {
    const delta = buildOrderFieldDelta(field, value, isValid)
    updateOrderField(orderId, delta)
  }, [updateOrderField])

  const deleteOrder = useCallback((id: string) => {
    mutateOrderDelete(id)
  }, [mutateOrderDelete])

  const deleteBulkOrders = useCallback(async (selection: DataTableSelectionState, expectedCount?: number) => {
    await mutateBulkOrderDelete({ selection, expectedCount })
  }, [mutateBulkOrderDelete])

  return {
    createOrder: mutateOrderCreate,
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
